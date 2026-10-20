# NasrinAI Comprehensive Audit & Remediation Plan
**Audit date:** 2026-10-20  
**Repository:** `primusco20/nasrinAI`  
**Purpose:** Actionable implementation brief for Claude/code agent. Treat this as a remediation plan, not proof that every listed item is exploitable or broken.

## Execution rules
1. Start by inspecting the current `main`, open PRs, current migrations, and existing implementations. This document records an audit snapshot; code may have changed since it was written.
2. Do not expose secrets, environment values, access tokens, customer data, or provider credentials in logs, PR comments, screenshots, or generated reports.
3. Do not apply production SQL, rotate credentials, merge PRs, change environment variables, or deploy without the repository owner explicitly authorizing that action. Prefer reviewed migration files and a PR.
4. Never add broad RLS policies such as `USING (true)` for user data. Use least privilege and validate ownership with `auth.uid()` or the project's established tenant model.
5. Preserve current functionality. Add regression tests before or alongside fixes. Do not claim a feature is fixed until tests and evidence verify it.
6. Work in small, reviewable commits. Do not overwrite unrelated changes or close/merge unrelated PRs.
7. Keep an audit checklist updated with **Implemented / In progress / Blocked / Verified** states and links to commits, tests, migrations and deployment evidence.

## Executive summary
NasrinAI has a substantial codebase and documented features for chat/model routing, authentication, image/video, voice, knowledge/memory, payments, connectors, NCC and Video Studio. The audit found several concrete hardening and release-readiness items. Feature documentation is not equivalent to a successful live end-to-end test.

### High-priority findings from the 2026-10-20 snapshot
- Four public tables have RLS enabled but **zero policies**:
  - `public.user_provider_credentials`
  - `public.video_studio_audio_assets`
  - `public.video_studio_projects`
  - `public.video_studio_timeline_items`
- Supabase Auth leaked/compromised-password protection was reported disabled.
- Open draft PR #409 concerns universal user-owned integration security; its description says provider credential persistence, server-side ownership enforcement, and provider isolation tests still need work.
- PR #485 navigation cleanup had recorded CI test failures; a newer run was pending during the snapshot. Re-check current state before acting.
- The latest main-branch CI run inspected after PR #484 passed, but this does not establish that open PRs or every production workflow pass.
- The inspected failed CI workflow skipped later syntax and secret-scan steps after the test step failed. Ensure security checks still run on test failure while the overall workflow remains failed.
- Video Studio release notes say guaranteed/server-side MP4 rendering is not implemented, browser export emits only a supported MIME type (MP4 or WebM), and real iOS Safari/tablet/desktop export QA remains required. Browser export is capped at 40 clips and 180 seconds.
- The connected Vercel deployment was reported as BUILDING and project metadata `live=false`; this alone does not prove the public custom domain is down. Re-check current deployment and production health.
- Supabase performance advisor reported 8 unindexed foreign keys and 18 unused indexes. Review before changing indexes; do not blindly drop indexes.
- Migration registry snapshot included 017, 024, 025, 026, 041, 046, 051 and 052. This is a reconciliation warning, not proof that every other numbered migration is missing or unapplied.

References:
- Repo: https://github.com/primusco20/nasrinAI
- PR #409: https://github.com/primusco20/nasrinAI/pull/409
- PR #485: https://github.com/primusco20/nasrinAI/pull/485
- Main CI run #4174: https://github.com/primusco20/nasrinAI/actions/runs/39410519879
- Failed CI run inspected: https://github.com/primusco20/nasrinAI/actions/runs/39413467517
- Supabase RLS guidance: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Supabase password security: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Supabase FK lint: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Phase 0 — Revalidate snapshot before edits
- [ ] Fetch current main SHA, open PR list, latest CI runs, current Vercel deployment and Supabase advisors.
- [ ] Inspect current definitions of the four tables, grants, RLS policies, triggers, foreign keys, storage policies, server routes and service-role usage.
- [ ] Compare repo migration files to the live migration registry and schema; identify applied/unapplied migrations without executing them.
- [ ] Identify any remediation already merged after the audit date; mark it complete only with current evidence.
- [ ] Produce a short current-state matrix before implementation.

**Acceptance:** no duplicate fixes, no blind migration replay, and every issue has a current reproduction or an explicit reason it cannot yet be verified.

## Phase 1 — RLS and data isolation (P0)
Tables:
- `public.user_provider_credentials`
- `public.video_studio_audio_assets`
- `public.video_studio_projects`
- `public.video_studio_timeline_items`

Tasks:
- [ ] Trace the ownership/tenant columns and all legitimate access patterns for each table.
- [ ] Write reviewed, least-privilege policies for SELECT/INSERT/UPDATE/DELETE as required. Validate both `USING` and `WITH CHECK` where applicable.
- [ ] Ensure child assets/timeline rows cannot be attached to another user's project by forging IDs.
- [ ] Ensure credential records are never readable by arbitrary clients; prefer server-only access when the design requires it. Never expose provider secrets to browser responses.
- [ ] Review table grants for `anon`, `authenticated`, `service_role`, and PUBLIC. RLS does not replace grants, and service-role access bypasses RLS.
- [ ] Review Storage bucket policies and signed URL expiry/ownership for Studio assets.
- [ ] Add SQL/database tests for unauthenticated denial, owner allow, other-user denial, forged foreign keys, update ownership changes, deletes, and service-route authorization.
- [ ] Add migration(s) in the project's established naming convention; document rollback and deployment order.
- [ ] Re-run Supabase security advisor and verify the four tables have appropriate policy counts and expected behavior.

**Acceptance:** unauthorized cross-user reads/writes fail in automated tests; intended owner actions succeed; no permissive catch-all policy; advisor findings are resolved or explicitly justified.

## Phase 2 — Auth hardening (P0)
- [ ] Verify current Supabase Auth configuration.
- [ ] Enable leaked/compromised-password protection using supported project settings; document any dashboard-only action for the owner rather than pretending it was changed in code.
- [ ] Test password sign-up/change/reset behavior and expected rejection of known compromised passwords, without putting test credentials in logs.
- [ ] Review OAuth callback allowlists, redirect URLs, cookie Secure/HttpOnly/SameSite settings, session refresh, sign-out invalidation and account switching.
- [ ] Add regression tests for guest-to-user transition, Safari cookie behavior and cross-account session isolation.

**Acceptance:** the live setting is verified after authorized configuration; authentication regression suite passes.

## Phase 3 — Integration credentials and SSRF defenses (P0/P1)
Related work: PR #409.
- [ ] Audit every provider credential read/write/delete path and all integrations, not just one provider.
- [ ] Enforce authorization server-side on every request. Derive user identity from a verified session; never trust a user ID supplied in request JSON as authorization.
- [ ] Encrypt credentials at rest using the project's approved key-management approach. Validate key configuration at startup without printing key material. Plan rotation and failure behavior.
- [ ] Keep provider secrets server-side; redact secrets from exceptions, telemetry, analytics and model prompts.
- [ ] Add cross-account tests for credential CRUD and provider calls, including guessed IDs and revoked connections.
- [ ] For URL-fetching, research, import and webhook features, defend against SSRF: block loopback/private/link-local/metadata destinations, validate DNS resolution and redirects, restrict protocols and ports, and re-check every redirect/resolution. Avoid DNS-rebinding gaps.
- [ ] Validate webhook signatures, timestamps, replay/idempotency and resource ownership where relevant.
- [ ] Review provider scopes and token revocation on disconnect.

**Acceptance:** PR has threat model, provider-by-provider coverage, negative tests, no client credential exposure, and reviewed rollback/rotation notes.

## Phase 4 — CI reliability and release gates (P0)
- [ ] Inspect current failing assertions for PR #485 and fix root causes rather than weakening tests.
- [ ] Re-run full unit/integration/database tests on the current PR head.
- [ ] Configure test, syntax, lint/type-check and secret-scan jobs to run independently where safe (e.g. separate jobs or `if: always()` for reporting). A test failure must still make the overall required check fail.
- [ ] Ensure secret scanning checks the full diff and relevant history/push scope; never print secret values in failure output.
- [ ] Keep dependency audit, migration checks and build checks required for merge.
- [ ] Verify required branch protection/status checks reflect the intended gates.
- [ ] Record exact commit SHA and workflow URL for every green result.

**Acceptance:** latest PR head has all required checks green; security scans run even if tests fail; no bypass or false-green workflow.

## Phase 5 — Payments, quotas and model routing (P1)
- [ ] Verify payment webhook signature against raw request bytes, replay/idempotency protections, event ordering and safe retries.
- [ ] Confirm plan changes are derived from verified provider events and reconciled with provider state; never grant entitlements from a client redirect alone.
- [ ] Test concurrent quota consumption with atomic DB operations/transactions. Preserve hourly anti-abuse limits in addition to daily/weekly token budgets.
- [ ] Verify Manila-midnight reset semantics and boundary/time-zone tests.
- [ ] Test provider routing and failover for timeout, 429, 5xx, malformed response, missing key, exhausted quota and cancellation.
- [ ] Prevent fallback routing from violating user plan, privacy policy, provider allowlist or cost ceiling.
- [ ] Ensure error messages never reveal internal provider keys, environment variable names, hidden limits or stack traces to end users.

**Acceptance:** replayed payment events are idempotent; quota cannot be exceeded through concurrent requests; failover is tested and respects policy.

## Phase 6 — Video Studio and media (P1)
- [ ] Clearly distinguish browser timeline export from guaranteed server-side MP4 rendering in UI, docs and API responses.
- [ ] Do not label WebM output as MP4 or return an incorrect MIME type/file extension.
- [ ] Implement server-side rendering only if it is part of the approved product scope; otherwise state the limitation clearly and disable unsupported claims/buttons.
- [ ] Verify clip/size/duration limits on the server, not only in client UI.
- [ ] Test upload type and size validation, ownership, signed URLs, cleanup, retention and failed-job recovery.
- [ ] Add E2E coverage for iOS Safari, tablet and desktop export/playback, including unsupported codec and interrupted export cases.
- [ ] Verify audio assets, projects and timeline item policies and project ownership joins.

**Acceptance:** accurate export format, server-enforced limits, reliable error recovery, and recorded real-device test results.

## Phase 7 — NCC owner security and privacy (P1)
- [ ] Verify owner-console APIs enforce owner identity server-side on every endpoint. Hiding a button or returning 404 from a page is not sufficient by itself.
- [ ] If email/IP allowlists are used, combine them with authenticated owner identity and trusted proxy/IP handling; do not trust spoofable client headers.
- [ ] Test unauthorized access to NCC pages, APIs, reports, telemetry, finance, user records and automation actions.
- [ ] Review telemetry for minimization, retention, redaction and access controls.
- [ ] Verify conversation/memory deletion and retention behavior against stored records and derived caches.
- [ ] Ensure AI incident investigator/automation tools cannot execute privileged actions without explicit authorization and audit logging.

**Acceptance:** non-owner requests are denied at the server/API layer and no sensitive data leaks through alternate routes.

## Phase 8 — Migration and database performance
- [ ] Reconcile every migration file against the production registry and live schema.
- [ ] Identify migration history naming differences, consolidated migrations and manually applied changes.
- [ ] Make migrations idempotent where appropriate and test forward/rollback behavior in a safe environment.
- [ ] Review 8 unindexed foreign keys; add indexes only where query/update patterns justify them.
- [ ] Review 18 unused indexes with workload history and migration context before considering removal.
- [ ] Inspect slow queries, query plans, connection/pool behavior and large-table pagination.
- [ ] Re-run security/performance advisors after fixes.

**Acceptance:** no unexplained schema drift, no blind SQL execution, and measurable/index-plan evidence for performance changes.

## Phase 9 — Production smoke tests
Run only against an approved test account and non-destructive fixtures where possible.
- [ ] Guest chat and signed-in chat.
- [ ] Login, logout, Google OAuth callback and session refresh on iOS Safari.
- [ ] Correct tier/model routing and provider error/failover behavior.
- [ ] Attachment persistence, reopening sent attachments, download/access authorization and conversation reload.
- [ ] Image and voice generation; provider failure handling.
- [ ] Video generation limits and Studio export MIME/format correctness.
- [ ] Checkout and webhook idempotency using test mode.
- [ ] User integration connect/disconnect and cross-account isolation.
- [ ] NCC owner vs non-owner access.
- [ ] Privacy deletion and retention expiry.
- [ ] Verify public domain, deployment SHA, readiness endpoint and relevant server logs with secrets/PII redacted.

**Acceptance:** publish a test matrix with expected/actual result, environment, commit/deployment SHA, evidence link, and remaining blockers. Do not mark a smoke test passed based only on a route returning HTTP 200.

## Current-state checklist to maintain
Update this section during execution.

| Workstream | Snapshot status | Completion evidence required |
|---|---|---|
| Four RLS policy gaps | Open / urgent | Migration, owner/cross-user tests, advisor result |
| Leaked-password protection | Reported disabled | Verified live Auth setting |
| PR #409 integration security | Draft / incomplete | Reviewed implementation, provider coverage, negative tests |
| PR #485 navigation cleanup | Open; CI failures recorded | Latest head green and regression verified |
| CI security scan behavior | Needs change | Secret scan and syntax checks run even after test failure |
| Video Studio server MP4 | Not implemented in snapshot | Server renderer + E2E tests, or clearly documented unsupported scope |
| Studio real-device QA | Not verified | iOS Safari/tablet/desktop results |
| Migration reconciliation | Needs review | Registry/schema diff and safe migration plan |
| Performance advisor | 8 FK indexes, 18 unused indexes reported | Query-plan-based decisions and updated advisor |
| Production deployment | Not established by snapshot | Ready deployment + domain smoke tests |

## Final delivery required from Claude
1. Implement fixes in focused branch/PR(s), without bundling unrelated changes.
2. Report each finding as **Fixed / Verified / Partially fixed / Blocked / Not applicable** with code/migration/test links.
3. Include commands run and actual pass/fail totals, including the exact commit SHA tested.
4. Include security regression tests, especially cross-user RLS/credential access and NCC owner authorization.
5. State which actions require the owner in Supabase/Vercel dashboards; never claim those actions were completed unless verified.
6. List remaining risks and deployment/rollback steps.
7. Do not merge or deploy until required checks pass and the owner authorizes release.


## Phase 10 — Persistent generated images and sent attachments (P1; reproduced on iOS Safari)

**Current reproduction (2026-10-20):** In a NasrinAI conversation on iPhone Safari, the assistant says it generated a full-screen Video Studio Filters design, but the message then displays “This picture is no longer available.” The same failure has been observed for Stickers and Transitions mockups. Sent user attachments must also remain visible and tappable after the composer clears, refresh, and conversation history reload.

**Status:** Reproduced from user-provided screenshot; runtime root cause and fix are not yet verified. PR #356 merged a documentation-only specification and did not implement this behavior. Track implementation in issue https://github.com/primusco20/nasrinAI/issues/486.

Tasks:
- [ ] Trace image-generation response handling from provider output through server persistence, message serialization, database storage, history loading, and client rendering. Identify whether the current message stores a temporary provider URL, blob URL, expiring signed URL, or a missing artifact reference.
- [ ] Persist generated image bytes to the existing private storage system before reporting generation success. Store a stable artifact ID/object key and safe metadata linked to the assistant message; do not rely on temporary URLs as the sole reference.
- [ ] Resolve preview/download URLs on demand through an authenticated server path or short-lived signed URLs. Verify the requesting user can access the parent conversation/message and the specific object; reject cross-user ID guessing.
- [ ] Render generated images and user attachments as persistent, tappable message cards. Images open in a full-screen lightbox; supported files open/download using safe viewers. Restore previews after refresh and conversation-history reload.
- [ ] Handle expiry, deleted objects, provider failure, storage failure, and unsupported formats explicitly. Never show a dead image as if generation succeeded; report failure if persistence fails and provide retry where safe.
- [ ] Distinguish a static design/mockup image from an implemented interactive Video Studio feature. Do not claim a Filters/Stickers/Transitions UI was implemented merely because a concept image was generated.
- [ ] Validate MIME type and file signatures, enforce upload limits and ownership, prevent arbitrary uploaded HTML/script execution, keep buckets private, and respect retention/deletion policy.
- [ ] Add regression tests for user uploads and assistant-generated images: send → persist → render → tap/open → refresh → reopen history; expired signed URL renewal; missing/deleted asset; storage/provider failure; multiple files; unauthorized cross-account access; iOS Safari viewport/lightbox behavior.
- [ ] Run relevant unit/integration/E2E tests and verify the fix on iPhone Safari or a documented equivalent before marking complete.

**Acceptance:** no “This picture is no longer available” for successfully persisted artifacts; images and attachments survive refresh/history reload and open only for authorized users; generation success is emitted only after durable persistence; test evidence and deployment SHA are recorded.
