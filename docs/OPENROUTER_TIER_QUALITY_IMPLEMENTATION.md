# Request-tier quality and cost policy — Claude implementation handoff

Status: partial implementation committed to the PR branch. Keep PR #491 Draft and do not deploy until all release gates pass.

## Product contract
- The server-side subscription plan determines the maximum tier a user may select.
- The request's explicit composer tier determines behavior for that request. Ultra choosing Pro gets Pro behavior. Max may choose Pro. Pro cannot choose Max/Ultra.
- Validate entitlements server-side on every generation endpoint. Client state is never authorization. Unknown values return 400; unauthorized upgrades return 403.
- Preserve subscription state, quotas, spend reservations, and actual-cost settlement. Never trust client-supplied model IDs, cost, plan, or quota.

## Quality/cost policy
| Selected tier | Images | Video |
|---|---|---|
| Quick | lowest-cost supported route and existing free limits | disabled |
| Pro | lowest-cost eligible model meeting quality floor | lowest-cost eligible route, if explicitly configured |
| Max | standard quality / mid-cost | standard quality route, if explicitly configured |
| Ultra | premium model/features only when verified | premium route only when verified |

Do not infer quality from model names. Verify live capability and SKU/endpoint prices. Missing route configuration must fail closed, not silently reuse another tier's model.

## Implemented in this pass
- Added `src/ai/request-tier.js` with normalized tier names, server-side entitlement checks, and image route ceilings.
- Image creation validates explicit `tier` (legacy alias `model`) against server subscription and caps existing image quality slots: Quick/Pro slot 1, Max up to slot 2, Ultra up to slot 3. Existing slot numbers remain content-quality slots, not subscription IDs.
- Video creation validates selected tier and preserves Max/Ultra-only entitlement. If a route is explicitly tagged with a different tier, the request fails closed.
- Added regression tests for lower-tier selection, unauthorized escalation, invalid tier values, Quick-only guest behavior, and image quality ceilings.

## Still required before release (do not claim complete)
1. Add explicit tier-specific video provider construction and environment config. Suggested names: `OPENROUTER_VIDEO_PRO_MODEL`, `OPENROUTER_VIDEO_PRO_COST_PER_SECOND_USD`, `OPENROUTER_VIDEO_MAX_MODEL`, `OPENROUTER_VIDEO_MAX_COST_PER_SECOND_USD`, `OPENROUTER_VIDEO_ULTRA_MODEL`, `OPENROUTER_VIDEO_ULTRA_COST_PER_SECOND_USD`. Validate live capability and live SKU pricing for each.
2. Add explicit tier-to-image route config instead of relying only on legacy `IMAGE_TIER_n` slots. Verify selected Pro never routes to Max/Ultra model and Max never gets Ultra-only quality.
3. Confirm frontend sends selected `tier` for image and video. Do not infer from account subscription when a lower tier is selected.
4. Audit brief/preview, retry, extension, status, and internal job paths. Maintain owner checks for all existing jobs.
5. Ensure video spend reservations reconcile actual provider costs durably and idempotently across retries/failures.
6. Update plan descriptions and all UI/API docs to reflect only enabled and verified routes.
7. Test model/price mismatch, cache separation by selected tier, reservations/settlement, and live provider behavior.

## Release gates
- [ ] Full unit suite green.
- [ ] Security review confirms no client-controlled entitlement/cost.
- [ ] Live provider capability and pricing checks pass for every enabled tier.
- [ ] Durable video actual-cost reconciliation verified.
- [ ] UI labels and payloads reflect selected tier.
- [ ] Preview smoke tests pass for all tiers and denied escalation.
- [ ] Latest PR CI is green.
- [ ] Separate release decision before production deployment.

Never log or expose API keys, internal provider exceptions, or secret environment values. Cache keys must include selected tier and route/model version. Keep rate limits independent of tier selection. Fail closed when entitlement, capability, price, or route cannot be verified.
