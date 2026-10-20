import { HttpError } from '../http/errors.js';

const RANK = Object.freeze({ nasrinai: 0, quick: 0, free: 0, guest: 0, open: 0, pro: 1, max: 2, ultra: 3 });
const CANONICAL = Object.freeze({ nasrinai: 'nasrinai', quick: 'nasrinai', free: 'nasrinai', guest: 'nasrinai', open: 'nasrinai', pro: 'pro', max: 'max', ultra: 'ultra' });

/** Resolve the request tier independently from the account's maximum entitlement. */
export function resolveRequestTier(requested, accountPlan, { open = false, guest = false } = {}) {
  const account = CANONICAL[String(accountPlan || 'nasrinai').trim().toLowerCase()];
  const raw = requested == null || requested === '' ? (guest ? 'nasrinai' : account || 'nasrinai') : String(requested).trim().toLowerCase();
  const selected = CANONICAL[raw];
  if (!selected) throw new HttpError(400, 'invalid_tier', 'Choose a valid intelligence tier.');
  if (open && selected !== 'nasrinai') throw new HttpError(403, 'tier_not_entitled', 'This tier is not available for the current account.');
  if (guest && selected !== 'nasrinai') throw new HttpError(403, 'tier_not_entitled', 'Sign in and subscribe to use this tier.');
  if (!account || RANK[selected] > RANK[account]) throw new HttpError(403, 'tier_not_entitled', 'Your subscription does not include the selected tier.');
  return selected;
}

export function imageRouteCeiling(tier) {
  // Existing IMAGE_TIER_n routes are content-quality levels, not plan IDs.
  return ({ nasrinai: 1, pro: 1, max: 2, ultra: 3 })[tier] ?? 1;
}
