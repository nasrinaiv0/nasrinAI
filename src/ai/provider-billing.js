import { HttpError } from '../http/errors.js';
import { ProviderError } from './provider.js';

// Per provider attempt (the router calls these for every real call, including
// failover). Provider-reported cost is authoritative for reporting. When a USD
// budget is configured, each paid attempt first holds AI_BUDGET_RESERVE_USD in
// the shared PostgreSQL ledger (atomic daily/weekly/monthly limits across every
// serverless instance), then settles to the provider's reported cost, or keeps
// the hold when the cost is unknown. Free models never hold budget.
export function createProviderSpendHooks({ config, budget = null, caller = null }) {
  const b = config?.ai?.routing?.budget;
  const enforced = Boolean(budget && b?.enforced && caller);
  const freeModels = config?.ai?.routing?.freeModels || {};
  const isFree = (provider, model) => /:free$/i.test(String(model || ''))
    || (Array.isArray(freeModels[provider]) && freeModels[provider].includes(model));
  const reported = (result) => {
    const raw = result?.actualCostUsd ?? result?.costUsd;
    return Number.isFinite(raw) && raw >= 0 && raw <= 100000 ? raw : null;
  };
  return {
    async reserve({ provider, model }) {
      if (provider === 'fake' && !config?.isProduction) return null;
      if (!enforced || isFree(provider, model)) return { provider, model, providerBilling: true, hold: null };
      const hold = await budget.reserveSpend({ caller, amountUsd: b.reserveUsd, maxRequestUsd: b.requestLimitEnabled ? b.maxRequestUsd : null });
      return { provider, model, providerBilling: true, hold };
    },
    // result: the provider's answer, or null when the call failed (err says how).
    async settle(reservation, result, err = null) {
      if (!reservation) return { costUsd: null, spendReservationId: null };
      const costUsd = reported(result);
      if (!reservation.hold) return { costUsd, spendReservationId: null };
      if (!result) {
        // A provider that answered with an error status did not do the work:
        // release. A timeout or an unclear failure may have cost money: keep the hold.
        const answered = err instanceof ProviderError && Number.isInteger(err.status) && err.kind !== 'timeout';
        if (answered) await budget.releaseSpend(reservation.hold);
        else await budget.settleSpend(reservation.hold, reservation.hold.reservedUsd);
        return { costUsd: null, spendReservationId: reservation.hold.id };
      }
      await budget.settleSpend(reservation.hold, costUsd ?? reservation.hold.reservedUsd);
      return { costUsd, spendReservationId: reservation.hold.id };
    },
    async release(reservation) {
      if (reservation?.hold) await budget.releaseSpend(reservation.hold);
    }
  };
}

export const budgetUnavailable = () => new HttpError(503, 'budget_unavailable', 'NasrinAI cannot verify its spending limit right now. Please try again later.', { retryAfter: 600 });
