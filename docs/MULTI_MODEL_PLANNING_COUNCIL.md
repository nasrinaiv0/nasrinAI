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
- [x] Run full `npm test` and syntax checks for changed JavaScript; `git diff --check` passed. Latest full suite: 865 tests, 864 passed, 0 failed, 1 skipped.
- [x] Secret scan passed: no secrets found in 606 files. CI and Documentation Gate passed for the prior tested commit; recheck after the final integration edits.
- [ ] Keep production disabled until all release gates pass and a separate release decision is made.

## Operator-supplied model rates (not independently verified)
The user supplied these OpenRouter/provider rates in USD per 1M tokens. Treat them as proposed configuration values only; verify current exact model identity, provider route, pricing unit, cached-input rate, modality/tool support, and API schema before enabling them in any route.

| Model ID | Input | Output | Verification state |
|---|---:|---:|---|
| `deepseek/deepseek-v4.1-flash-1017` | 0.07 | 0.50 | Operator-supplied; verify |
| `typesafe/jev-1.13` | 0.042 | 0 | Operator-supplied; verify exact listing and capabilities |
| `openai/gpt-6-luna-pro` | 0.10 | 0.50 | Operator-supplied; verify ID and billing behavior |
| `openai/gpt-6-luna` | 0.10 | 0.50 | Operator-supplied; verify ID and billing behavior |
| `openai/gpt-6-luna-decisions` | 0.10 | 0 | Operator-supplied; verify API schema and billing |
| `google-vertex/global` | 0.10 | 0.50 | Not a sufficiently specific model ID; verify endpoint and SKU |
| `anthropic/claude-haiku-5.5` | 0.10 | 0.50 | Operator-supplied; verify ID and billing behavior |
| `xiaomi/mimo-v2.6-pro` | 0.387 | 0.783 | Operator-supplied; verify |
| `qwen/qwen3.8-flash` | 0.15 | 0.47 | Operator-supplied; verify |
| `qwen/qwen3.8-27b` | 0.02 | 0.50 | Operator-supplied; verify |
| `inclusionai/ling-3.1-flash` | 0.075 | 0.225 | Operator-supplied; verify |
| `perplexity/pplx-decider-v1.2` | 0.02 | 0 | Operator-supplied; verify API shape and billing |

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
