import { randomUUID } from 'node:crypto';
import { HttpError } from '../http/errors.js';
import { manilaDayStart } from '../limits.js';
import { costOf, estimateTokens, priceOf } from './pricing.js';

// The cached balance is a routing hint only. PostgreSQL reservations are the
// enforcement point shared by every serverless instance. Unknown prices and an
// unavailable reservation ledger fail closed before a paid provider call.
export function createBudget({ store, config, logger, kind = 'reasoning', now = () => Date.now(), cacheMs = 30_000 }) {
  // Legacy compatibility for tests and older callers only. Production runtime
  // no longer creates this USD budget; provider dashboards own spend controls.
  const b = (kind === 'image' ? config.images?.budget : config.ai.routing?.budget)
    || { dailyUsd: null, weeklyUsd: null, monthlyUsd: null, maxRequestUsd: null };
  const spentSince = kind === 'image'
    ? (since) => store.imageCostSince(since)
    : async (since) => (await store.costSince(since)) - (await store.imageCostSince(since).catch(() => 0));
  let cache = { at: -Infinity, value: null };

  async function remaining() {
    if (now() - cache.at < cacheMs && cache.value) return cache.value;
    const t = now();
    const periods = [
      ['daily', b.dailyUsd, manilaDayStart(t)],
      ['weekly', b.weeklyUsd, new Date(t - 7 * 86400_000)],
      ['monthly', b.monthlyUsd, new Date(t - 30 * 86400_000)]
    ].filter(([, limit]) => limit !== null);
    let value;
    try {
      let left = Infinity; let limitedBy = null;
      for (const [name, limit, since] of periods) {
        const spent = await spentSince(since);
        if (limit - spent < left) { left = limit - spent; limitedBy = name; }
      }
      value = { usd: Math.max(0, left), limitedBy, unknown: false };
    } catch (err) {
      logger.warn('spend could not be read; only the cheapest level is allowed', { error: err.message });
      value = { usd: 0, limitedBy: 'unknown', unknown: true };
    }
    cache = { at: now(), value };
    return value;
  }

  async function reserveSpend({ caller, amountUsd, maxRequestUsd = null }) {
    if (!caller?.tenantId || !caller?.actor?.type || !caller?.actor?.id
        || !Number.isFinite(amountUsd) || amountUsd < 0.000001
        || !store.reserveGlobalSpend) {
      throw new HttpError(503, 'budget_unavailable', 'NasrinAI cannot verify its spending limit right now. Please try again later.', { retryAfter: 600 });
    }
    const reservationId = randomUUID();
    let result;
    try {
      result = await store.reserveGlobalSpend({
        reservationId, kind, tenantId: caller.tenantId, actorType: caller.actor.type, actorId: caller.actor.id,
        reservedUsd: Math.round(amountUsd * 1e6) / 1e6,
        dailyLimit: b.dailyUsd, weeklyLimit: b.weeklyUsd, monthlyLimit: b.monthlyUsd, maxRequestUsd
      });
    } catch (err) {
      logger.error('global USD reservation failed', { kind, error: err.message });
      throw new HttpError(503, 'budget_unavailable', 'NasrinAI cannot verify its spending limit right now. Please try again later.', { retryAfter: 600 });
    }
    if (!result?.allowed || result.reservationId !== reservationId) {
      // daily_budget | weekly_budget | monthly_budget | request_limit: a real
      // limit. Anything else (invalid input, wrong id) is an infrastructure fault.
      const reason = String(result?.reason || '');
      const limit = /^(daily_budget|weekly_budget|monthly_budget|request_limit)$/.test(reason);
      logger.warn(limit ? 'USD budget limit reached' : 'USD reservation refused unexpectedly', { kind, reason: reason.slice(0, 40) });
      if (!limit) throw new HttpError(503, 'budget_unavailable', 'NasrinAI cannot verify its spending limit right now. Please try again later.', { retryAfter: 600 });
      throw new HttpError(503, 'budget_reached', 'NasrinAI has reached its spending limit for now. Please try again later.', { retryAfter: 600 });
    }
    if (cache.value && !cache.value.unknown && Number.isFinite(cache.value.usd)) {
      cache.value = { ...cache.value, usd: Math.max(0, cache.value.usd - amountUsd) };
    }
    return { id: reservationId, kind, reservedUsd: Math.round(amountUsd * 1e6) / 1e6 };
  }

  async function settleSpend(reservation, actualUsd) {
    if (!reservation?.id || !Number.isFinite(actualUsd) || actualUsd < 0 || !store.settleGlobalSpendReservation) {
      throw new HttpError(503, 'budget_reached', 'NasrinAI could not reconcile provider spending. Please try again later.', { retryAfter: 600 });
    }
    const actual = Math.round(actualUsd * 1e6) / 1e6;
    let ok;
    try { ok = await store.settleGlobalSpendReservation({ reservationId: reservation.id, actualUsd: actual }); }
    catch (err) {
      logger.error('global USD settlement failed; reservation remains held', { kind, error: err.message });
      throw new HttpError(503, 'budget_reached', 'NasrinAI could not reconcile provider spending. Please try again later.', { retryAfter: 600 });
    }
    if (!ok) throw new HttpError(503, 'budget_reached', 'NasrinAI could not reconcile provider spending. Please try again later.', { retryAfter: 600 });
    if (cache.value && !cache.value.unknown && Number.isFinite(cache.value.usd)) {
      cache.value = { ...cache.value, usd: Math.max(0, cache.value.usd + reservation.reservedUsd - actual) };
    }
    return actual;
  }

  // Correct a previously settled conservative estimate using a provider's
  // authoritative final usage cost. The database RPC only permits one change
  // from the expected estimate and is idempotent for the same final amount.
  async function reconcileSpend(reservation, actualUsd) {
    if (!reservation?.id || !Number.isFinite(actualUsd) || actualUsd < 0 || actualUsd > 100000
        || !Number.isFinite(reservation.reservedUsd) || reservation.reservedUsd < 0
        || !store.reconcileGlobalSpendReservation) {
      throw new HttpError(503, 'budget_reconciliation_unavailable', 'NasrinAI could not reconcile final provider spending safely.', { retryAfter: 600 });
    }
    const expectedUsd = Math.round(reservation.reservedUsd * 1e6) / 1e6;
    const actual = Math.round(actualUsd * 1e6) / 1e6;
    let ok;
    try {
      ok = await store.reconcileGlobalSpendReservation({ reservationId: reservation.id, expectedUsd, actualUsd: actual });
    } catch (err) {
      logger.error('global USD reconciliation failed; final provider cost remains pending', { kind, error: err.message });
      throw new HttpError(503, 'budget_reconciliation_unavailable', 'NasrinAI could not reconcile final provider spending safely.', { retryAfter: 600 });
    }
    if (!ok) throw new HttpError(503, 'budget_reconciliation_conflict', 'Final provider cost did not match the expected spend reservation.', { retryAfter: 600 });
    // A repeated idempotent reconciliation must not apply the cache delta
    // twice. Invalidate this routing hint and let the next read use the ledger.
    cache = { at: -Infinity, value: null };
    return actual;
  }

  async function releaseSpend(reservation) {
    if (!reservation?.id || !store.releaseGlobalSpendReservation) {
      throw new HttpError(503, 'budget_reached', 'NasrinAI could not release its spending reservation safely. Please try again later.', { retryAfter: 600 });
    }
    let ok;
    try { ok = await store.releaseGlobalSpendReservation({ reservationId: reservation.id }); }
    catch (err) {
      logger.error('global USD release failed; reservation remains held', { kind, error: err.message });
      throw new HttpError(503, 'budget_reached', 'NasrinAI could not release its spending reservation safely. Please try again later.', { retryAfter: 600 });
    }
    if (!ok) throw new HttpError(503, 'budget_reached', 'NasrinAI could not release its spending reservation safely. Please try again later.', { retryAfter: 600 });
    if (cache.value && !cache.value.unknown && Number.isFinite(cache.value.usd)) {
      cache.value = { ...cache.value, usd: Math.max(0, cache.value.usd + reservation.reservedUsd) };
    }
  }

  return {
    remaining,
    maxRequestUsd: b.maxRequestUsd ?? null,
    reserveSpend,
    settleSpend,
    reconcileSpend,
    releaseSpend,
    // Retained for separately metered tools while they are migrated to
    // reservations. This only updates the local routing hint, never the ledger.
    spend(usd) {
      if (cache.value && Number.isFinite(usd) && cache.value.usd !== Infinity) {
        cache.value = { ...cache.value, usd: Math.max(0, cache.value.usd - usd) };
      }
    }
  };
}

// Injected into the router for each authenticated request. The router invokes
// this separately for each actual provider attempt, including failover.
// Provider billing is authoritative. The application does not maintain per-model
// price snapshots or reserve estimated USD for model calls. Provider-reported
// costs are recorded when the adapter supplies them; otherwise cost remains
// unknown (null), never fabricated from a local rate table.
export function createProviderSpendHooks({ budget, config, prices, caller, tier }) {
  return {
    async reserve({ provider, model }) {
      if (provider === 'fake' && !config.isProduction) return null;
      return { provider, model, providerBilling: true };
    },
    async settle(reservation, result) {
      if (!reservation) return { costUsd: null, spendReservationId: null };
      const raw = result?.actualCostUsd ?? result?.costUsd;
      const costUsd = Number.isFinite(raw) && raw >= 0 && raw <= 100000 ? raw : null;
      return { costUsd, spendReservationId: null };
    },
    async release() {
      // No application-side USD reservation was made.
    }
  };
}
