import { HttpError } from '../http/errors.js';
import { TIER_NEEDS, rank, planName } from '../plans.js';

// The tier catalog is a product contract, not a live provider-model listing.
// Always expose Quick, Pro, Max, and Ultra. Provider/model availability is
// resolved by the router at request time, with OpenRouter preferred when set up.

export const TIERS = Object.freeze([
  { id: 'nasrinai', name: 'Quick' },
  { id: 'pro', name: 'Pro' },
  { id: 'max', name: 'Max' },
  { id: 'ultra', name: 'Ultra' }
]);
export const DEFAULT_TIER = 'nasrinai';

export function createModelCatalog({ config, logger }) {
  const { tiers, guestTiers, userTiers } = config.ai;

  function tierSpec(id) {
    if (tiers[id]) return tiers[id];
    // If a deployment has intentionally omitted a tier-specific model, use
    // the strongest configured smart-routing candidate within that tier's
    // range; the router will still enforce capabilities and provider fallback.
    const range = config.ai.routing?.tierRange?.[id];
    if (range) {
      for (let level = range[1]; level >= range[0]; level--) {
        const candidate = config.ai.routing?.levels?.[level]?.[0];
        if (candidate) return candidate;
      }
    }
    return tiers[DEFAULT_TIER] || null;
  }

  function allowed(caller, id) {
    if (id === DEFAULT_TIER) return true;
    const allowedTiers = caller.actor.type === 'guest' ? guestTiers : userTiers;
    return allowedTiers.includes(id);
  }

  function lockedState(caller, id, plan) {
    if (id === DEFAULT_TIER) return null;
    if (caller.actor.type === 'guest') {
      return { locked: true, needs: 'sign_in', ...(config.plans?.enabled ? { plan: TIER_NEEDS[id] } : {}) };
    }
    const needs = TIER_NEEDS[id] || null;
    if (needs && rank(plan) < rank(needs)) return { locked: true, needs: 'plan', plan: needs };
    if (!allowed(caller, id)) return { locked: true, needs: 'plan', plan: needs || 'pro' };
    return null;
  }

  return {
    // Always return all four choices. Lock metadata controls the UI only;
    // resolve() independently enforces sign-in and plan access server-side.
    async listFor(caller, { plan = 'ultra' } = {}) {
      const models = TIERS.map((t) => ({
        id: t.id,
        name: t.name,
        ...(lockedState(caller, t.id, plan) || {})
      }));
      return { models, default: DEFAULT_TIER };
    },

    async resolve(caller, requested, { plan = 'ultra' } = {}) {
      const id = requested === undefined || requested === null || requested === '' ? DEFAULT_TIER : requested;
      const tier = TIERS.find((t) => t.id === id);
      if (typeof id !== 'string' || !tier) {
        throw new HttpError(400, 'invalid_model', 'Choose Quick, Pro, Max or Ultra.');
      }
      if (id !== DEFAULT_TIER && caller.actor.type === 'guest') {
        throw new HttpError(400, 'model_not_allowed', `Sign in to use ${tier.name}.`);
      }
      if (id !== DEFAULT_TIER && !allowed(caller, id)) {
        throw new HttpError(403, 'model_not_allowed', `${tier.name} is not available for this account.`);
      }
      const needs = TIER_NEEDS[id];
      if (needs && caller.actor.type === 'user' && rank(plan) < rank(needs)) {
        throw new HttpError(403, 'plan_required', `${tier.name} comes with the ${planName(needs)} plan.`);
      }
      const spec = tierSpec(id);
      if (!spec) throw new HttpError(503, 'model_unavailable', `No model is configured for the ${tier.name} tier.`);
      return { tier: id, provider: spec.provider, model: spec.model, effort: spec.effort };
    },

    // Provider outages never hide a tier. This remains as a compatibility
    // no-op for existing callers while failover is handled by the router.
    markUnusable(id) {
      logger?.warn('tier provider failure will be handled by router failover', { tier: id });
    }
  };
}
