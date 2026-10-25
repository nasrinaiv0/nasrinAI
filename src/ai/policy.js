import { createHash } from 'node:crypto';
import { ProviderError } from './provider.js';
import { classify } from './classify.js';
import { estimateTokens } from './token-estimate.js';
import { redactForProvider } from './redact.js';
import { HttpError } from '../http/errors.js';
import { prioritizeOpenRouterCandidates } from './openrouter-catalog.js';
import { isOpenRouterChatCandidateEligible } from './openrouter-runtime-eligibility.js';

// The routing policy (Phase 4.1), between chat and the router:
//
//   classify -> level within the tier's range -> privacy/capability checks -> call -> validate -> bounded escalation
//
// Candidates per level come from config (ROUTE_LEVEL_n). Provider accounts own
// their billing and pricing; local price snapshots must never block model routing.

const RETRYABLE = new Set(['unavailable', 'timeout', 'busy']);
const EFFORT_FACTOR = { none: 0, minimal: 0.25, low: 0.5, medium: 1, high: 2, xhigh: 3, max: 4 };

export function createPolicy({ config, provider, logger, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), retryWaitMs = 1500, failureCooldownMs = 30_000 }) {
  const r = config.ai.routing;
  const cache = new Map();   // key -> { at, value }
  // Brief per-model circuit breaker: after a transient outage, avoid paying the
  // same timeout/429 penalty on every request while preserving automatic retry
  // once the cooldown expires. Model-specific keys keep healthy routes usable.
  const failureCooldowns = new Map(); // provider:model:effort -> epoch ms

  const capsOf = (spec) => (provider.capsOf ? provider.capsOf(spec.provider) : provider.capabilities());


  // Why a candidate cannot be used for this request, or null if it can.
  function blocker(spec, { sensitive, attachments, inputTokens, level, left, minOut = 0, reqToolsCount = 0, tier, task }) {
    const c = capsOf(spec);
    if (!c) return 'not configured';
    // Claude is allowed wherever the owner put it: in a ROUTE_LEVEL_n list (any
    // tier, any task) or in the Max/Ultra coding lane. With no ROUTE_LEVEL_n
    // naming it, the defaults never route to it. It still has to pass privacy
    // and capability checks below.
    if (sensitive && c.trainsOnData) return 'private data must not go to a service that trains on it';
    if (attachments.some((a) => a.kind === 'pdf') && c.pdf === false) return 'cannot read PDFs';
    if (attachments.some((a) => a.kind === 'image') && c.vision === false) return 'cannot see photos';
    if (attachments.length && c.pdf === false) return 'cannot read attachments';
    if (reqToolsCount > 0 && c.tools === false) return 'does not support tools';
    return null;
  }

  return {
    // Provider invoices, not local model-price estimates, are the source of cost truth.
    budgetLeft: async () => ({ usd: Infinity, limitedBy: null, unknown: false }),
    spent: () => {},
    maxRequestUsd: null,

    // What the message needs and where it may go. tier: nasrinai | pro | max | ultra.
    plan({ tier, paidQuick = false, message, history = [], attachments = [] }) {
      const c = classify({ message, history, attachments });
      const [lo, hi] = r.tierRange[tier] || r.tierRange.nasrinai;
      const level = Math.min(hi, Math.max(lo, c.level));
      const text = [message, ...history.slice(-6).map((m) => m.content)].join('\n');
      const sensitive = attachments.length > 0 || redactForProvider(text) !== text;
      return { tier, paidQuick: tier === 'nasrinai' && paidQuick === true, task: c.task, wanted: c.level, level, floor: lo, ceiling: hi, reasons: c.reasons, sensitive,
        historyChars: r.historyChars[level], maxTokens: r.maxTokens[level] };
    },

    // Safe to reuse an earlier answer? Only a first, public, simple question,
    // or (CACHE_CODING) a first coding question at any level. Per business: an
    // answer is never shared across businesses. `variant` separates answers that
    // differ in who or how they were made (coding: the person, the plan tier, the page markup).
    cacheKey(plan, { history, attachments, message, tenantId = '', variant = '' }) {
      const coding = r.cacheCoding === true && (plan.task === 'coding' || plan.task === 'debugging');
      if (!r.cacheMinutes || plan.sensitive || attachments.length || history.length > 1 || (plan.level > 2 && !coding)) return null;
      const day = new Date(now()).toISOString().slice(0, 10);
      return createHash('sha256').update([tenantId, day, plan.level, variant, String(message).trim().toLowerCase().replace(/\s+/g, ' ')].join('|')).digest('hex');
    },
    cached(key) {
      const hit = key && cache.get(key);
      if (!hit || now() - hit.at > r.cacheMinutes * 60_000) return null;
      return hit.value;
    },
    remember(key, value) {
      if (!key) return;
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(key, { at: now(), value });
    },

    // Runs the request. `req` is what the router takes, minus route/maxTokens.
    // `onFailure(entry)` is told about each attempt that did not produce the
    // answer (for usage records). Resolves { result, spec, level, escalated, costUsd }.
    async run(plan, req, { onFailure = async () => {}, reserveTokens = null, settleTokens = null, caller = null } = {}) {
      // `minTokens`: a request for a file or long document may use more reply tokens than its level allows.
      const { minTokens = 0, maxTokens: requestedMaxTokens = null, excludeModels = [], ...modelReq } = req;
      const excluded = new Set(Array.isArray(excludeModels) ? excludeModels.map((x) => String(x)) : []);
      req = modelReq;
      const attachments = req.attachments || [];
      const inputTokens = estimateTokens(req.system) + req.messages.reduce((n, m) => n + estimateTokens(m.content || ''), 0)
        + (req.tools?.length ? estimateTokens(JSON.stringify(req.tools)) : 0)
        // Images/audio attachments can consume tokens even though their binary
        // payload is not ordinary text; reserve a conservative allowance per file.
        + attachments.reduce((n, a) => n + (a.kind === 'image' ? 8192 : a.kind === 'pdf' ? 16000 : 4000), 0);
      // Provider accounts own pricing and billing. Local USD snapshots are
      // reporting estimates only and never gate routing or model selection.
      let left = { usd: Infinity, limitedBy: null, unknown: false };
      let level = plan.level;
      let escalations = 0;
      let calls = 0;   // model calls made so far that failed, counting any failover the router made itself
      const tried = new Set();
      let lastFailed = null;   // { spec, level } of a retryable failure, for one same-model retry
      let sameRetried = false;
      // Live catalog candidates extend paid-tier routing without changing the
      // Quick/guest allowlist. Failure to read the catalog must not block static
      // configured routes.
      let liveOpenRouterModels = [];
      // Discover live OpenRouter text-capable models for every tier. Guest/Quick
      // are filtered to :free IDs below, while paid tiers may use the broader list.
      if (typeof provider.listModelsForTask === 'function') {
        try {
          liveOpenRouterModels = await provider.listModelsForTask('openrouter', {
            task: plan.task,
            requiresTools: Array.isArray(req.tools) && req.tools.length > 0,
            attachments
          });
        } catch (catalogError) {
          logger.warn('OpenRouter live model discovery failed; using configured routes', {
            task: plan.task, error: catalogError?.message || 'unknown'
          });
        }
      }

      for (;;) {
        // The cheapest usable candidate at this level, else lower levels (downgrade).
        let spec = null; let at = level; const why = [];
        for (let l = level; l >= plan.floor && !spec; l--) {
          const candidates = [];
          const tierCandidates = r.levels[l];
          // New live-listed text models become eligible fallbacks at the selected
          // level. They remain subject to tier ceiling, privacy, and retry limits.
          const configuredOpenRouterIds = new Set((tierCandidates || [])
            .filter((candidate) => candidate.provider === 'openrouter')
            .map((candidate) => candidate.model));
          const dynamicOpenRouterCandidates = liveOpenRouterModels
            .filter((model) => !configuredOpenRouterIds.has(model))
            .map((model) => ({ provider: 'openrouter', model, effort: null }));
          // Try live-discovered candidates before the static shortlist so
          // bounded retries do not starve newly listed models behind stale IDs.
          // Task prioritization still orders the full eligible candidate set.
          const configuredFreeProviderCandidates = plan.tier === 'nasrinai' && plan.paidQuick !== true
            ? (config.ai.freeProviders || [])
              .filter((p) => p.id !== 'openrouter' && Array.isArray(p.freeModels) && p.freeModels.includes(p.model))
              .flatMap((p) => (r.freeModels?.[p.id] || []).map((model) => ({ provider: p.id, model, effort: null })))
            : [];
          const expandedTierCandidates = [...dynamicOpenRouterCandidates, ...tierCandidates, ...configuredFreeProviderCandidates];
          // Enforce plan eligibility before ranking or trying any candidate.
          // Guest/free Quick may use any explicitly free OpenRouter model; GPT-6
          // Luna is the sole paid-model escape hatch and is ordered after every
          // free candidate. Paid subscriptions (including separately paid Quick)
          // must never consume OpenRouter's free endpoints, even for simple chat.
          const freeQuick = plan.tier === 'nasrinai' && plan.paidQuick !== true;
          const paidQuick = plan.tier === 'nasrinai' && plan.paidQuick === true;
          const eligibleCandidates = expandedTierCandidates.filter((candidate) => {
            // Free Quick is OpenRouter-free-first. Direct free-provider fallbacks
            // remain eligible only after OpenRouter free models fail.
            if (candidate.provider !== 'openrouter') {
              if (freeQuick) return !r.quickNemotronOnly || (r.freeModels?.[candidate.provider] || []).includes(candidate.model);
              // Paid Quick is intentionally OpenRouter-only: its entitlement buys
              // access to non-free OpenRouter models, never unrelated provider routes.
              if (paidQuick) return false;
              return true;
            }
            // Preserve the existing legacy/dynamic chat route policy, while
            // enforcing the approved registry for any model ID it recognizes.
            // Specialized endpoints and inferred IDs never enter chat completion.
            return isOpenRouterChatCandidateEligible({
              modelId: candidate.model,
              tier: plan.tier,
              paidQuick: plan.paidQuick,
              task: plan.task,
              verifiedIds: liveOpenRouterModels
            }) && (!(r.quickNemotronOnly && freeQuick)
              || (freeQuick && /:free$/i.test(candidate.model))
              || (freeQuick && candidate.model === 'openai/gpt-6-luna')
              || (paidQuick && !/:free$/i.test(candidate.model));
          });
          const prioritized = prioritizeOpenRouterCandidates(plan.task, eligibleCandidates);
          const directFreeCandidates = prioritized.filter((candidate) => candidate.provider !== 'openrouter'
            && (r.freeModels?.[candidate.provider] || []).includes(candidate.model));
          const openRouterFreeCandidates = prioritized.filter((candidate) => candidate.provider === 'openrouter' && /:free$/i.test(candidate.model));
          const heavyQuickTask = plan.wanted >= 3 || ['coding', 'debugging', 'architecture', 'reasoning', 'planning', 'analysis', 'research'].includes(plan.task);
          const paidQuickCandidates = prioritized.filter((candidate) => candidate.provider === 'openrouter'
            && !/:free$/i.test(candidate.model) && candidate.model !== 'openai/gpt-6-luna');
          const ordered = r.quickNemotronOnly && freeQuick
            ? [
                // Free Quick uses OpenRouter's free catalog as primary, then
                // explicitly allowlisted direct free providers as failover.
                ...openRouterFreeCandidates,
                ...directFreeCandidates,
                // GPT-6 Luna is reserved for heavy work; it is never a routine
                // first choice and remains the last resort after free capacity.
                ...(heavyQuickTask ? prioritized.filter((candidate) => candidate.provider === 'openrouter' && candidate.model === 'openai/gpt-6-luna') : [])
              ]
            : paidQuick
              ? [
                  // Paid Quick uses only non-free OpenRouter models. The configured
                  // shortlist is ordered cheapest-first; keep Luna out of this tier.
                  ...paidQuickCandidates
                ]
              : prioritized;
          const openRouterCandidates = ordered.filter((candidate) => candidate.provider === 'openrouter');
          const otherCandidates = r.quickNemotronOnly && freeQuick
            ? ordered.filter((candidate) => candidate.provider !== 'openrouter' && (r.freeModels?.[candidate.provider] || []).includes(candidate.model))
            : ordered.filter((candidate) => candidate.provider !== 'openrouter');

          // Intent is classified and the tier's level ceiling is applied before
          // this point. Within that permitted level, configured OpenRouter models
          // are always attempted first. The dedicated Max/Ultra coding lane is a
          // fallback after OpenRouter, but before generic non-OpenRouter candidates.
          if (r.quickNemotronOnly && freeQuick) {
            candidates.push(...openRouterCandidates.filter((candidate) => /:free$/i.test(candidate.model)));
            candidates.push(...otherCandidates);
            if (plan.wanted >= 3 || ['coding', 'debugging', 'architecture', 'reasoning', 'planning', 'analysis', 'research'].includes(plan.task)) {
              candidates.push(...openRouterCandidates.filter((candidate) => candidate.model === 'openai/gpt-6-luna'));
            }
          } else if (plan.tier === 'nasrinai' && plan.paidQuick === true) {
            candidates.push(...openRouterCandidates.filter((candidate) => !/:free$/i.test(candidate.model) && candidate.model !== 'openai/gpt-6-luna'));
          } else {
            candidates.push(...openRouterCandidates);
          }
          if ((plan.task === 'coding' || plan.task === 'debugging') && l === level) {
            const codingSpec = plan.tier === 'ultra' && l >= 4
              ? (r.coding?.ultraDeep || r.coding?.ultra)
              : r.coding?.[plan.tier];
            if (!(r.quickNemotronOnly && plan.tier === 'nasrinai') && codingSpec && !candidates.some((candidate) =>
              candidate.provider === codingSpec.provider && candidate.model === codingSpec.model && candidate.effort === codingSpec.effort)) {
              candidates.push(codingSpec);
            }
          }
          candidates.push(...otherCandidates);
          for (const s of candidates) {
            const k = `${s.provider}:${s.model}:${s.effort}`;
            if (tried.has(k)) continue;
            const cooldownUntil = failureCooldowns.get(k) || 0;
            if (cooldownUntil > now()) { why.push(`${s.provider}:${s.model} (temporarily cooling down after a provider outage)`); continue; }
            if (cooldownUntil) failureCooldowns.delete(k);
            if (excluded.has(`${s.provider}:${s.model}`)) { why.push(`${s.provider}:${s.model} (already used in this planning council)`); continue; }
            const b = blocker(s, {
              sensitive: plan.sensitive, attachments, inputTokens, level: l, left, minOut: minTokens,
              reqToolsCount: Array.isArray(req.tools) ? req.tools.length : 0, tier: plan.tier, task: plan.task
            });
            if (b) { why.push(`${s.provider}:${s.model} (${b})`); continue; }
            spec = s; at = l; break;
          }
        }
        // No other model left after a brief outage: the same one once more,
        // after a short wait (bounded by MAX_RETRIES).
        if (!spec && lastFailed && !sameRetried && calls <= r.maxRetries) {
          sameRetried = true;
          spec = lastFailed.spec; at = lastFailed.level;
          logger.info('retrying the same model once', { provider: spec.provider, waitMs: retryWaitMs });
          await sleep(retryWaitMs);
        }
        if (!spec) {
          logger.warn('no model can take this request', { level, reasons: why });
          if (why.length && why.every((w) => /cannot (read|see)/.test(w))) {
            throw new HttpError(400, 'attachment_unsupported', 'NasrinAI cannot read that kind of file right now. Try another file, or remove it.');
          }
          throw new HttpError(503, 'budget_reached',
            why.some((w) => /budget|limit|unknown/.test(w))
              ? 'NasrinAI has reached its spending limit for now. Please try again later.'
              : 'NasrinAI cannot answer this right now. Please try again in a moment.', { retryAfter: 600 });
        }
        if (at < level) logger.info('downgraded to a compatible configured route', { from: level, to: at });

        const started = now();
        const normalMaxTokens = Math.max(r.maxTokens[at], minTokens);
        const boundedMaxTokens = Number.isSafeInteger(requestedMaxTokens) && requestedMaxTokens >= 64
          ? Math.min(normalMaxTokens, requestedMaxTokens) : normalMaxTokens;
        const callMaxTokens = boundedMaxTokens;
        let reservation = null;
        let result;
        try {
          reservation = reserveTokens
            ? await reserveTokens({ inputTokens, maxTokens: callMaxTokens, spec, request: req })
            : null;
          result = await provider.generate({ ...req, task: plan.task, route: spec, maxTokens: callMaxTokens, sensitive: plan.sensitive === true,
            disableFallback: r.quickNemotronOnly === true && plan.tier === 'nasrinai' && plan.paidQuick !== true });
          if (reservation && settleTokens) {
            const hasUsage = Number.isFinite(result.inputTokens) && Number.isFinite(result.outputTokens);
            const actual = hasUsage && result.fallback !== true
              ? Math.max(0, Math.round(result.inputTokens) + Math.round(result.outputTokens))
              : reservation.reservedTokens;
            await settleTokens(reservation, actual);
          }
          const configuredSpecs = [
            ...Object.values(r.levels || {}).flat(),
            ...Object.values(r.coding || {}),
            ...Object.values(config.ai.tiers || {}),
            ...(r.safeFallbacks || [])
          ].filter(Boolean);
          const matchedSpec = result.model
            ? configuredSpecs.find((candidate) => candidate.model === result.model
              && (!result.provider || result.provider === candidate.provider || result.provider === 'fake'))
            : null;
          const actualSpec = matchedSpec || (result.provider && result.provider !== 'fake' && result.model
            ? { ...spec, provider: result.provider, model: result.model, effort: result.effort ?? spec.effort }
            : spec);
          const cachedTokens = Number(result.cachedTokens) || 0;
          const costUsd = Number.isFinite(result.actualCostUsd) && result.actualCostUsd >= 0
            ? result.actualCostUsd
            : Number.isFinite(result.costUsd) && result.costUsd >= 0
              ? result.costUsd
              : null;
          const text = String(result.text || '').trim();
          const asksTools = Array.isArray(result.toolCalls) && result.toolCalls.length > 0;
          const valid = asksTools || (text.length > 0 && !(result.finishReason === 'length' && text.length < 40));
          if (valid) return { result, spec: actualSpec, level: at, escalated: escalations > 0, costUsd, cachedTokens, reservationId: reservation?.id || null, spendReservationId: result.spendReservationId || null };
          await onFailure({ spec: actualSpec, level: at, result, costUsd, latencyMs: now() - started, outcome: 'rejected_output', escalated: escalations > 0, reservationId: reservation?.id || null, spendReservationId: result.spendReservationId || null });
          // Escalate one level when the answer was empty or cut off.
          if (escalations >= r.maxEscalations || at >= plan.ceiling || left.unknown) return { result, spec: actualSpec, level: at, escalated: escalations > 0, costUsd, cachedTokens, reservationId: reservation?.id || null };
          escalations += 1;
          level = at + 1;
          left = { usd: Infinity, limitedBy: null, unknown: false };
          logger.info('escalating', { from: at, to: level, reason: text ? 'cut off' : 'empty answer' });
        } catch (err) {
          // If the provider threw after invocation, its actual consumption may be
          // unknown. Keep the full reservation charged rather than grant free retries.
          if (reservation && !result && settleTokens) await settleTokens(reservation, err?.providerNotCalled ? 0 : reservation.reservedTokens);
          if (reservation && err && typeof err === 'object') err.reservationId = reservation.id;
          if (!(err instanceof ProviderError) || !RETRYABLE.has(err.kind)) throw Object.assign(err, { level: at });
          // The router may have failed over to another provider before it gave
          // up. Those calls count against MAX_RETRIES too (1 call + MAX_RETRIES
          // more), and none of those models is tried again as a candidate.
          const attempts = err.attempts?.length ? err.attempts : [{ provider: spec.provider, model: spec.model, effort: spec.effort }];
          if (failureCooldownMs > 0) {
            const until = now() + Math.min(300_000, Math.max(1_000, failureCooldownMs));
            for (const attempt of attempts) {
              const failedKey = `${attempt.provider}:${attempt.model}:${attempt.effort ?? spec.effort}`;
              failureCooldowns.set(failedKey, until);
            }
          }
          calls += attempts.length;
          // Quick/guest may walk the explicitly free candidate pool (OpenRouter first,
          // then allowlisted free providers, then the approved emergency model).
          // Keep this bounded to candidates configured at the active level; other
          // tiers retain the normal retry cap.
          const quickOpenRouterAttemptLimit = r.quickNemotronOnly && plan.tier === 'nasrinai' && plan.paidQuick !== true
            ? Math.max(1, (r.levels[at] || []).filter((candidate) => candidate.provider === 'openrouter' || (r.freeModels?.[candidate.provider] || []).includes(candidate.model)).length)
            : r.maxRetries;
          if (calls > quickOpenRouterAttemptLimit) throw Object.assign(err, { level: at });
          // Failover: same level, next candidate (privacy and budget rules still apply).
          tried.add(`${spec.provider}:${spec.model}:${spec.effort}`);
          for (const a of attempts) tried.add(`${a.provider}:${a.model}:${a.effort}`);
          // If the router already used another provider, do not retry the same routed request again.
          lastFailed = attempts.every((a) => a.provider === spec.provider) ? { spec, level: at } : null;
          await onFailure({ spec, level: at, error: err, latencyMs: now() - started, outcome: err.kind === 'timeout' ? 'timeout' : 'provider_error', reservationId: reservation?.id || null, spendReservationId: err.spendReservationId || null });
          logger.warn('model failed, trying the next one', { kind: err.kind, provider: spec.provider });
          level = at;
        }
      }
    }
  };
}