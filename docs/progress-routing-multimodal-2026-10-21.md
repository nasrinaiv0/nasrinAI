# NasrinAI Routing & Multimodal Progress — 2026-10-21

## Purpose

This document records the implementation state at the point work paused, separating code/documentation already present from planned behavior and release gates that remain open. It covers the OpenRouter multimodal work in PR #491 and the intended Quick / Pro / Max / Ultra routing policy.

## Source of truth and release constraints

- **Vercel environment configuration is the single source of truth** for operational configuration: provider credentials, selected model IDs, provider/model fallback order, pricing/cost settings, and feature enablement.
- Application code may define environment-variable names, schemas, validation, capability checks, and safe policy enforcement. It must not silently fall back to hard-coded operational model IDs, provider choices, API keys, prices, or fallback lists.
- Secrets must remain server-side. Never use public client variables for credentials or expose secret values in chat, logs, browser output, or documentation.
- Do not merge PR #491 or deploy it to production until the release gates below are met. The PR is currently marked Draft.
- Free-tier availability is provider-controlled and changes over time. A model being listed as free does not prove it is configured in Vercel, enabled for Quick, available in the user's region, or free for every modality.

## Current repository checkpoint

- Repository: `primusco20/nasrinAI`
- Pull request: [#491 — OpenRouter multimodal quality and security integration](https://github.com/primusco20/nasrinAI/pull/491)
- Branch: `feat/openrouter-multimodal-quality-security`
- Recorded head at checkpoint: `23782e485733594a48a17598e8d8c92faf18a912`
- PR status at checkpoint: open, Draft, not merged.
- The GitHub combined status query returned a successful Vercel status for this head. This alone does **not** establish that all test suites passed, that the deployment is the intended preview, or that end-to-end provider workflows work.
- Last PR metadata reported 14 changed files and 55 commits. Recheck the live PR before relying on this checkpoint; later commits may have moved the head.

## Work already present in PR #491

The following items are described in the PR and represented in its changed-file set. They are implemented to some degree in code, but still require the release validation below.

1. **Task-aware OpenRouter text adapter**
   - Accepts the policy-classified task.
   - Validates exact configured model IDs against live text/tool capabilities.
   - Applies a data-collection-denial setting to chat requests.
   - Rejects unsupported attachments and unsuitable free-model task downgrades.
   - Structured decisions use the dedicated Decisions API path rather than being treated as ordinary chat.
   - A decision adapter is implemented/tested, but the PR notes that no existing NasrinAI business workflow currently calls it to make routing decisions.

2. **OpenRouter image integration**
   - Dedicated image generation/editing adapter for configured GPT Image family model IDs documented in the provider guide.
   - Checks live endpoint capabilities, quality/aspect-ratio/reference limits, and advertised image pricing before generation.
   - Uses provider-reported image usage cost for settlement when available.
   - Configured model IDs and price estimates must be validated against current provider data before enabling paid routes.

3. **OpenRouter video integration**
   - Connects to the existing NasrinAI video job lifecycle using a single-shot provider adapter.
   - Checks supported duration, resolution, aspect ratio, and live catalog pricing.
   - Keeps the conservative maximum clip duration at 8 seconds until safe extension support is implemented.
   - Requires explicit configuration for the video provider/model and cost estimate; video must remain disabled when the required configuration is absent or invalid.

4. **Other provider catalog and docs**
   - Removes standalone Z.ai from the free-provider catalog and updates related regression tests.
   - Updates `docs/free-llm-provider-pool.md`, `docs/pr-change-log.md`, and `CHANGELOG.md`.
   - Documents candidate video model identifiers including `google/veo-3.1-fast`, `google/veo-3.1-lite`, `heygen/heygen-video-1`, `alibaba/happyhorse-1.1`, `alibaba/wan-2.7`, and `alibaba/wan-3.0`. These are documented candidates, not proof that every model has been live-tested end to end or enabled in Vercel.

5. **Regression coverage**
   - Adds/updates tests in `test/openrouter.test.js` and `test/free-provider-pool.test.js`.
   - The current-head full CI result was not confirmed in the checkpoint. Do not infer a green test suite from the Vercel status alone.

## Intended tier-routing policy (design target, not proof of production behavior)

One orchestrator should serve all tiers. The tier controls entitlement and eligible resource ceilings; task classification chooses the modality and capability requirements; the router then chooses the best eligible configured model. Do not create separate foundation models for each profession or tier.

| Tier | Intended policy | Important boundaries |
|---|---|---|
| **Quick** | Free-eligible Gemini model first when configured and verified; then a configured, verified free compatible fallback such as an OpenRouter free model. Suitable for everyday chat, simple summaries, and lightweight tasks. | Never assume a free model is configured or still free. No video. Up to 2 image generations/day per the product policy, only when a verified eligible route is available. Do not silently incur paid charges. |
| **Pro** | Select the best configured general-purpose model for productivity tasks; use a compatible fallback from another configured provider. | Apply Pro allowance and budget rules. On exhaustion, follow the explicit Quick downgrade policy rather than continuing paid calls invisibly. |
| **Max** | Prefer configured high-capability reasoning or coding models for complex analysis, code changes, and multi-step workflows. | Fallback must preserve the task's required capabilities, tool use, privacy, and budget. Do not substitute generic chat for a required coding workflow. |
| **Ultra** | Select the strongest eligible configured model for the task, with a compatible independently available fallback. Supports premium multimodal/workflow capabilities only where explicitly enabled. | Highest tier does not bypass safety, access control, privacy rules, quotas, or spending limits. |

### Modality routing

- **Chat/reasoning:** choose by classified task, context needs, capability, privacy policy, tier, and cost.
- **Coding:** require a verified code-capable model and preserve tool/function calling and iterative execution. If no suitable model is available, return a clear retryable/configuration error rather than pretending ordinary chat completed the task.
- **Image:** use the dedicated image endpoint and enforce live capability and pricing checks; do not fall back to text chat.
- **Video:** use the dedicated video adapter and existing asynchronous job lifecycle; do not blindly retry a create request after an ambiguous timeout.
- **Speech/transcription:** use their dedicated configured provider/model and capability checks; do not assume chat models support speech or transcription.
- **Research/search and other tools:** route only through configured integrations and authorized tools; a model's text capability alone does not prove that the required tool exists.

## Remaining work and release gates

### P0 — Required before calling routing complete

- [ ] Recheck the current PR head and obtain green CI/test results for that exact SHA.
- [ ] Audit all routing/config code for hard-coded operational provider choices, model IDs, pricing, and fallback order. Move operational choices to Vercel env configuration; retain only schemas, variable names, and safety invariants in code.
- [ ] Inspect actual Vercel environment-variable names and scopes without displaying secret values. Compare them with code requirements. Do not ask the user to add speculative variables before this inventory.
- [ ] Implement and test cross-provider failover for image, video, speech, and transcription where safe. Preserve modality, quality, references, privacy, tier, and cost ceilings.
- [ ] For asynchronous video, make create/retry behavior idempotent or otherwise prove whether a job was accepted before retrying. Never create duplicate paid jobs due to an ambiguous timeout.
- [ ] Complete durable video usage/cost reconciliation against the asynchronous job's spend reservation and stored job record.
- [ ] Run live-provider tests for video job creation, status polling, result/download format, advertised capability schema, and pricing schema for each enabled model.
- [ ] Verify task-aware coding routing, provider failure recovery, tool-call execution, and clear failure behavior when no suitable fallback is available.
- [ ] Verify the Decisions API route and response schema, and connect it to a real business workflow only if that workflow genuinely needs structured decisions.
- [ ] Run a preview smoke test through authenticated app flows and validate logs, persistence, and settlement without exposing credentials.

### P1 — Tier and free-model policy

- [ ] Inventory existing Quick / Pro / Max / Ultra entitlement and allowance enforcement before changing any limits.
- [ ] Confirm the exact configured free model IDs against current provider catalogs and current Vercel configuration. Keep model IDs and fallback order in Vercel, not in source-code defaults.
- [ ] Ensure free-model allowlists are exact-match and fail closed when status or price is unknown.
- [ ] Ensure provider privacy/data-use restrictions are honored; do not send sensitive content to a provider whose policy is incompatible with the user's settings.
- [ ] Confirm the Quick image allowance and paid-tier downgrade behavior in tests. Video stays disabled for Quick.
- [ ] Confirm usage accounting, rate limits, per-user budgets, provider spend caps, and reset windows remain independent and enforced.

### P2 — Operations and observability

- [ ] Log chosen provider/model, task class, fallback reason, latency, usage, and settlement status without secrets or sensitive prompt content.
- [ ] Add alerts for provider outage/rate-limit spikes, cost reconciliation failures, repeated fallback, and unknown catalog pricing.
- [ ] Document operational recovery steps for unavailable or retired free models and providers.

## Safe next sequence

1. Inspect the live PR head and exact-head checks.
2. Audit routing code and Vercel variable names/scopes in read-only mode; never reveal values.
3. Close configuration gaps and implement the missing failure-handling and settlement work on the PR branch.
4. Add regression tests, then run the full suite and exact-head CI.
5. Validate enabled models and pricing in preview, followed by authenticated end-to-end smoke tests.
6. Review all release gates. Keep the PR Draft and production untouched until the gates are demonstrably green.

## Manual action needed right now

**No Vercel changes are requested at this checkpoint.** Keep PR #491 in Draft and do not merge or deploy it to production. The next step is to verify the live configuration and implementation first, then request only the specific missing environment variables or provider-dashboard actions supported by that audit.
