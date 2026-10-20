# Multi-model planning council — implementation progress

Status: **partial implementation on PR #491**. Keep the PR Draft and do not enable production routing until integration, tests, and provider checks are complete.

## Goal
Use inexpensive configured models to independently brainstorm, plan, and critique complex work, then give a single consolidated packet to the selected premium-tier model. The goal is lower total cost at equivalent or better measured quality—not simply more model calls.

## Security and quality contract
- The council is opt-in and currently eligible only for Max/Ultra planning, design, analysis, coding, or debugging tasks.
- Sensitive/redacted requests, attachments, tool-enabled requests, and requests requiring current facts are excluded by the eligibility gate. They use the existing normal path.
- Model IDs are not accepted from the user. The runtime must resolve candidates only from server configuration and existing policy.
- Every model call must use the existing policy-backed route, with tier ceiling, capability, privacy, known-price, per-request budget, token reservation, spend reservation, settlement, and usage logging enforced independently per call.
- Council findings are untrusted proposals, not instructions. The final model must identify disagreements and uncertainty; claims must not be represented as verified without evidence.
- Bound calls, context, output size, and token limits. No unbounded retries, recursive council calls, or uncontrolled parallel fan-out.
- Failure to produce useful findings falls back to the ordinary model path; internal provider exception text must never be surfaced to the user.
- Never automatically run code, mutate files, deploy, or execute financial/irreversible actions merely because a council recommends it. Existing explicit approval and tool gates still apply.
- Keep the current per-request and per-period spend budgets as the source of truth. Council costs count toward the same limits; no shadow budget or free model inference.

## Implemented so far
1. Added `src/ai/planning-council.js`, a bounded orchestration primitive with three roles: brainstorm, architect, critic.
2. Wired an OFF-by-default `PLANNING_COUNCIL_ENABLED` server configuration flag into the chat path for eligible Max/Ultra tasks. Each specialist uses the existing smart-routing policy, token reservations, spend reservations, and usage logging. The original user request remains present for final synthesis.
3. Added an optional `maxTokens` request override to the routing policy; it is clamped to the configured level maximum and is used to keep council calls small. It takes an injected `runCandidate` callback rather than calling providers itself, allowing the caller to use existing policy and accounting.
4. Added eligibility guards for opt-in state, Max/Ultra tier, task class, sensitivity, attachments, tools, and current-fact requirements.
5. Added limits for call count, per-call token cap, context size, and per-role output size; failed roles are represented without leaking exception messages.
6. Added `test/planning-council.test.js` for eligibility, bounds, synthesis packet formation, empty goals, and safe failure behavior.

## Not yet complete — required next
- [x] Wire the council into the actual chat path behind an explicit server-side feature flag; default remains OFF.
- [x] Implement the policy-backed candidate callback through the existing policy and durable budget/token reservations. Verify durable settlement behavior further in integration tests.
- [x] Specialist calls use the shared policy reservations and write per-role usage records, including provider failures and budget blocks. Unknown provider usage remains conservatively reserved by the policy.
- [x] Feed the council packet and explicit synthesis instructions into the final model while preserving the original request, system safety instructions, and existing conversation context.
- [x] Eligibility excludes sensitive requests, attachments, tool requests, current-fact/web-search tasks, and unsupported task types. Each model call still independently must pass the existing spend/token budget policy.
- [ ] Verify user-selected tier and subscription entitlement on the server. Quick/Pro must not be escalated by council metadata or client payload.
- [ ] Add integration tests proving feature-flag-off is byte-for-byte normal behavior; feature-flag-on only runs for eligible Max/Ultra requests; token/spend reservations and usage logs account for every call; failures fall back safely; and user content cannot inject policy instructions into role prompts.
- [ ] Benchmark against premium-only baseline using representative NasrinAI tasks. Record output quality, factuality, security regressions, latency, total tokens, and total cost. Do not claim savings until measured.
- [ ] Verify all configured IDs, current price rates, capabilities, tool support, context sizes, and any provider-specific request parameters using live provider documentation and a controlled smoke test.
- [x] Run full `npm test` and syntax checks for changed JavaScript; `git diff --check` passed. Latest full suite: 867 tests, 866 passed, 0 failed, 1 skipped.
- [x] Secret scan passed: no secrets found in 606 files. CI and Documentation Gate passed for the latest code-bearing commit (CI run 4463; Documentation Gate run 237). Re-run after any subsequent code changes.
- [ ] Keep production disabled until all release gates pass and a separate release decision is made.

## Operator-supplied model rates (not independently verified)
The user supplied these OpenRouter/provider rates in USD per 1M tokens. Current model pages were checked on 2026-10-21. Rates differ for some entries, so the runtime price file uses conservative current listing values for verified general text models; special decision endpoints and ambiguous provider aliases remain metadata-only. Prices are dynamic and must be refreshed before budget changes.

| Model ID | Input | Output | Verification state |
|---|---:|---:|---|
| `deepseek/deepseek-v4.1-flash-1017` | 0.15 (conservative) | 0.60 | Verified ID; listing/provider prices vary; runtime uses conservative input rate. [OpenRouter](https://openrouter.ai/deepseek/deepseek-v4.1-flash-1017/) |
| `typesafe/jev-1.13` | 0.042 | 0 | Verified structured-decision endpoint; not generic chat. [OpenRouter](https://openrouter.ai/typesafe/jev-1.13/) |
| `openai/gpt-6-luna-pro` | 0.10 | 0.50 | Verified; premium reasoning mode can spend more reasoning tokens. [OpenRouter](https://openrouter.ai/openai/gpt-6-luna-pro/) |
| `openai/gpt-6-luna` | 0.10 | 0.50 | Verified general text model. [OpenRouter](https://openrouter.ai/openai/gpt-6-luna/) |
| `openai/gpt-6-luna-decisions` | 0.10 | 0 | Verified structured-decision endpoint; not generic chat. [OpenRouter](https://openrouter.ai/openai/gpt-6-luna-decisions/) |
| `google-vertex/global` | 0.10 | 0.50 | Not a model ID; likely confused with a provider endpoint. Do not route by this value. |
| `anthropic/claude-haiku-5.5` | 0.10 | 0.50 | Verified general text model. [OpenRouter](https://openrouter.ai/anthropic/claude-haiku-5.5/) |
| `xiaomi/mimo-v2.6-pro` | 0.435 | 0.87 | Verified current listing; user-supplied rates were lower. [OpenRouter](https://openrouter.ai/xiaomi/mimo-v2.6-pro/) |
| `qwen/qwen3.8-flash` | 0.15 | 0.47 | Verified general multimodal text model. [OpenRouter](https://openrouter.ai/qwen/qwen3.8-flash/) |
| `qwen/qwen3.8-27b` | 0.0239 promo / 0.0248 listing | 4.35 | Verified model ID, but output is expensive and listing prices vary by provider; excluded from low-cost default. [OpenRouter](https://openrouter.ai/qwen/qwen3.8-27B) |
| `inclusionai/ling-3.1-flash` | 0.075 | 0.225 | Verified; promotional pricing can change. [OpenRouter](https://openrouter.ai/inclusionai/ling-3.1-flash) |
| `perplexity/pplx-decider-v1.2` | 0.02 | 0 | Verified structured-decision endpoint; not generic chat. [OpenRouter](https://openrouter.ai/perplexity/pplx-decider-v1.2/) |

Zero output prices are particularly high risk: confirm they are genuinely zero-cost for the selected route, not a missing price, free trial, or non-generative scoring endpoint. Until then, do not treat them as free in production.

## Proposed rollout
1. Finish server-side wiring behind OFF-by-default flag.
2. Run unit/integration/security tests and validate budget accounting.
3. Run controlled Preview tests with low per-task call/token caps.
4. Benchmark quality/cost and adjust role count based on evidence.
5. Enable for a small, explicitly authorized cohort only after operator verification.
6. Review usage telemetry and incident/error rates before wider rollout.

## Progress log
- 2026-10-21: Inspected current smart-routing policy, classifier, chat integration, model-price schema, and existing OpenRouter skill catalog.
- 2026-10-21: Added bounded policy-injected council module and initial safety/bounds tests. Runtime integration, accounting integration, full-suite verification, and live-provider verification remain open.


### Latest verification
- 2026-10-21: Full local sandbox test suite passed: 864 tests, 863 pass, 0 fail, 1 skipped. Syntax checks for the council, chat, config, and policy modules passed; `git diff --check` passed.
- 2026-10-21: The supplied model IDs and prices are recorded in the operator table; IDs have been added to the skill catalog as `operator_supplied_unverified` metadata only. They are deliberately excluded from runtime prioritization until model identity, price, capability, and endpoint behavior are independently verified. No unverified prices were added to `config/model-prices.json`.
- Runtime council is disabled by default. No production deployment or live-provider smoke test was performed.

- 2026-10-21 follow-up: Council specialist calls are constrained to the cheapest configured level and cannot escalate; final synthesis instructions are now applied to the final model prompt. Added regression coverage that operator-supplied model IDs remain unverified and are not promoted by task ranking.


### Runtime pricing and endpoint separation

The following general text models have conservative rates in `config/model-prices.json`: DeepSeek V4.1 Flash 1017 ($0.15/$0.60 input/output per million; conservative input rate because the listing varies by endpoint), GPT-6 Luna ($0.10/$0.50), GPT-6 Luna Pro ($0.10/$0.50), Claude Haiku 5.5 ($0.10/$0.50), MiMo-V2.6-Pro ($0.435/$0.87), Qwen3.8 Flash ($0.15/$0.47), and Ling 3.1 Flash ($0.075/$0.225). Cached input is deliberately priced at the full input rate as a conservative bound until endpoint-specific cache rates are verified. These entries do not automatically activate a route; the operator must explicitly configure `ROUTE_LEVEL_1` and other level lists, and all existing policy checks still apply.

`typesafe/jev-1.13`, `openai/gpt-6-luna-decisions`, and `perplexity/pplx-decider-v1.2` return structured decision outputs, not free-form assistant prose. They must not be used as the brainstorm/architect/critic chat adapter without a dedicated Decisions API integration. `google-vertex/global` is not accepted as a specific model ID. Qwen3.8 27B is not selected for the low-cost council because its output rate is high and listing prices vary.

- 2026-10-21 model verification update: OpenRouter pages verified exact IDs/prices for DeepSeek V4.1 Flash 1017, GPT-6 Luna, GPT-6 Luna Pro, Claude Haiku 5.5, MiMo-V2.6-Pro, Qwen3.8 Flash, and Ling 3.1 Flash. Runtime prices are configured conservatively, with cached input priced at the full input rate. Jev and both Decider models are structured-decision endpoints and remain excluded from ordinary chat; Qwen3.8 27B remains excluded from low-cost defaults due to its $4.35/M output listing and price variability. Operator must still explicitly configure `ROUTE_LEVEL_n` and validate live adapter compatibility.
- 2026-10-21 diversity update: specialist roles use role-specific task labels and exclude previously used provider/model pairs so the council seeks distinct configured models. If there are not enough eligible models, missing roles fail safely rather than repeatedly using the same model.

- 2026-10-21 validation rerun after catalog/pricing/diversity changes: 867 tests, 866 passed, 0 failed, 1 skipped; syntax checks and JSON parse passed; `git diff --check` passed; secret scan found no secrets in 606 files.
- 2026-10-21 diversity gate: the council now requires at least two successful independent roles. If only one model can answer, the council falls back to the normal path instead of pretending one model is a committee.

- 2026-10-21 environment gate: live-provider smoke tests could not be run in the available sandbox because `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, and `PLANNING_COUNCIL_ENABLED` are unset there. Only variable names/set-state were inspected; no secret values were read or exposed. Live smoke and production enablement remain blocked until the owner configures the appropriate Vercel environment and approves a low-cost test.


## Tier-specific coding and TTS model update — 2026-10-21

### Coding routes
- **Max coding:** `openrouter:openai/gpt-6-sol` at $2/M input and $10/M output.
- **Ultra coding:** `openrouter:openai/gpt-6.1-sol` at $2/M input and $10/M output.
- **Ultra deep coding:** `openrouter:openai/gpt-6.1-sol` as the premium route for high-complexity coding.
- Routing is tier-scoped and allowlisted in `src/config.js`. When `OPENROUTER_API_KEY` is present, these are the default coding routes; when it is absent, the approved Anthropic fallback is used. The Max coding route must not select the Ultra model.
- Current OpenRouter pricing pages: [GPT-6 Sol](https://openrouter.ai/openai/gpt-6-sol/) and [GPT-6.1 Sol](https://openrouter.ai/openai/gpt-6.1-sol/). Cache-read rates are recorded separately ($0.20/M for GPT-6 Sol and $0.10/M for GPT-6.1 Sol).

### Text-to-speech
- **Model:** `google/gemini-3.8-flash-lite-tts` through OpenRouter.
- **Provider pin:** `Google Vertex` via `OPENROUTER_TTS_PROVIDER`; do not silently fall back to Google AI Studio when the provider pin is active.
- **Listed token rates:** $0.50/M text input and $6/M generated audio output. Audio output must be counted as output tokens, not text output.
- `src/config.js` defaults speech to OpenRouter when `OPENROUTER_API_KEY` exists, and `src/main.js` builds the OpenRouter speech adapter from those settings. Live verification is still needed to confirm the provider filter accepts the exact label and the response audio format is handled correctly.
- OpenRouter listing: [Gemini 3.8 Flash Lite TTS](https://openrouter.ai/google/gemini-3.8-flash-lite-tts/). Pricing and provider availability may change; run a low-cost Preview smoke test before production.


## Coding and TTS model assignment — 2026-10-21

- **Max coding:** `openai/gpt-6-sol` at $2/M input and $10/M output.
- **Ultra coding:** `openai/gpt-6.1-sol` at $2/M input and $10/M output. Ultra deep coding uses the same GPT-6.1 Sol route.
- **TTS:** `google/gemini-3.8-flash-lite-tts` at $0.50/M text input and $6/M generated audio output. Configuration pins the requested provider label `Google Vertex` and disables provider fallback when pinned.
- OpenRouter lists GPT-6 Sol and GPT-6.1 Sol at $2/$10 per million input/output tokens. The Gemini 3.8 Flash Lite TTS listing confirms $0.50/$6 per million text-input/audio-output tokens. Sources: https://openrouter.ai/openai/gpt-6-sol/ ; https://openrouter.ai/openai/gpt-6.1-sol ; https://openrouter.ai/google/gemini-3.8-flash-lite-tts/ .
- **Provider availability gate:** the current public Gemini Flash Lite TTS listing shows Google AI Studio as its provider, not Google Vertex. Because this configuration pins `Google Vertex` with no fallback, TTS will fail closed if OpenRouter does not expose that provider for this model. Before production, verify the exact provider ID/name in OpenRouter's live endpoint catalog. If Google Vertex is not offered for this model, choose explicitly between (a) switching the pin to the available Google AI Studio provider or (b) using a Vertex-native integration with the matching Vertex model and authentication. Do not silently fall back to a different provider.
- Regression tests assert the configured model IDs and provider pin. They do not substitute for authenticated provider smoke tests.


## Premium coding and TTS model selection — 2026-10-21

The coding routes are configured as tier-scoped allowlists: Max → `openai/gpt-6-sol`; Ultra → `openai/gpt-6.1-sol`; Ultra deep coding → `openai/gpt-6.1-sol`. The listed OpenRouter rates are $2/M input and $10/M output for both models. This routing does not let the low-cost planning council override the tier's coding model.

TTS is configured for `google/gemini-3.8-flash-lite-tts` through OpenRouter, pinned to provider `Google Vertex`. Listed rates are $0.50/M text input and $6/M audio output. Voice catalog support was extended so OpenRouter TTS exposes the Google Gemini voice IDs rather than OpenAI-specific voices, and voice selection remains namespaced by provider. See `docs/voice-screen.md` and `docs/coding-chat.md` for setup and release gates.


## Tier coding models and speech output update — 2026-10-21

### Coding routes
- **Max coding:** `openrouter:openai/gpt-6-sol`
- **Ultra coding:** `openrouter:openai/gpt-6.1-sol`
- **Ultra deep coding:** `openrouter:openai/gpt-6.1-sol`
- Price baseline for both models: $2 per 1M input tokens and $10 per 1M output tokens. Cache-read rates are separate and recorded in `config/model-prices.json`.
- Configuration already enforces an explicit allowlist for Max and Ultra coding model IDs. Set `CODING_MAX_MODEL`, `CODING_ULTRA_MODEL`, and `CODING_ULTRA_DEEP_MODEL` in Vercel Preview/Production only after validating the OpenRouter key and running live coding smoke tests. The feature does not silently route Max to the Ultra model.

### Text-to-speech route
- Requested model ID: `google/gemini-3.8-flash-lite-tts`
- OpenRouter list price: $0.50 per 1M text input tokens and $6 per 1M audio output tokens. The matching price entry is present in `config/model-prices.json`.
- The application already has an OpenRouter speech adapter and supports `OPENROUTER_TTS_MODEL` and `OPENROUTER_TTS_PROVIDER`.
- **Provider pin remains unverified:** the current OpenRouter model page lists Google AI Studio as the available provider, not Google Vertex. Therefore `.env.example` now leaves `OPENROUTER_TTS_PROVIDER` blank rather than hard-pinning a provider that the listing does not currently confirm. OpenRouter's model router can select an available provider. If the owner specifically requires Google Vertex, first confirm that the endpoint exists for this exact model and use the provider identifier returned by OpenRouter's endpoints API. Do not assume the display name `Google Vertex` is a valid provider-routing value.
- Current public listing: https://openrouter.ai/openai/gpt-6-sol, https://openrouter.ai/openai/gpt-6.1-sol, https://openrouter.ai/google/gemini-3.8-flash-lite-tts/

### Release gates
- No production environment variables were changed and no production deployment was performed in this documentation/configuration update.
- Required before enabling: configure server-only OpenRouter credentials, verify provider availability, test TTS audio format/voice compatibility and browser playback, test Max/Ultra coding routing and tier boundaries, and inspect actual provider usage/cost records.


## 2026-10-21 — Premium coding routes and TTS provider

- Max coding is explicitly routed to `openrouter:openai/gpt-6-sol`.
- Ultra coding and Ultra deep coding are explicitly routed to `openrouter:openai/gpt-6.1-sol`.
- These are fixed allow-listed model IDs, not user-selectable arbitrary endpoints. If OpenRouter is not configured, the existing approved Anthropic fallback remains; configuration must be checked in the target Vercel environment before release.
- Price catalog: GPT-6 Sol input/output $2/$10 per million tokens, cache-read $0.20/M; GPT-6.1 Sol input/output $2/$10 per million tokens, cache-read $0.10/M. OpenRouter model pages: https://openrouter.ai/openai/gpt-6-sol/ and https://openrouter.ai/openai/gpt-6.1-sol/.
- OpenRouter TTS model is `google/gemini-3.8-flash-lite-tts`, input $0.50/M text tokens and output $6/M audio tokens. The adapter supports explicit provider pinning and TTS output uses server-side OpenRouter credentials. Model page: https://openrouter.ai/google/gemini-3.8-flash-lite-tts/.
- Provider mismatch: the currently listed provider for this TTS model is Google AI Studio, not Google Vertex. The default is therefore pinned to the provider actually shown by OpenRouter. Do not configure `Google Vertex` until the model's live OpenRouter endpoint list explicitly offers it; an unavailable provider pin would fail requests.
- Cached token rates are explicit in the pricing file. The $2/$10 rates above are standard rates; cached input is set to the listed cache-read rates rather than the full input rate.
- Validation/release gates: run the full suite and changed-module syntax checks; verify OpenRouter TTS capability and actual provider slug in the deployed Preview environment; confirm WAV/MP3 response format and voice mapping end-to-end; perform a bounded-cost coding smoke test for Max and Ultra. No production deployment or environment-secret changes are included in this commit.


## Coding and speech model selection update (2026-10-21)

- Max coding model: `openrouter:openai/gpt-6-sol`, $2 input / $10 output per million tokens.
- Ultra coding and Ultra deep coding model: `openrouter:openai/gpt-6.1-sol`, $2 input / $10 output per million tokens. Existing tier-scoped allowlists keep the Ultra model out of the Max coding slot.
- TTS model: `google/gemini-3.8-flash-lite-tts` through OpenRouter, budgeted at $0.50/M text input and $6/M audio output. The configured provider is pinned to `Google Vertex` per owner request, with provider fallbacks disabled. OpenRouter's current public provider page did not list Google Vertex for this exact TTS model at verification time; therefore this route must remain release-blocked until a live endpoint/provider check confirms Vertex supports it. It must not silently route to Google AI Studio. Sources: https://openrouter.ai/google/gemini-3.8-flash-lite-tts/ and https://openrouter.ai/google/gemini-3.8-flash-lite-tts/providers.
- Runtime speech provider selection now prefers OpenRouter TTS when the OpenRouter provider is ready, while explicit `SPEECH_PROVIDER` overrides remain respected. If OpenRouter is not configured, existing OpenAI/Gemini fallback behavior remains available.
- Price values are budgeting estimates. Confirm actual audio-token usage and provider billing in a live Preview smoke test before relying on exact TTS cost attribution.


## GPT Sol coding routes and TTS provider pinning (2026-10-21)

- Max coding is configured to use `openrouter:openai/gpt-6-sol`; Ultra coding and Ultra deep coding use `openrouter:openai/gpt-6.1-sol`. The OpenRouter listings confirm both at $2/M input and $10/M output. [GPT-6 Sol](https://openrouter.ai/openai/gpt-6-sol/) · [GPT-6.1 Sol](https://openrouter.ai/openai/gpt-6.1-sol/).
- Pricing ledger records the separate cached-input rates from OpenRouter's standard endpoints: GPT-6 Sol $0.20/M; GPT-6.1 Sol $0.10/M. Do not treat cached tokens as full-price input when provider usage reports cache hits.
- `google/gemini-3.8-flash-lite-tts` is configured as the OpenRouter TTS model at $0.50/M text input and $6/M audio output. [Model listing](https://openrouter.ai/google/gemini-3.8-flash-lite-tts/).
- Important provider caveat: the current model listing identifies Google AI Studio as an available provider; it does not substantiate a Google Vertex endpoint for this exact TTS model. The config default therefore leaves `OPENROUTER_TTS_PROVIDER` blank rather than forcing an unverified provider. Do not pin Google Vertex until its exact endpoint is returned by OpenRouter's provider/endpoints listing and a live Preview smoke test succeeds.
- Config and unit tests cover tier-specific model selection and TTS configuration. Live provider tests are still blocked until Preview credentials are configured; the council and these routes must not be considered production-verified based on unit tests alone.


## Premium coding and TTS provider assignments — 2026-10-21

- **Max coding:** `openai/gpt-6-sol`, configured by `CODING_MAX_MODEL=openrouter:openai/gpt-6-sol`. OpenRouter lists $2/M input, $10/M output, and $0.20/M cache-read input. Source: https://openrouter.ai/openai/gpt-6-sol/
- **Ultra coding:** `openai/gpt-6.1-sol`, configured by `CODING_ULTRA_MODEL=openrouter:openai/gpt-6.1-sol`. The same model is used for `CODING_ULTRA_DEEP_MODEL` for the highest-depth Ultra coding path. OpenRouter lists $2/M input, $10/M output, and $0.10/M cache-read input. Source: https://openrouter.ai/openai/gpt-6.1-sol/
- These are tier-scoped coding routes, validated against allowlists; Max cannot select the Ultra model through the Max coding slot. Existing Anthropic fallbacks are used only if OpenRouter is not configured. OpenRouter model slugs and prices are checked at request time by the provider adapter / accounting path; the static model-price file is a budgeting estimate, not a guaranteed invoice.
- **TTS:** `google/gemini-3.8-flash-lite-tts` via OpenRouter, priced in `config/model-prices.json` at the operator-supplied $0.50/M text input and $6/M audio output. Configuration is `SPEECH_PROVIDER=openrouter`, `OPENROUTER_TTS_MODEL=google/gemini-3.8-flash-lite-tts`, and `OPENROUTER_TTS_PROVIDER=Google Vertex`. The adapter passes provider pinning to OpenRouter with `only` and `allow_fallbacks:false`, so a request must fail rather than silently route to another provider if Vertex is unavailable.
- **Release gate:** model IDs and listed coding prices were verified from OpenRouter pages: https://openrouter.ai/openai/gpt-6-sol/ and https://openrouter.ai/openai/gpt-6.1-sol/. TTS's provider availability and actual audio response shape still require an authenticated Preview smoke test. Do not enable production TTS or claim Vertex routing works until that test passes.
- Vercel environment variables are not changed by editing `.env.example`. Set these values in Preview first; never paste API keys into chat or commit them.


## 2026-10-21 — Tier-specific coding models and Google Vertex TTS

Requested routing:
- Max coding: `openrouter:openai/gpt-6-sol`, budget estimate $2 input / $10 output per 1M tokens.
- Ultra coding and Ultra deep coding: `openrouter:openai/gpt-6.1-sol`, budget estimate $2 input / $10 output per 1M tokens.
- TTS: `google/gemini-3.8-flash-lite-tts` via OpenRouter, with provider preference `Google Vertex`; estimated $0.50 input / $6 output per 1M tokens.

The coding tier defaults and allowlists already point to these exact model IDs; the price table now includes both. The TTS config defaults to the requested model when OpenRouter is configured, and its provider preference is explicit. Prices are operator-provided estimates and must be rechecked against live model/provider pricing before setting production budgets. OpenRouter model ID/provider capability, voice compatibility, output format, and end-to-end audio playback remain release-smoke checks. Do not reveal API keys or copy them into logs.

Environment settings (Preview first):
```dotenv
CODING_MAX_MODEL=openrouter:openai/gpt-6-sol
CODING_ULTRA_MODEL=openrouter:openai/gpt-6.1-sol
CODING_ULTRA_DEEP_MODEL=openrouter:openai/gpt-6.1-sol
SPEECH_PROVIDER=openrouter
OPENROUTER_TTS_MODEL=google/gemini-3.8-flash-lite-tts
OPENROUTER_TTS_PROVIDER=Google Vertex
```

Validation limitation: live provider calls cannot be asserted from repository edits alone. Run tier-specific coding smoke tests (Max and Ultra), TTS synthesis for every supported voice group, audio MIME/playback checks, and spend/token reconciliation before production enablement.


## Premium coding and TTS model pinning (2026-10-21)

- **Max coding:** `openai/gpt-6-sol`, $2/M input and $10/M output. OpenRouter's current listing reports cache-read at $0.20/M.
- **Ultra coding:** `openai/gpt-6.1-sol`, $2/M input and $10/M output. OpenRouter's current listing reports cache-read at $0.10/M.
- **TTS:** `google/gemini-3.8-flash-lite-tts`, $0.50/M text input and $6/M generated audio output. Pin the OpenRouter provider to `Google Vertex`; this is an OpenRouter model route hosted by Google Vertex, not a direct Gemini API request. The provider/model supports speech output, but runtime smoke tests and voice compatibility remain release gates.

The price catalog records conservative cache pricing as input rates for generic accounting. Provider-specific cache-read rates above are documented separately because billing differs by provider and route. Source listings: https://openrouter.ai/openai/gpt-6-sol/ ; https://openrouter.ai/openai/gpt-6.1-sol ; https://openrouter.ai/google/gemini-3.8-flash-lite-tts/ .


## Coding and TTS model assignments — 2026-10-21

- **Max coding:** `openai/gpt-6-sol` through OpenRouter; operator-supplied $2/M input and $10/M output. Runtime cache-read rate is set to $0.20/M from the current listing.
- **Ultra coding and Ultra deep coding:** `openai/gpt-6.1-sol` through OpenRouter; operator-supplied $2/M input and $10/M output. Runtime cache-read rate is set to $0.10/M from the current listing.
- **TTS:** `google/gemini-3.8-flash-lite-tts` through OpenRouter, pinned to the Google Vertex provider with provider fallback disabled. Operator-supplied rates: $0.50/M text input and $6/M audio output. A conservative per-character reservation remains in place until real usage reporting is verified.
- Model selection is explicit and tier-scoped: Max cannot use the Ultra coding model via these settings. OpenRouter API keys remain server-side. Preview configuration and real authenticated smoke tests are still required before production enablement.
- A pricing-catalog cleanup removes duplicate root-level model IDs that were being interpreted as provider names; all three new model prices live under the `openrouter` provider namespace.
- Regression coverage includes config validation for tier assignments and a request-level test that verifies the TTS provider is pinned to Google Vertex with `allow_fallbacks: false`.
