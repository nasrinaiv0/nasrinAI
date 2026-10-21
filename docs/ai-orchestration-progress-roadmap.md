# NasrinAI AI Orchestration — Progress and Upgrade Roadmap

**Last updated:** 2026-10-21  
**Repository:** `primusco20/nasrinAI`  
**Status:** Progress record and future implementation plan; not a claim that every item below is implemented or production-verified.

## Purpose

Keep a durable record of the AI provider/model decisions, known operational blockers, and the next orchestration improvements. Future work must extend existing routing and provider adapters instead of building a second, competing router.

## Current baseline and evidence

- PR #491 (`feat/openrouter-multimodal-quality-security`) was merged into the feature branch. Its merge commit was `17e6bc9e926dfc9f5b96d53313323b2fc07e77ae`.
- PR #492 (`feat/ai-provider-gemini-openai-claude` → `main`) was subsequently merged to integrate that feature branch into `main`. Verify the current deployment and commit in GitHub/Vercel before relying on this historical note.
- Existing router implementation: `src/ai/router.js`; provider catalog: `src/ai/free-provider-catalog.js`; primary configuration: `src/config.js`; routing guidance: `docs/routing.md`.
- The router accepts a selected `{ provider, model, effort }` route, makes a single chosen provider attempt first, and can use a configured fallback pool for eligible provider failures. It records provider/model and attempted routes for usage telemetry. It should not call every provider/model for one user request.
- `docs/routing.md` documents task levels, tier gates, budget reservations, and media/realtime accounting. Read that document before changing routing behavior.
- The provider catalog is a list of integrations and possible free-pool defaults, **not proof** that every listed provider/model is enabled, available, free, or called in production.
- A model name appearing in a prior conversation or catalog is not evidence that it is a current, valid provider model ID. Verify IDs and capabilities against provider documentation and a controlled live smoke test before activation.

## Model and provider decisions captured so far

### Explicitly requested model assignments

- Max coding: `openai/gpt-6-sol` through OpenRouter.
- Ultra coding: `openai/gpt-6.1-sol` through OpenRouter.
- TTS: `google/gemini-3.8-flash-lite-tts` through OpenRouter, with Google Vertex intended as the underlying provider route. Verify the actual API endpoint, model ID, and billing provider before release.

### Repository routing references

The repository's `docs/routing.md` and tests reference:
- General task routing by complexity, choosing the least expensive eligible candidate rather than the strongest model for every prompt.
- Claude Sonnet 5.5 for Max coding and Ultra coding levels 2–3.
- Claude Opus 5.5 for Ultra's highest-complexity coding levels 4–5.
- Fallback to an eligible same-level provider when Anthropic is unavailable.
- Other OpenAI/Gemini options as configured by routing settings.

Treat these as documented routing intentions until the exact current `main` configuration and runtime behavior are verified. Model IDs and provider availability can change; do not hard-code historical model names in multiple files.

### Multimodal areas to inventory and verify

Maintain an explicit registry for:
- Text/chat and reasoning
- Coding
- Decision/planning
- Image understanding and image generation
- Video generation and video job polling/download
- Speech transcription / audio input
- Text-to-speech and audio output
- Extraction / structured output
- Research / web search
- Artifacts and document processing
- Embeddings / semantic cache, if enabled

For every entry record: provider, exact model ID, purpose, supported inputs/outputs, tier eligibility, region/data handling, price source and last verified date, timeout/retry behavior, fallback eligibility, and live verification status. Do not present an old inventory from chat as a definitive production model list.

## Production incident noted on 2026-10-21

Vercel logs/screenshots showed repeated HTTP 503 responses for routes including `/v1/status`, `/v1/professionals`, `/v1/auth/refresh`, and Video Studio endpoints. A function log reported `configuration initialization failed` at stage `loadConfig`; earlier investigation also identified missing Supabase/guest-session configuration in a Preview runtime. A later discussion identified three required weekly video-duration variables:

- `VIDEO_PRO_WEEKLY_SECONDS`
- `VIDEO_MAX_WEEKLY_SECONDS`
- `VIDEO_ULTRA_WEEKLY_SECONDS`

Suggested starting values (not yet proof they were set or deployed):
- Pro: `300` seconds/week (5 minutes)
- Max: `1800` seconds/week (30 minutes)
- Ultra: `7200` seconds/week (2 hours)

These limits are weekly aggregate quotas; enforce a separate per-job cap. The existing product requirement says Ultra videos are limited to 60 seconds per video. Configure variables in the intended Vercel environment, redeploy, and verify live status and affected routes. Never weaken startup validation or copy production secrets into Preview automatically. Do not record secret values in this document.

Other log warnings about `@napi-rs/canvas` and PDF.js DOM polyfills were observed; investigate separately, but do not mistake warnings for the configuration initialization blocker without evidence.

## Future orchestration upgrades

### P0 — Reliability and safe rollout

1. Add a deterministic configuration audit that validates required environment-variable *presence and format* without printing secret values.
2. Make startup errors name missing setting names and deployment environment safely; redact values and credentials from all logs.
3. Add a CI test that validates each supported tier/provider combination and rejects unknown model IDs or incompatible capabilities.
4. Add a production smoke-test checklist for `/v1/status`, `/v1/models`, `/v1/professionals`, authentication refresh, and representative image/audio/video routes.
5. Keep expensive video generation behind release gates until weekly duration enforcement, provider job lifecycle, polling/download provider consistency, cost reservation, and cancellation/timeout behavior pass tests.
6. Verify each PR head's CI and deployed commit. A GitHub mergeable state or HTTP 200 from the home page is not sufficient evidence of a healthy API.

### P1 — Single auditable model registry

Create one canonical model registry (or extend the existing routing config) rather than scattering IDs across code. Each model entry should include:
- Stable internal capability name and exact provider model ID
- Provider adapter and endpoint family
- Task modalities and capability flags (vision, PDF, audio input, transcription, TTS, image, video, tools/JSON schema)
- Tier allowlist and task allowlist
- Cost metadata with source URL, currency, input/output/media units, effective date, and freshness status
- Context/output limits when verified
- Timeout, retry, concurrency, and idempotency behavior
- Privacy/data residency/training policy metadata
- Status: proposed, configured, smoke-tested, production-enabled, deprecated

At startup/CI, validate the registry against routing references. Avoid treating provider model-list endpoints as sufficient proof that every listed model is compatible.

### P1 — Intent and capability orchestration

Use a lightweight, bounded decision pipeline:
1. Normalize the request and identify task type, required modality, user-selected profession, attachment types, desired output format, and complexity.
2. Apply hard safety, privacy, tier, quota, region, and capability gates before candidate selection.
3. Prefer deterministic/local handling for simple arithmetic, formatting, and other safe operations that do not need a model.
4. Rank only eligible candidates by quality fit, verified cost, latency, reliability, and context needs.
5. Make one primary call. Use a limited, explicit fallback only for retryable/unavailable/configuration failures and only when the fallback can handle the same task and privacy constraints.
6. Do not fan out to every provider. Parallel calls should require a separately justified product need, strict budget and timeout caps, and an explicit evaluation design.
7. Validate the result (schema, safety, attachment grounding, completeness); retry or escalate at most within configured bounds.
8. Return the answer plus trustworthy resources/sources when the task requires them; do not invent citations or claim research was performed when it was not.

### P1 — Multimodal job orchestration

- Route image, audio, transcription, TTS, and video through modality-specific adapters rather than pretending all are ordinary text completions.
- Keep a video job bound to the same provider/model family that created it for status polling, cancellation, and download unless the provider contract explicitly supports transfer.
- Enforce per-user and per-tier weekly seconds, per-video duration, concurrency, file-size/MIME, spend ceilings, and provider-specific limits before job creation.
- Track job states idempotently; handle retries, timeouts, partial failure, cancellation, cleanup, and provider outages.
- Validate that output MIME/type, dimensions/duration, and file size match the requested contract before making assets available.

### P1 — Cost and usage correctness

- Reserve estimated spend atomically before paid calls and settle using provider-reported usage when available.
- Record logical user requests separately from provider attempts and fallbacks to prevent double-counting.
- Store provider, model, tier, task, token/audio/image/video units, estimated and actual cost, currency, pricing source/version, outcome, latency, fallback reason, and request correlation ID.
- Keep secrets, prompts, private attachment contents, and personal data out of telemetry by default.
- Treat unknown or stale pricing as a reason to refuse or step down paid work, not to assume zero cost.
- Keep provider-side spending limits enabled in addition to application-level budgets.

### P2 — Evaluation and continuous improvement

- Build a redacted task benchmark covering factual Q&A, coding, reasoning, source attribution, structured extraction, image understanding, transcription, TTS, and video jobs.
- Score correctness, grounding, format compliance, latency, availability, privacy compliance, and cost—not just model preference.
- Compare candidate models offline and in controlled shadow evaluation; never silently send user data to extra models for benchmarking.
- Use canary rollout and automatic rollback criteria for routing changes.
- Record every routing-policy version so regressions can be tied to a change.

### P2 — Owner visibility

Expose an owner-only orchestration dashboard with:
- Actual provider/model usage and last-verified status
- Requests vs provider attempts, fallbacks, failures, latency, token/media usage, estimated vs actual cost
- Model and provider filters; daily/weekly/monthly trends
- Stale prices, unknown models, missing environment settings, quota exhaustion, and failing health checks
- Audit trail for routing/config changes

Protect owner access server-side; do not rely on hiding a button in the UI. Do not expose internal provider keys, secret values, private prompts, or stack details to ordinary users.

## Acceptance criteria for future orchestration PRs

- Existing behavior is preserved unless the PR explicitly documents a justified change.
- A request uses one primary model; fallback is bounded and observable.
- No provider receives data unless it passes tier, privacy, task, and capability gates.
- Model IDs and pricing have authoritative sources and freshness metadata.
- Tests cover normal routing, unavailable provider, invalid config, budget refusal, privacy gates, attachments, and fallback limits.
- CI passes on the exact PR head; security review checks secret handling, SSRF, input validation, tenant isolation, and log redaction.
- Staging smoke tests pass for every changed modality before production rollout.
- Documentation states what is implemented, what is proposed, what is blocked, and what remains unverified.

## Immediate next actions

1. Verify the latest production deployment commit and check the exact configuration error from runtime logs.
2. Configure and verify the three weekly video-seconds values in the correct environment; redeploy and smoke-test the API.
3. Produce a source-of-truth model inventory from `src/config.js`, routing config, provider adapters, pricing tables, and a safe runtime `listModels()` report. Label each model as configured, reachable, and production-used separately.
4. Update this document whenever a model route, provider adapter, quota, or orchestration behavior changes.
