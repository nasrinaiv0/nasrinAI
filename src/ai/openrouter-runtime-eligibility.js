import { getOpenRouterModel } from './openrouter-tier-routing.js';

/**
 * Runtime gate for model IDs present in the owner-approved registry.
 * Legacy/dynamically discovered chat models remain subject to the existing
 * router's tier and live-catalog checks. Registry-known IDs must additionally
 * match the assigned tier, be catalog-verified when inferred, and be usable
 * through the chat-completion adapter before they can enter chat routing.
 */
export function isOpenRouterChatCandidateEligible({ modelId, tier, paidQuick = false, task = 'chat' }) {
  if (typeof modelId !== 'string' || !modelId.trim()) return false;
  const model = getOpenRouterModel(modelId);
  const isFreeQuick = tier === 'nasrinai' && paidQuick !== true;
  if (!model) {
    // Existing dynamic paid-tier chat discovery remains available. Free Quick
    // stays restricted to explicitly free IDs plus the single Luna fallback.
    if (isFreeQuick) return /:free$/i.test(modelId) || modelId === 'openai/gpt-6-luna';
    return !/:free$/i.test(modelId);
  }

  if (model.inferred) return false;
  if (model.endpoint !== 'chat') return false;
  if (!['text', 'coding'].includes(model.category)) return false;
  if (model.category === 'coding' && !['coding', 'debugging'].includes(task)) return false;

  const allowedTiers = model.tiers;
  if (isFreeQuick) {
    return modelId === 'openai/gpt-6-luna'
      ? allowedTiers.includes('guest-fallback') || allowedTiers.includes('quick-free-fallback')
      : modelId.endsWith(':free') && (allowedTiers.includes('guest') || allowedTiers.includes('quick-free'));
  }
  const effectiveTier = tier === 'nasrinai' ? 'quick-paid' : tier;
  return allowedTiers.includes(effectiveTier) && !modelId.endsWith(':free');
}
