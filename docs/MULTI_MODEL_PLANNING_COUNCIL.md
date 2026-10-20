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
- [x] Run full `npm test` and syntax checks for changed JavaScript; `git diff --check` passed. Latest full suite: 866 tests, 865 passed, 0 failed, 1 skipped.
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

- 2026-10-21 validation rerun after catalog/pricing/diversity changes: 866 tests, 865 passed, 0 failed, 1 skipped; syntax checks and JSON parse passed; `git diff --check` passed; secret scan found no secrets in 606 files.
