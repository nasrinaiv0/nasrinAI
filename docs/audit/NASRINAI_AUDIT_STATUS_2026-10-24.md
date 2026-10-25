## Live revalidation snapshot — 2026-10-25

Read-only checks performed against the connected production Supabase project and Vercel deployment:

- Production Vercel alias `nasrinai.com` resolved to deployment `dpl_5e213TxeUvCHMmYAiGiXrju33CVE`, state `READY`, serving `main` commit `6c829afd06aefbb141846585e78c56085cee4fd0`. This verifies deployment identity/state, not provider end-to-end behavior.
- Supabase migration registry contains labels `060`, `061`, `062`, and `055` with timestamps whose ordering does not match the numeric prefixes. Labels `057`–`059` are still absent while the corresponding Owner Console objects exist. Do not replay or fabricate migration history; compare exact SQL definitions and live schema before reconciling.
- `public.openrouter_logs` exists with RLS enabled and zero policies. Current grants show `postgres` and `service_role`; no `anon` or `authenticated` grants were returned. RLS with no policies is fail-closed for browser roles, but Supabase reports an informational `rls_enabled_no_policy` lint. PR #610 adds an explicit restrictive deny policy plus regression coverage as defense in depth; it is not yet applied to production.
- Supabase Auth advisor reports leaked-password protection disabled (warning). This is an Auth dashboard/project setting, not a SQL migration; it remains an operator action and must be verified in Auth settings after enabling.
- The current production runtime error summary includes one historical Connect site-analysis failure: `redirect_not_allowed` on `/api/index` at 2026-10-24T14:43:20Z. The safe fetcher intentionally rejects redirects; inspect the site URL and decide whether bounded, DNS-revalidated HTTPS redirects can be supported without weakening SSRF protection. This error is not yet fixed.
- Source inspection confirms image, video, speech, and transcription adapters are wired in `src/main.js`; semantic-cache embeddings currently use OpenAI and are optional. The generic capability-adapter module's unit tests are not evidence that every registry capability (embeddings, reranking, structured decisions) is integrated. Keep unverified categories disabled.

**Phase 3–5 status remains OPEN.** PR #610 is a scoped database defense-in-depth fix; migration-history reconciliation, the Auth setting, provider live smoke tests, billing/idempotency checks, and production end-to-end reliability tests remain required before the audit can close.

---

# NasrinAI Audit Status — 2026-10-24

## Purpose and status

This document consolidates the audit phases and current remediation evidence. It is a working status record, not a declaration that the platform is fully audited or production-verified. Items are only marked complete when evidence supports closure.

## Universal provider-routing requirement

All supported NasrinAI capabilities must use automatic, capability-aware provider selection: general chat, text-to-text, coding, image generation, video generation, audio/voice, and other supported tools.

Routing must:
- Select only providers/models that support the requested modality, plan, region, and required tool behavior.
- Fail over automatically when a provider/model is unavailable, out of credits/quota, rate-limited, timing out, or returns a retryable/compatibility error.
- Use bounded retries, timeouts, circuit breaking/cooldowns, and idempotency where applicable; never retry indefinitely or duplicate paid jobs.
- Distinguish transient/provider errors from invalid user input, policy refusals, and non-retryable errors.
- Preserve tier entitlements, privacy rules, safety policy, rate limits, and usage budgets during fallback.
- Record provider/model selection, attempt outcomes, latency, request correlation, and provider-reported usage/cost without leaking credentials or sensitive prompts into logs.
- Use provider-reported billing/usage as the source of truth; do not block functionality solely because local model price metadata is missing. Enforce budget limits using a safe, explicit policy when provider cost is unknown.
- Report a clear error if all eligible routes fail; never fabricate successful output.
- Keep provider/model IDs and capability metadata centrally configured and validated. Do not assume a model exists or supports an operation based on its name alone.

## Phase tracker

### Phase 1 — Security and access controls
Status: OPEN — revalidation required.
- Re-run secret scanning and verify no credentials are committed.
- Verify authentication/session handling, owner-only endpoints, access checks, rate limits, CORS/CSP, and safe error responses.
- Verify production Supabase RLS and function grants against the current schema.
- Verify Vercel environment scoping and secret presence without exposing secret values.

### Phase 2 — Intent analysis and orchestration
Status: PARTIALLY IMPLEMENTED — end-to-end validation required.
- Intent-analysis changes were previously reported merged in PR #551.
- Test across chat, coding, image, video, audio, document, and tool-use prompts.
- Verify correct modality routing, tier/provider selection, context/tool handling, and graceful fallback.

### Phase 3 — Database integrity and migrations
Status: OPEN — reconciliation and live verification required.
- Reconcile migration history with the actual production schema; inspect pending/conflicting migration identifiers.
- Verify RLS, grants, indexes, constraints, functions, triggers, and storage policies.
- Validate spend reservation/settlement/reconciliation invariants and idempotency.
- Do not mark complete based on migration-file presence alone; inspect live database state.

### Phase 4 — Providers, deployment, images and video
Status: IN PROGRESS — live generation not yet confirmed.
- PR #561 addressed image provider/model default pairing and added regression coverage; the PR was reported merged.
- Image-tier environment routing was updated for tiers 1–4. The production environment must be rechecked after deployment and the exact model IDs/capabilities validated against provider catalogs.
- VIDEO_ENABLED was set to true during remediation. This is configuration only; it does not prove that the video adapter, selected model, quota, credit balance, billing, duration limits, and output storage all work.
- Run authenticated smoke tests for each enabled image tier, video, and each configured provider. Verify generated artifacts and usage/billing records.
- Confirm the current production alias serves the intended commit and environment configuration.
- OpenAI direct API availability must not be assumed when its credential is absent; OpenRouter access is a separate route and requires its own successful test.

### Phase 5 — Reliability, regression and release
Status: OPEN.
- Run the full test suite and required CI/security/documentation/database gates against the final commit.
- Test failover for provider outage, insufficient credits/quota, rate limits, timeouts, malformed responses, unsupported models, and exhausted alternatives.
- Verify no duplicate charges/jobs and accurate usage accounting after retries.
- Test production end-to-end workflows and mobile UX; record results and evidence.
- Close the audit only after all critical/high findings are fixed or explicitly risk-accepted and verified.

## Current evidence and limitations

- PR #561 was reported merged; the changelog documents the image provider/model pairing fix and regression coverage.
- A production deployment was triggered and a deployment was reported READY. READY means deployment completed; it does not prove all production routes work.
- Production image and video generation success has not yet been confirmed end to end.
- Provider-wide failover, provider credit detection, billing reconciliation, and all current production database/security findings remain to be revalidated.
- Prior test counts and historical RLS pass counts are historical evidence only until rerun against the current branch and live environment.

## Required verification checklist

- [ ] Confirm latest production deployment commit and active alias.
- [ ] Verify each provider credential/configuration by presence/status without revealing secret values.
- [ ] Validate each provider's live model catalog and modality support.
- [ ] Run text-to-text/general chat tests through primary and fallback routes.
- [ ] Run coding tests, including tool use where supported.
- [ ] Generate and inspect a real image for each enabled tier.
- [ ] Generate and inspect a real video within the selected model's supported duration/format limits.
- [ ] Simulate/verify provider unavailable, exhausted quota/credits, rate limit, and timeout failover.
- [ ] Verify usage, provider-reported costs, spend reservations, settlement, and no duplicate billing.
- [ ] Reconcile production migrations and verify RLS/grants/storage policies.
- [ ] Run all CI, regression, security, and documentation gates.
- [ ] Publish final audit summary listing fixed items, unresolved items, evidence, and residual risks.

## Change discipline

Do not claim an issue is fixed solely because code was changed, a deployment is READY, an environment variable exists, or a unit test passes. Mark an item verified only with evidence from the relevant test or production observation. Never expose secret values in audit output.
