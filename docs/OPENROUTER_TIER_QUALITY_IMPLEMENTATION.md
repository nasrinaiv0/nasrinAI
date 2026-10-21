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
1. The shared video service is the platform-wide entry point: main chat and Video Studio use the same authenticated video-job lifecycle. HeyGen Video 1 (`heygen/heygen-video-1`) is the primary OpenRouter video model for Pro, Max, and Ultra. `OPENROUTER_VIDEO_MODEL` can override the shared default, while `OPENROUTER_VIDEO_PRO_MODEL`, `OPENROUTER_VIDEO_MAX_MODEL`, and `OPENROUTER_VIDEO_ULTRA_MODEL` can override individual tiers. Any configured route must still pass live catalog capability and per-second price checks; no unsupported resolution/FPS may be silently downgraded. Max prefers the lowest-priced compatible model; Ultra prefers the highest-priced compatible model as a fallback heuristic, which is not a guarantee of quality. Legacy OPENROUTER_VIDEO_MODEL is an Ultra-only fallback.
2. Add explicit tier-to-image route config instead of relying only on legacy `IMAGE_TIER_n` slots. Verify selected Pro never routes to Max/Ultra model and Max never gets Ultra-only quality. Existing slots are currently capped by tier but must be mapped to verified per-tier models and prices.
3. Confirm frontend sends selected `tier` for image and video. Do not infer from account subscription when a lower tier is selected.
4. Audit brief/preview, retry, extension, status, and internal job paths. Maintain owner checks for all existing jobs.
5. Ensure video spend reservations reconcile actual provider costs durably and idempotently across retries/failures.
6. Update plan descriptions and all UI/API docs to reflect only enabled and verified routes. Keep video UI duration aligned with the provider's verified cap; do not advertise one-minute output until safe extension and final-cost reconciliation are implemented.
7. Test model/price mismatch, cache separation by selected tier, reservations/settlement, and live provider behavior.

## Latest implementation verification (2026-10-21)

- Added selected composer tier to image-generation and video-generation request payloads.
- Added Max/Ultra OpenRouter video routes with optional pinned model IDs and fail-closed live catalog pricing. Unknown or unsupported model capabilities pause generation instead of guessing a price.
- Video route selection now uses the selected request tier throughout cost estimation, cache identity, job creation, and usage logging.
- The UI requests 8-second clips because the current OpenRouter adapter only verifies single-shot clips up to 8 seconds. Do not advertise 60-second OpenRouter generation until extension support and durable final-cost reconciliation are implemented.
- Latest PR head syntax checks passed and full test suite passed: 857 tests, 856 passed, 0 failed, 1 skipped. `git diff --check` passed.

## Operator configuration still required

Apply migration `055_video_spend_reconciliation.sql` before enabling video in any deployed environment. Configure `OPENROUTER_API_KEY`, `VIDEO_PROVIDER=openrouter`, and explicitly set `VIDEO_ENABLED=true` only in the intended environment. Optionally pin `OPENROUTER_VIDEO_MAX_MODEL` and `OPENROUTER_VIDEO_ULTRA_MODEL`; dynamic per-second catalog pricing replaces manual cost variables. OpenRouter remains single-shot and capped at 8 seconds. Final `usage.cost` from the provider's completed poll response reconciles the estimate idempotently; if the provider omits cost, the conservative estimate remains. Do not enable paid production video until migration 055 is applied and authenticated live-provider smoke tests pass.

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


## OpenRouter model catalog and skills — 2026-10-21

A new runtime skill catalog is added at `src/ai/openrouter-catalog.js`. It maps model IDs to verified task skills and reorders only explicitly configured OpenRouter candidates for a classified task. This does not bypass existing policy: a candidate must still be present in ROUTE_LEVEL_n, have a price, pass live model availability/capability checks, privacy checks, spend budget, tool/attachment checks, and tier limits.

Verified IDs/prices recorded in `config/model-prices.json` from OpenRouter model pages:
- `deepseek/deepseek-v4.1-flash`: $0.13 input / $0.52 output per 1M; cached input pricing not added until independently confirmed.
- `z-ai/glm-5.3-flash`: $0.075 input / $0.25 output per 1M; cached input $0.015 (promotional listed rate; verify before pricing updates).
- `xiaomi/mimo-v2.6-flash`: $0.14 input / $0.28 output per 1M; cached input $0.0028.
- `deepseek/deepseek-v4-flash-0731`: $0.0152 input / $1.28 output per 1M.
- `deepseek/deepseek-v4-flash-vision-exp`: $0.2156 input / $0.6468 output per 1M; cached input $0.00686.

The catalog also records all 16 names supplied by the owner. Text-task prioritization is wired, but image/file attachment routing is not considered enabled merely by a skill label: provider-level capability checks must also pass, and the OpenRouter adapter currently rejects direct text-adapter attachments. Vision model selection must be completed through the dedicated verified vision payload path before claiming it is live. Unverified model names (including the GPT-6 Luna labels, Claude Haiku 5.5, Qwen3.8, Ling 3.1 Flash, Jev1.13, Decider V1.2, and MiMo-V2.6-Pro) intentionally have no runtime model ID and cannot be selected until their exact OpenRouter ID, modality/capabilities, endpoint/tool support, and live price are confirmed. DeepSeek V4.1 Flash 1017 has a verified exact ID but price remains pending in this catalog; do not route it until a price entry is added.

### Routing skill map
- Fast chat / everyday requests: GLM 5.3 Flash, DeepSeek V4.1 Flash, MiMo-V2.6-Flash (among configured and affordable candidates).
- Coding/debugging/agent workflows: DeepSeek V4.1 Flash, DeepSeek V4 Flash 0731, GLM 5.3 Flash.
- Research and complex analysis: DeepSeek V4.1 Flash, MiMo-V2.6-Flash.
- Image/chart/document understanding: DeepSeek V4 Flash Vision Exp, DeepSeek V4.1 Flash, MiMo-V2.6-Flash; the existing request attachment adapter must independently confirm it can pass image/file input for that route.
- Structured decisions: do not route to a chat model via this skill map. The dedicated decisions API and exact model endpoint/capabilities must be verified before enabling any proposed decision model.

### Enablement
Use exact provider-qualified IDs in `ROUTE_LEVEL_1` through `ROUTE_LEVEL_5`, e.g. `openrouter:deepseek/deepseek-v4.1-flash`. Confirm the parser accepts the provider prefix and set the same exact IDs in the OpenRouter price registry. This catalog does not automatically enable unconfigured models or override account-tier policy. Add task-specific candidates only after validating tool/vision support and pricing in the live OpenRouter catalog.


## Multi-model planning council (experimental, disabled by default)

See [docs/MULTI_MODEL_PLANNING_COUNCIL.md](./MULTI_MODEL_PLANNING_COUNCIL.md) for the full architecture, operator-supplied price list, implementation progress, safety contract, and release gates. The server-side flag is `PLANNING_COUNCIL_ENABLED=false` by default. When enabled, only eligible non-sensitive Max/Ultra requests without attachments, tools, or current-fact requirements can use the council. Each specialist is routed through the existing policy and reservations. Do not enable in production until the documented integration, security, cost, and quality checks pass.


## 2026-10-21 coding and speech route update

- Max coding/debugging default: `openrouter:openai/gpt-6-sol`, listed at $2/M input and $10/M output.
- Ultra coding/debugging and Ultra deep coding: `openrouter:openai/gpt-6.1-sol`, listed at $2/M input and $10/M output. These are tier-scoped coding specialists, not general chat overrides. They are used only when `OPENROUTER_API_KEY` is configured and the existing tier/usage policy permits the request; otherwise the approved Anthropic fallback remains.
- TTS default when OpenRouter is configured: `google/gemini-3.8-flash-lite-tts` at $0.50/M text input and $6/M audio output. The OpenRouter speech request pins provider routing to `Google Vertex` with fallbacks disabled so it cannot silently switch provider. The OpenRouter model page currently lists Google AI Studio as the model's visible endpoint, while the Google Vertex provider page also lists the model; live provider pinning must be verified in Preview before release.
- Runtime cached-input prices for the Sol models are conservatively set equal to standard input ($2/M) until billing telemetry is confirmed. TTS reservation cost remains a conservative per-character ceiling until actual usage data is verified.
- Required release checks: configured provider key in Vercel Preview; verify a Max coding request selects GPT-6 Sol, an Ultra coding request selects GPT-6.1 Sol, and a speech request returns playable WAV from the pinned Google Vertex endpoint; confirm usage/cost settlement and fail-closed behavior.


## Consolidated OpenRouter model and capability inventory — 2026-10-21

This section consolidates the OpenRouter model references and task routing represented in PR #491. **A catalog entry or model name is not proof of production enablement.** A model is usable only when its exact ID is configured for the route, live capability and endpoint pricing checks pass, the user's tier/policy permits it, and the relevant end-to-end smoke test has passed.

### 1. Text, chat, reasoning, research and coding candidates

The runtime skill catalog is `src/ai/openrouter-catalog.js`. Its skills are hints for ordering candidates, not a capability guarantee or authorization list.

| Model / exact ID in catalog | Catalog status | Intended tasks | Price snapshot in `config/model-prices.json` (USD per 1M tokens) |
|---|---|---|---|
| DeepSeek V4.1 Flash — `deepseek/deepseek-v4.1-flash` | verified | Chat, coding, debugging, research, analysis, agent workflows; vision only if input path supports it | $0.13 input / $0.52 output; cached $0.0026 |
| GLM 5.3 Flash — `z-ai/glm-5.3-flash` | verified | Fast chat, coding, multimodal understanding, agents | $0.075 input / $0.25 output; cached $0.015 (recheck promotional rate) |
| MiMo-V2.6-Flash — `xiaomi/mimo-v2.6-flash` | verified | Chat, coding, research, analysis; vision only with compatible input path | $0.14 input / $0.28 output; cached $0.0028 |
| DeepSeek V4.1 Flash 1017 — `deepseek/deepseek-v4.1-flash-1017` | verified ID; price entry exists | Chat, coding, debugging, research, analysis, agents | $0.15 input / $0.60 output; cached $0.15 |
| DeepSeek V4 Flash 0731 — `deepseek/deepseek-v4-flash-0731` | verified | Coding, reasoning, agents | $0.0152 input / $1.28 output; cached $0.0152 |
| DeepSeek V4 Flash Vision Exp — `deepseek/deepseek-v4-flash-vision-exp` | verified | Image/chart/document understanding, vision | $0.2156 input / $0.6468 output; cached $0.00686 |
| GPT-6 Luna — `openai/gpt-6-luna` | operator-supplied catalog entry; live identity still requires verification | Fast chat, classification, tools, coding | Price snapshot present, but do not treat as verified until the exact live catalog identity and endpoint are checked |
| GPT-6 Luna Pro — `openai/gpt-6-luna-pro` | operator-supplied catalog entry; live identity still requires verification | Complex analysis and reasoning | Price snapshot present, but do not enable without live verification |
| Claude Haiku 5.5 — `anthropic/claude-haiku-5.5` | operator-supplied catalog entry; live identity still requires verification | Writing, summaries, coding assistance, agents | Price snapshot present, but do not enable without live verification |
| MiMo-V2.6-Pro — `xiaomi/mimo-v2.6-pro` | operator-supplied catalog entry; live identity still requires verification | Advanced reasoning, coding, research | Price snapshot present, but do not enable without live verification |
| Qwen3.8 Flash — `qwen/qwen3.8-flash` | operator-supplied catalog entry; live identity still requires verification | Reasoning, coding, document analysis, multimodal | Price snapshot present, but do not enable without live verification |
| Ling 3.1 Flash — `inclusionai/ling-3.1-flash` | verified in catalog | Fast reasoning, coding, tool-enabled agents | $0.075 input / $0.225 output; cached $0.075 |
| Jev1.13 — `typesafe/jev-1.13` | unverified | Brainstorming, decision support | No verified price; do not route |
| GPT-6 Luna Decisions — `openai/gpt-6-luna-decisions` | unverified | Structured decisions, classification, routing, scoring | No verified price; do not route |
| Qwen3.8 27B — `qwen/qwen3.8-27b` | unverified | Vision-language, coding, research, agents | No verified price; do not route |
| Decider V1.2 — `perplexity/pplx-decider-v1.2` | unverified | Decision selection, rubric scoring, moderation | No verified price; do not route |
| Google Vertex Global — `google-vertex/global` | unverified; not a confirmed OpenRouter model ID | General generation candidate only | No verified price; do not route |

**Dedicated coding routes**
- Max coding/debugging: `openrouter:openai/gpt-6-sol` — listed at $2/M input and $10/M output; cached input is configured at $0.20/M.
- Ultra coding/debugging and Ultra deep coding: `openrouter:openai/gpt-6.1-sol` — listed at $2/M input and $10/M output; cached input is configured at $0.10/M.
- The coding routes are tier-scoped and are not general chat overrides. Existing Anthropic fallback is used only according to the configured route and policy. Automated tests do not replace authenticated Preview smoke tests for selection, quality and billing.

### 2. Image generation and image editing

The PR documents the OpenRouter GPT Image family:
- `openai/gpt-image-2`
- `openai/gpt-image-2.5-flare`
- `openai/gpt-image-2.5-sunburst`

These are model candidates, not a guarantee that all three are enabled. Before any image request, the adapter must validate the exact model against the live `/images/models` catalog, requested quality/aspect ratio/reference-image count, live endpoint pricing, and a positive spend ceiling. Image generation uses the dedicated `/images` endpoint; do not substitute text chat for image output. The current adapter requires an explicitly configured/preferred model for costly image generation and fails closed when a verified model/price is not available.

Image understanding is separate from image generation. DeepSeek V4 Flash Vision Exp and other catalog entries labelled `vision` are not considered usable for user image/file input unless the live input-modality checks and actual request payload path support that input. The general OpenRouter text adapter currently rejects direct attachments; do not advertise those skill labels as an enabled vision workflow without testing the dedicated payload path.

### 3. Video generation

The OpenRouter video adapter is connected to the **shared NasrinAI video job lifecycle**, not only Video Studio. It checks live model capabilities for duration, resolution, aspect ratio, generated audio/video-input needs, and a published per-second SKU price. Cost lookup uses the live OpenRouter catalog; do not hard-code or guess a per-second price.

Video model candidates named in PR documentation:
- `heygen/heygen-video-1`
- `alibaba/wan-3.0`
- `google/veo-3.1-lite`
- `google/veo-3.1-fast`
- `alibaba/happyhorse-1.1`
- `alibaba/wan-2.7`

These names are documented candidates, not proof every model is currently returned by the live catalog, supports the requested options, or has passed end-to-end generation. The router may discover eligible models only when required capabilities and price are verified. Max prefers the least expensive eligible route; Ultra prefers the highest-priced eligible route as a fallback heuristic, **not** a quality guarantee. Model pinning uses `OPENROUTER_VIDEO_MAX_MODEL` and `OPENROUTER_VIDEO_ULTRA_MODEL`; legacy `OPENROUTER_VIDEO_MODEL` is an Ultra-only fallback. The UI/adapter currently keeps a conservative 8-second single-shot cap; do not advertise 60-second output until extension support and durable cost reconciliation are proven. Keep paid video disabled unless the provider/model and spend ceiling are configured and live tests pass.

### 4. Speech / text-to-speech (TTS) / audio

- OpenRouter TTS candidate: `google/gemini-3.8-flash-lite-tts`, listed at $0.50/M text input and $6/M audio output. The current `.env.example` pins `OPENROUTER_TTS_PROVIDER=Google AI Studio`; the provider-specific endpoint and playable output must be verified in Preview. Do not document this as Google Vertex unless the actual configured value and live test are changed and confirmed.
- Other supported speech routes in the app include the separately configured OpenAI and Gemini speech engines. Their existence does not mean they use OpenRouter.
- The adapter maps speech to `/audio/speech`, transcription to `/audio/transcriptions`, audio understanding to chat completions with audio input, and audio generation/understanding to their corresponding task routes. These endpoint mappings are implementation support, **not proof of a configured or tested transcription/audio model**.

### 5. Transcription, extraction, research, artifacts, decisions and other tasks

| Task | Current PR #491 status | Model selection / guardrail |
|---|---|---|
| Transcription | Endpoint mapping exists; no dedicated verified OpenRouter transcription model is established in this inventory | Requires exact configured model with live transcription capability and an end-to-end audio-file test; otherwise unavailable |
| Text extraction / PDF | Classified tasks map to text chat; catalog skill labels may help candidate ordering | PDF/file input must pass live input-modality checks and a tested payload path; no skill label alone enables file upload |
| Research / web research | Task-aware text routing exists; separate research tools remain configuration/feature-gated | A text model is not a web-search integration. Require configured search/tool access and test citations/source handling |
| Coding / debugging | Tier-specific GPT-6 Sol / GPT-6.1 Sol routes documented | Verify exact tier route, tool execution, fallback compatibility, spend reservation and usage settlement |
| Structured decisions | Dedicated `/alpha/decisions` API path exists; no existing business workflow is confirmed to call it | Do not send decisions through ordinary chat. Candidate decision model IDs above remain unverified and must not be enabled |
| Artifacts / document generation | No standalone “artifact model” is established by this PR | Artifacts are an application workflow: classify task, route a capable text/coding model and any required tools, then validate output. No separate model ID should be invented |
| Video understanding | Task mapping exists for video input | Requires a model that advertises video input and a tested video payload; no verified route is claimed here |
| Embeddings / reranking | Endpoint/task names are mapped | No verified dedicated model/price pair is established in this inventory; keep disabled until exact model, pricing and end-to-end behavior are verified |
| Audio understanding | Task mapping exists for audio input | Requires live audio-input support and tested payload; do not treat TTS support as transcription or audio understanding |

### 6. Pricing source and operational rules

- Token prices above are snapshots in `config/model-prices.json`, in USD per 1 million input/output tokens unless stated otherwise. They are not a substitute for live provider price validation and must be reviewed before changing budgets.
- Image generation checks live endpoint prices from OpenRouter's image endpoint catalog. Video generation checks explicit per-second SKU entries in the live video catalog. The code rejects ambiguous per-job prices when a per-second rate is required.
- Do not copy a model's listed price into production configuration without confirming the exact model ID, provider endpoint, billing unit, cached-input rate, and requested modality.
- Keep API keys and environment values private. Do not paste secret values into this document, logs, browser output or chat.
- Exact model selection remains subject to `ROUTE_LEVEL_n`, tier entitlements, live capabilities, privacy/data-collection policy, budget, tools/attachments and endpoint-specific constraints. Catalog labels are not authorization.

### 7. Release readiness checklist

- [ ] Reconfirm every exact model ID against the live OpenRouter catalog.
- [ ] Confirm every enabled model is present in Vercel configuration for the intended environment and tier.
- [ ] Run authenticated Preview smoke tests for text, coding/tools, image generation/editing, video create/status/download, TTS, transcription, extraction, research and any decision route being enabled.
- [ ] Confirm audio/video options, reference limits, MIME types, response parsing and download format.
- [ ] Reconcile actual provider usage/cost with reservations durably and idempotently, especially asynchronous video jobs.
- [ ] Verify unknown model, missing price, unsupported capability, provider error and timeout all fail safely without duplicate paid requests.
- [ ] Confirm exact-head CI is green and security review passes.
- [ ] Keep PR #491 Draft and do not merge/deploy to production until all required gates are closed.


## Per-reply details menu (current implementation status)

The chat response now includes server-generated `response_metadata`:
- `timestamp`: ISO 8601 completion timestamp.
- `duration_ms`: elapsed wall-clock time measured by the server from chat-handler entry to reply completion.
- `usage.input_tokens` and `usage.output_tokens`: rounded, non-negative provider usage counts when the provider supplies them; unavailable counts remain null rather than being fabricated.

The compact three-dot reply menu renders date/time, request duration, input tokens, output tokens, and total tokens. If a response path has no authoritative provider usage (for example, a local policy answer), the menu displays “Not reported”. The frontend only receives metadata for a newly completed chat response; historical conversation messages do not yet persist this metadata and therefore cannot reliably display historical durations or token counts.

## Vercel activation and safety gate

The production Vercel project currently has `VIDEO_PROVIDER` and an `OPENROUTER_API_KEY` variable entry, but `VIDEO_ENABLED` and explicit per-tier video model variables were not found in the production environment listing. The OpenRouter key's secret value cannot be validated from the environment listing. OpenRouter model IDs are optional because the adapter is intended to discover models from the live catalog, but the live catalog's pricing/capability behavior must be smoke-tested before enabling paid generation. Do not enable the paid video feature in production until that check and the full test suite pass.

Migration numbering: the repository's database sequence is at 054; new work must use 055 or later. Never apply a 052 migration to this database.


## Latest verification checkpoint — 2026-10-21

- GitHub CI: **passed** for the current PR head (test, database, dependency-audit jobs).
- Documentation Gate: **passed**.
- Pro video access is included in the entitlement tests; Pro is limited to 360p/480p. Max/Ultra support the existing 4K add-on route, which must pass the live capability and verified price-delta checks.
- Ultra 4K pricing fails closed unless both 4K and 1080p rates are available for the same catalog-selected model. The estimated 4K premium is reserved as tokens at 150,000 tokens/USD, with quota reservation before provider invocation and conservative settlement on uncertain outcomes.
- New SQL migration/test files use sequence **055**. The incorrectly numbered 052 migration and test files were removed from this branch.
- Vercel production currently has `VIDEO_PROVIDER` and an `OPENROUTER_API_KEY` variable entry, but `VIDEO_ENABLED` is absent (so OpenRouter video remains disabled by default). This is intentional until a real authenticated catalog/pricing smoke test confirms the production provider can quote and generate at 1080p and 4K safely. CI mocks do not establish live-provider readiness.
- Historical replies still do not persist response metadata; the three-dot panel shows authoritative token counts and server duration for fresh responses only.


### Primary video model update — 2026-10-21

- Default OpenRouter video model is pinned to `heygen/heygen-video-1` for Pro, Max, and Ultra unless a tier-specific Vercel environment override is supplied.
- HeyGen Video 1 currently documents 480p and 768p output and 5–15 second clips. The product tier matrix (360p/480p/720p and Max/Ultra 1080p/4K add-ons, each at 30/60 FPS) is a product entitlement policy, not proof that this model supports every option. The API must check OpenRouter's live video model catalog and reject unsupported combinations rather than silently changing the user's requested settings.
- Keep `VIDEO_ENABLED=false` in production until the tier/frame-rate selector, subscription/add-on token accounting, spend reconciliation migration, and authenticated live-provider tests all pass. Video is billed against subscription/add-on token allowances, not as a separate per-generation user payment.


### Default video output settings — 2026-10-21

- Unless a user changes the controls, the shared video-generation API requests **720p at 30 FPS**.
- The request UI is tier-aware: Pro defaults to 480p and offers 360p/480p; Max/Ultra default to 720p and may request 360p/480p/720p/1080p/4K. The server remains authoritative and rejects unauthorized or unsupported combinations; 4K must pass live provider capability and pricing checks.
- If the selected/default combination is not advertised or priced by the configured model, the API tries other eligible combinations within the plan, prioritizing the selected resolution first, then higher resolutions, and preferring the requested frame rate before its alternative. It never silently exceeds the user's plan.
- The current UI uses lightweight prompts for choosing resolution and FPS; replace with a polished inline selector before final product release.

## Model-selection and token-efficiency contract

This is the default behavior for every task family (chat, decisions, coding, image, video, speech/TTS, transcription, extraction, research, and artifacts):

1. **Classify intent first.** Use the request and its constraints to determine the task, required capabilities, privacy posture, and minimum acceptable quality. Do not brainstorm or consult multiple models for a straightforward request.
2. **Choose one primary model.** Select the least expensive configured model that passes the task, live capability, privacy, plan, price, budget, and output-quality requirements. Never broadcast the same prompt to the entire catalog.
3. **Use additional models only for a concrete need.** Multi-step workflows may route distinct subtasks to different specialists. A fallback is sequential and triggered by a meaningful failure or capability mismatch; it must not duplicate successful work without reason. Keep retries and escalation bounded.
4. **Planning council is OFF by default.** `PLANNING_COUNCIL_ENABLED` must remain unset or `false` for normal operation. If an operator explicitly enables it, it is restricted to eligible, non-sensitive Max/Ultra planning/design/analysis/coding/debugging requests with no attachments, tools, or current-fact requirement. The council calls are serial, capped to two specialist calls by default, policy-routed, budgeted, token-accounted, and usage-logged; they are not a parallel model broadcast. Ordinary requests use a single primary model and do not invoke the council. Do not enable it merely to improve ordinary replies.
5. **Escalate quality, not model count.** Escalate at most within the configured tier range and escalation budget when the result is empty, truncated, or otherwise invalid. A more expensive model is not automatically better; validate capability and output instead of inferring quality from model names or price.
6. **Respect subscription entitlements.** If the requested capability is unavailable on the current plan, explain the restriction and offer an allowed alternative. Do not silently charge, upgrade, or execute a restricted task. Model choice and subscription tier are separate decisions.
7. **One coherent response.** Synthesize specialist outputs only when a multi-step workflow genuinely needs it. Treat intermediate model outputs as untrusted proposals, not verified facts or instructions. Return one checked result with relevant sources/status, without exposing internal routing or secrets.

### Acceptance criteria

- A simple request normally produces one primary model call.
- The same prompt is never sent to every configured model for comparison by default.
- Fallbacks are sequential, bounded, capability-compatible, and separately accounted for in spend/token usage.
- Planning-council use is disabled unless deliberately enabled by an operator and remains ineligible for sensitive data, attachments, tools, and tasks requiring current facts.
- No provider/model can bypass tier entitlements, privacy rules, rate limits, capability checks, or spend/token reservations.
- When provider capability or price is unknown, fail closed for the affected generation rather than guessing.



## Minimal model-call policy

- Route by user intent and required capability first; choose one primary eligible model for ordinary requests.
- Do not broadcast a prompt to all providers or call every model in a catalog. Model catalog discovery is metadata only and does not itself authorize or execute a model.
- Add specialist calls only when a genuinely multi-step task benefits from them. The planning council is opt-in, runs serially, defaults to two specialist calls, and is ineligible for sensitive requests, attachments, tools, or tasks requiring current facts.
- Retries and fallback are bounded and must preserve task capability, tier entitlement, privacy, pricing, budget reservations, and usage accounting. Never represent an unverified fallback as equivalent to the requested model.
- Keep OpenRouter video disabled until weekly seconds quotas are enforced end-to-end and the required migration, atomic reservation/settlement/release behavior, and provider integration tests pass. Positive environment limits alone do not implement quota enforcement.
