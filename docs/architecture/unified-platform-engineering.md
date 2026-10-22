# Unified NasrinAI Platform Engineering Contract

**Status:** Engineering contract for all platform surfaces  
**Scope:** Chat, Code, Video Studio, and shared platform services  
**Last updated:** 2026-10-23

This contract applies to the entire NasrinAI platform. Video Studio is not a separate quality bar, and Chat or Code must not be treated as secondary surfaces. Implement changes within the repository's existing architecture; do not replace the existing Node.js/Vercel API with a new Next.js app or introduce dependencies unless a separately approved architecture change requires it.

## 1. Platform surfaces and ownership

| Surface | Responsibilities | Required safeguards |
| --- | --- | --- |
| Chat | Conversations, streaming, citations, tools, media discovery, images/video generation entry points, conversation persistence | Authentication and tenant ownership, policy/tier/quota checks, safe provider routing, output validation, cancellation and retry behavior |
| Code | Code-aware conversations, repository/file inspection, proposed edits, test execution through the approved isolated runner, pull-request workflow | Never execute untrusted code in the API process; mask secrets; inspect repository conventions first; explicit confirmation before write-capable GitHub actions; report only observed test results |
| Video Studio | Projects, templates, timeline, generated footage, media assets, preview/export, render-job lifecycle | Owner-scoped projects/assets/jobs, private media access, entitlement and quota checks, validated URLs/paths, bounded work, honest progress and failure states |
| Shared platform | Identity, tiers, intent classification, provider/model routing, persistence, usage accounting, privacy controls, telemetry and error handling | Server-authoritative policy, no secret leakage, consistent error envelopes, tenant isolation, bounded retries/timeouts and auditable state transitions |

## 2. Required workflow for every change

1. Inspect the current branch/ref, repository tree, relevant implementation, package scripts, tests, migrations, and applicable docs before editing.
2. Define the acceptance criteria and list every affected surface. If a shared service changes, test all consumers—not only the first UI where the change is visible.
3. Reuse existing modules and established conventions. Do not create duplicate routers, auth systems, databases, provider adapters, or render pipelines.
4. Implement complete behavior, including loading/empty/success/error states, validation, authorization, cleanup, retries where safe, and accessible mobile interactions.
5. Add focused regression tests for normal behavior, boundaries, failures, cross-tenant access, and regressions. Update documentation and `docs/pr-change-log.md` in the same PR.
6. Run focused tests first, then the full repository test suite, secret scan, and database tests when relevant. Inspect the actual exit status and output.
7. Review the diff for unrelated changes, secrets, invented env vars, dead controls, misleading success states, and undocumented schema/API changes.
8. Open a reviewable PR. Do not merge, change production secrets, apply production migrations, or claim deployment success without explicit authorization and verified evidence.

## 3. Shared AI orchestration contract

All model-backed surfaces must use the existing shared orchestration and policy layers rather than selecting providers independently inside UI components.

The routing sequence is:

1. Normalize the request and classify intent, task, modality, required tools, and complexity.
2. Resolve the user's tier, authentication, permissions, quota, privacy restrictions, and feature entitlement on the server.
3. Select a configured, capability-compatible model through the established OpenRouter-first policy where enabled.
4. Verify model/task capability and any required live metadata before sending data or starting paid work.
5. Apply privacy redaction and provider-specific payload validation.
6. Execute with bounded timeouts/retries and the existing budget, token, and anti-abuse controls.
7. If a provider fails, try only policy-approved compatible fallbacks. Do not bypass privacy, tier, quota, capability, or authorization gates during fallback.
8. Validate and sanitize the result, persist only according to the current retention/consent policy, and return a consistent response.
9. Record sanitized diagnostics sufficient to investigate failures without logging credentials, private user content, or raw provider payloads.

OpenRouter-first applies to model inference where the current configuration enables that routing mode. Dedicated capabilities (for example YouTube discovery, authentication, storage, speech, and video job APIs) remain dedicated integrations; do not pretend they are chat completions or silently bypass their own security checks.

## 4. Chat requirements

- Preserve the normal answer path for general questions; enrich an answer with media only when relevant, verified results exist.
- Keep streaming, Stop, Retry, Edit, Regenerate, and conversation persistence behavior consistent with current product contracts.
- Do not hide tier choices because a provider is temporarily unavailable; enforce entitlement and routing server-side.
- Never display a failed or empty tool result as if it were a verified fact.
- Keep citations attached to the claims they support. Mark estimates and uncertainty honestly.
- Treat all user input, retrieved pages, files, tool output, and model output as untrusted data.

## 5. Code requirements

- Inspect the repository, current branch/ref, scripts, architecture, and test conventions before proposing or applying edits.
- Use the approved GitHub connector and isolated runner for repository work. Never run untrusted source code or shell commands in the API process.
- For proposed edits, show complete file changes or a cumulative unified diff, run focused tests, fix failures, and rerun against the same repository ref.
- Do not claim that code was committed, tests passed, a PR merged, or a deployment succeeded unless a tool or CI result proves it.
- Require explicit confirmation for write-capable GitHub operations; do not merge or deploy automatically as a side effect of a coding request.
- Preserve secrets hygiene: mask likely credentials before model context, do not echo secret values, and do not commit environment files or private data.

## 6. Video Studio requirements

- Treat the Studio as a first-class platform surface sharing the same identity, tier, usage, privacy, and provider-policy services as Chat and Code.
- Keep editing workflows mobile-first and usable on iPhone Safari, including touch targets, safe areas, responsive panels, and the existing 9:16 vertical-video workflow.
- Projects, media assets, and render jobs must be server-authorized and owner-scoped. Never trust a client-provided owner ID, entitlement, output URL, storage path, or render status.
- Persist job state before handing off long-running work. Use the supported detached/background execution mechanism only where the runtime supports it; never claim a render is detached or durable without verifying that behavior.
- Progress responses must use a documented finite state such as `queued`, `rendering`, `done`, or `error`, include a validated output URL only for completed jobs, and avoid exposing internal stack traces.
- Use idempotency or deduplication for retryable expensive work where supported. Bound duration, resolution, asset size, execution time, and concurrent jobs according to existing server-side policy.
- Distinguish browser-side export from server-side rendering. Do not describe browser rendering as a durable server render worker.

## 7. API, database, and security requirements

- API routes must validate method, content type, body size, shape, and all identifiers. Return predictable JSON errors without internal details.
- Every protected read/write must derive identity from verified server-side credentials and enforce user/tenant ownership in the data query or transaction.
- Database changes require additive migrations where practical, least-privilege grants, RLS where applicable, indexes for access patterns, and automated migration/security tests.
- Never expose service-role keys or provider credentials in client bundles, logs, prompts, responses, or public documentation.
- Keep optional integrations fail-closed and the app usable when an optional provider is misconfigured.
- Any change to collected, stored, shared, or retained data must update the applicable privacy/terms documentation and version settings in the same change.

## 8. Mobile and accessibility requirements

- Build for narrow screens first, then enhance tablet and desktop layouts.
- Interactive targets should be comfortable for touch; prevent panels, popovers, and media controls from being hidden behind the keyboard, safe areas, or composer.
- Provide visible focus, accessible labels/states, keyboard support where relevant, reduced-motion support, and readable contrast in light/dark themes.
- Avoid disabling core controls merely because asynchronous model/provider discovery is pending.
- Verify responsive behavior with automated tests and a real browser/Preview check when available; clearly state when a visual check was not performed.

## 9. Environment and migrations

- Do not invent environment variable names or assume secrets exist. Confirm names in `.env.example`, `src/config.js`, deployment docs, and the relevant runtime.
- Document new variables with purpose, required/optional status, and which deployment environments need them. Never include secret values.
- For SQL changes, provide a complete migration and corresponding automated tests. State whether it has merely been committed or actually applied to staging/production.
- No new runtime dependency without updating package manifests/lockfiles and documenting the architecture decision.

## 10. Definition of done

A cross-surface change is complete only when all applicable items are true:

- [ ] The behavior is implemented in the correct existing modules.
- [ ] Chat, Code, Video Studio, and shared consumers affected by the change are identified and regression-tested.
- [ ] Authentication, authorization, tier/quota, privacy, ownership, and failure behavior are covered.
- [ ] Focused tests and the full test suite pass, with observed results recorded.
- [ ] Secret scan and database/migration tests pass when applicable.
- [ ] Documentation and the PR change log match the actual implementation.
- [ ] The diff contains no secrets, unrelated rewrites, fake integrations, or false success states.
- [ ] PR/CI/Preview status is reported accurately; production deployment is not assumed from a commit alone.

If a requirement cannot be verified in the current environment, mark it **not verified** and state the exact remaining check. Never convert a proposed design, passing unit test, or successful preview build into a claim of production readiness.
