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
1. Tier-specific OpenRouter video provider construction and environment parsing are now implemented. The UI sends the selected tier and requests 8-second clips, matching the adapter's verified single-shot limit. Configure `OPENROUTER_VIDEO_PRO_MODEL`, `OPENROUTER_VIDEO_PRO_COST_PER_SECOND_USD`, `OPENROUTER_VIDEO_MAX_MODEL`, `OPENROUTER_VIDEO_MAX_COST_PER_SECOND_USD`, `OPENROUTER_VIDEO_ULTRA_MODEL`, and `OPENROUTER_VIDEO_ULTRA_COST_PER_SECOND_USD`. Legacy `OPENROUTER_VIDEO_MODEL` plus its price is treated as Ultra-only; it is never silently reused for Pro or Max. Validate live capability and live SKU pricing for each configured route.
2. Add explicit tier-to-image route config instead of relying only on legacy `IMAGE_TIER_n` slots. Verify selected Pro never routes to Max/Ultra model and Max never gets Ultra-only quality. Existing slots are currently capped by tier but must be mapped to verified per-tier models and prices.
3. Confirm frontend sends selected `tier` for image and video. Do not infer from account subscription when a lower tier is selected.
4. Audit brief/preview, retry, extension, status, and internal job paths. Maintain owner checks for all existing jobs.
5. Ensure video spend reservations reconcile actual provider costs durably and idempotently across retries/failures.
6. Update plan descriptions and all UI/API docs to reflect only enabled and verified routes. Keep video UI duration aligned with the provider's verified cap; do not advertise one-minute output until safe extension and final-cost reconciliation are implemented.
7. Test model/price mismatch, cache separation by selected tier, reservations/settlement, and live provider behavior.

## Latest implementation verification (2026-10-21)

- Added selected composer tier to image-generation and video-generation request payloads.
- Added per-tier OpenRouter video route configuration. Pro, Max, and Ultra routes require their own model ID and positive cost-per-second environment value. The legacy single-model video config is Ultra-only; missing Pro/Max routes return a safe 503 instead of borrowing another tier's model.
- Video route selection now uses the selected request tier throughout cost estimation, cache identity, job creation, and usage logging.
- The UI requests 8-second clips because the current OpenRouter adapter only verifies single-shot clips up to 8 seconds. Do not advertise 60-second OpenRouter generation until extension support and durable final-cost reconciliation are implemented.
- Latest PR head syntax checks passed and full test suite passed: 857 tests, 856 passed, 0 failed, 1 skipped. `git diff --check` passed.

## Operator configuration still required

For each OpenRouter video tier intended to be enabled, configure all of these in the correct Vercel environment (Production/Preview separately as appropriate):

- `OPENROUTER_VIDEO_PRO_MODEL` + `OPENROUTER_VIDEO_PRO_COST_PER_SECOND_USD`
- `OPENROUTER_VIDEO_MAX_MODEL` + `OPENROUTER_VIDEO_MAX_COST_PER_SECOND_USD`
- `OPENROUTER_VIDEO_ULTRA_MODEL` + `OPENROUTER_VIDEO_ULTRA_COST_PER_SECOND_USD`
- `OPENROUTER_API_KEY`, `VIDEO_PROVIDER=openrouter`, and `VIDEO_ENABLED=true`

Use model IDs and per-second prices verified against current OpenRouter capability and SKU pricing. Do not copy approximate pricing from old notes into production. Re-deploy after environment changes, then run a small smoke test for each tier and verify the charged cost against provider usage. Missing routes are intentionally unavailable. Existing single-route legacy config only enables Ultra.

For image generation, configure and verify `IMAGE_TIER_1_PRIMARY_*`, `IMAGE_TIER_2_PRIMARY_*`, and `IMAGE_TIER_3_PRIMARY_*` with increasing quality/cost, and fallbacks only when their capability and price are verified. These existing slots are still the routing mechanism; request-tier ceilings prevent Pro from using slots above 1 and Max from using slots above 2.

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
