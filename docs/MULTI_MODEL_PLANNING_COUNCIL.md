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
1. Added `src/ai/planning-council.js`, a bounded orchestration primitive with three roles: brainstorm, architect, critic. It takes an injected `runCandidate` callback rather than calling providers itself, allowing the caller to use existing policy and accounting.
2. Added eligibility guards for opt-in state, Max/Ultra tier, task class, sensitivity, attachments, tools, and current-fact requirements.
3. Added limits for call count, per-call token cap, context size, and per-role output size; failed roles are represented without leaking exception messages.
4. Added `test/planning-council.test.js` for eligibility, bounds, synthesis packet formation, empty goals, and safe failure behavior.

## Not yet complete — required next
- [ ] Wire the council into the actual chat path behind an explicit server-side feature flag; default must remain OFF.
- [ ] Implement the policy-backed candidate callback. It must route every specialist call through the same existing policy and durable budget/token reservations as normal chat.
- [ ] Ensure specialist calls are charged and logged individually, including failures and unknown provider usage. Never count a council response as free.
- [ ] Feed the merged council packet into the selected Max/Ultra final-model request without replacing the user's actual request, system safety instructions, or existing conversation context.
- [ ] Do not use council for sensitive requests, attachments, tool requests, current-fact/web-search tasks, unsupported task types, or any request that would exceed the remaining token/spend budget.
- [ ] Verify user-selected tier and subscription entitlement on the server. Quick/Pro must not be escalated by council metadata or client payload.
- [ ] Add integration tests proving feature-flag-off is byte-for-byte normal behavior; feature-flag-on only runs for eligible Max/Ultra requests; token/spend reservations and usage logs account for every call; failures fall back safely; and user content cannot inject policy instructions into role prompts.
- [ ] Benchmark against premium-only baseline using representative NasrinAI tasks. Record output quality, factuality, security regressions, latency, total tokens, and total cost. Do not claim savings until measured.
- [ ] Verify all configured IDs, current price rates, capabilities, tool support, context sizes, and any provider-specific request parameters using live provider documentation and a controlled smoke test.
- [ ] Run full `npm test`, syntax checks, secret scan, and `git diff --check`; review CI on PR #491.
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
