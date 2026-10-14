# Owner Command Center — Implementation Specification

Status: proposed; documentation only until implementation PRs are reviewed and merged.
Owner: [REQUIRES INPUT: canonical owner account/identity]
Production: https://www.nasrinai.com
Architecture constraints: see `CLAUDE.md`, `docs/operations.md`, ADR-002, and the existing server-side Supabase/auth patterns.

## 1. Goal

Build an owner-only operations dashboard inside NasrinAI that gives the owner trustworthy visibility into adoption, AI operations, infrastructure, security, automation, and platform economics. It must work well on mobile Safari and remain useful when some integrations are unavailable.

This is an operational control plane, not a public analytics page. Monitoring is read-only by default. Privileged controls must use separate server-authorized endpoints, explicit confirmation, narrow permissions, and immutable/auditable event records.

## 2. Navigation

Create a responsive Owner Command Center with these sections:

1. **Overview** — core health and business KPIs.
2. **AI Operations** — requests, tiers, providers/models, tokens, latency, failures, fallback and estimated cost.
3. **Users & Growth** — accounts, active users, retention, plan mix, feature adoption and onboarding friction.
4. **Infrastructure & Releases** — health checks, API latency, deployment/build status when available, database/storage status when available.
5. **Security & Audit** — auth failures, rate-limit events, security alerts, privileged-action audit log.
6. **Automation & Jobs** — queued/running/succeeded/failed jobs, retries, schedules, stuck executions and per-step traces where supported.
7. **Finance & Costs** — provider cost, payment/subscription reconciliation, cost per active user/request, budgets and forecasts.
8. **Incidents & Alerts** — alert rules, severity, acknowledge/assign/resolve, incident timeline and recommended investigations.
9. **Reports & Exports** — date-scoped CSV exports and scheduled summaries where delivery support exists.
10. **Settings** — dashboard refresh interval, alert thresholds, notification preferences and feature flags available to the owner.

Keep mobile navigation compact, controls touch-friendly, charts legible on narrow screens, and tables horizontally scrollable or converted to stacked rows. Respect system/light/dark appearance where supported by the existing app.

## 3. Overview metrics

Show date range and comparison period on every relevant chart. Include:
- Total registered accounts and guests only where a reliable identity/session counter exists.
- Daily/weekly/monthly active users with a documented definition.
- AI requests attempted, succeeded, failed, and success rate.
- p50/p95 latency and timeout rate when enough observations exist.
- Tokens consumed, provider/model breakdown, and estimated USD cost.
- Current estimated spend against daily/weekly/monthly configured budgets.
- Plan mix, upgrades/cancellations and revenue only from verified billing records.
- Current incident count and latest incident.
- Automation jobs by state, where the execution engine emits durable events.
- Data freshness and telemetry coverage indicators.

Do not show placeholder dashes as if data exists. Use explicit states: **Available**, **No data yet**, **Unavailable**, **Stale**, or **Estimated**. Never silently treat missing telemetry as zero.

## 4. AI Operations

Provide filters for date range, plan/tier, provider, model, task/feature, outcome, and request ID. Display:
- request volume, success/failure rate, latency percentiles, timeout rate;
- input/output tokens when the provider reports them, and mark estimates clearly;
- estimated cost using the repository's maintained pricing configuration;
- routing decision, fallback count, and safe error categories;
- feature-level usage (chat, images, voice, web, coding, tools, NCC) only where instrumentation exists;
- budget reservations and settled estimates using existing spend reservation data.

Do not persist prompts, completions, uploaded content, credentials, or raw authorization headers for dashboard telemetry. Correlate events using opaque request IDs. Keep provider names/model identifiers inside the owner view if operationally needed, but never expose internal model details to ordinary user replies.

## 5. Users & Growth

Provide account search and filters with least-privilege fields: internal user ID, created date, plan/tier, status, last activity timestamp, aggregated usage, and consent/retention state only when necessary for support. Mask email addresses by default and reveal only to an authorized owner action if the existing account model requires it.

Show new registrations, active-user trends, retention cohorts, plan changes, feature adoption, and conversion funnels. Clearly define active user and cohort calculations. Avoid profiling sensitive traits. Never use private chat content for behavioral analytics.

Administrative actions such as suspending an account, changing entitlements, or deleting data must not be implemented as casual dashboard toggles. If supported later, require dedicated server-side authorization, explicit confirmation, reason capture, audit events, and reversible workflows where possible.

## 6. Infrastructure & Releases

Integrate existing sources instead of inventing endpoints or environment variables:
- Application health and server route latency/error summaries.
- Vercel deployment/build state only if a verified API integration and credentials are configured.
- Supabase health/database/storage indicators only through supported, scoped server-side queries or provider APIs.
- Release timeline correlated with incident and error trends.
- Current configuration validation that returns only pass/fail and safe key names, never secret values.
- Data-source connection state and last successful poll.

A successful health check does not prove every dependency is healthy. Display the scope and timestamp of each check. Never expose deployment logs or raw provider errors without redaction.

## 7. Security & Audit

Include:
- Aggregated sign-in failures and suspicious request/rate-limit patterns from existing safe events.
- Security findings and CI/dependency/secret-scan status only when a verified data source is connected.
- RLS/authorization regression results from CI or explicit checks, not inferred from dashboard UI.
- An audit log for owner actions: actor ID, action, target type/ID, timestamp, outcome, reason, request ID and safe metadata.
- Incident severity, status, timeline and resolution notes.

Do not store secrets or raw personal content in audit metadata. Audit records must be append-only from normal application paths; do not expose a UI that edits/deletes audit history. Rate-limit and redact sensitive fields.

## 8. Automation & Jobs

Use the existing automation/job model only after code inspection confirms it exists and its semantics. If durable execution events are missing, implement an explicit event model in a separate reviewed phase. Dashboard states must distinguish queued, running, succeeded, failed, canceled, timed out and unknown/stale.

Show run ID, workflow ID, trigger, start/end time, duration, safe step names, retry count and sanitized error category. Do not render full secrets, raw tool arguments, or customer message payloads. Retry/cancel actions must verify ownership/authorization and job state server-side, be idempotent, and require confirmation for side-effecting runs. Never auto-retry non-idempotent writes without a deduplication/idempotency strategy.

## 9. Finance & Costs

- Use existing usage events, spend reservations, pricing configuration and verified payment records.
- Separate actual provider-reported cost, internal estimate, reserved spend, settled spend, gross revenue and estimated operating margin.
- Label any forecasts as estimates with method and period.
- Reconcile payment totals to authoritative payment/webhook records; never infer revenue from plan labels or client UI.
- Alert on configurable thresholds while preserving existing provider-side spending limits, request caps, rate limits, tenant protections and quota behavior.
- Avoid exposing full payment details or financial data to non-owner roles.

## 10. Alerts, incidents and safe controls

Support configurable thresholds for error rates, latency, provider failure, spend, stale telemetry, job backlog and security events. Alert delivery channels are only shown as enabled when configured and verified.

Incident workflow: detect → create/update incident → notify → investigate → propose remediation → owner approval for privileged action → execute through an existing authorized server route → verify → record outcome.

AI may summarize evidence and suggest diagnostic steps. AI must not grant itself permissions, change secrets, deploy code, disable security, delete data, or run arbitrary SQL. Remediation actions must be a predefined allowlist with server-side validation, explicit authorization, confirmation, idempotency, rate limits, audit records, and post-action verification.

Potential controls, only when supported by real backend capabilities:
- pause a provider route or feature via an existing validated feature flag;
- disable a specific integration/workflow;
- maintenance mode with a safe recovery path;
- retry a safe failed job;
- acknowledge/resolve an incident.

Never display a working-looking control when no backend action exists. No dashboard feature may bypass current budget or abuse protections.

## 11. AI incident investigator and release guard

AI investigator:
- summarize only sanitized, timestamped evidence;
- correlate request IDs, safe error categories, provider status, release timeline and job events;
- cite evidence IDs/time ranges for every material conclusion;
- distinguish observed facts from hypotheses;
- recommend a bounded next check and list uncertainty;
- never claim a root cause is confirmed without corroborating evidence.

Release guard:
- show CI, test, database test, secret scan, dependency scan and available evaluation results from real workflow data;
- block or flag releases based on explicit configured policy, not an LLM-only judgment;
- correlate post-release regressions and offer rollback instructions;
- do not deploy or roll back automatically in the first phase.

## 12. Reports and exports

Allow date-scoped CSV exports for aggregated usage, costs, incidents, automation status and growth metrics. Exports must:
- be owner-authorized on the server;
- validate date ranges and row limits;
- omit message contents, tokens/secrets, raw headers and unnecessary PII;
- set safe content types and attachment filenames;
- avoid logging export contents;
- record export creation in the audit log.

Scheduled delivery is a later phase and must use an explicitly configured, verified channel.

## 13. Data model and instrumentation approach

**Do not create tables until the current schema and migrations have been inspected.** Reuse existing sources where possible, including the existing `usage_events`, `spend_reservations`, routing/usage aggregates, account/plan data, and any durable automation events actually present in the checked-out repository. Verify each table and column before querying it.

If instrumentation gaps exist, design additive migrations in a separate implementation PR. Candidate concepts (names are illustrative, not approved schema names):
- privacy-minimized operational events with event type, occurred_at, request ID, outcome, safe dimensions and retention;
- append-only owner audit events;
- incidents and incident updates;
- alert rules and delivery attempts;
- durable job/run event summaries only if the current execution engine lacks them.

Every migration must have database tests and RLS/privilege checks. Default-deny access. Browser clients must not query privileged analytics tables directly. Use authenticated same-origin server APIs and server-side aggregation; service/secret Supabase keys stay server-only. Scope all user/tenant data queries explicitly. Do not broaden policies to make the dashboard work.

Avoid high-cardinality labels and excessive write volume. Define retention and aggregation before storing telemetry. If the change alters data collected, shared, retained, or user rights, update `public/legal/privacy.md` and `public/legal/terms.md` as required by `CLAUDE.md`, and bump the relevant legal version defaults in `src/config.js`.

## 14. Authentication and authorization

- Reuse existing server-side authentication and session validation.
- Create an explicit owner allowlist/role check from a verified authoritative identity; never trust an email, role, or owner flag supplied by the browser.
- Require recent authentication and MFA/step-up verification for destructive or high-impact controls if the current auth provider supports it. Do not claim MFA is active until implemented and verified.
- Return 403 for authenticated non-owners; return safe unauthenticated responses for signed-out users.
- No secrets or Supabase privileged keys in HTML, JavaScript, client responses, URLs or logs.
- Enforce same-origin protections, CSRF defenses where applicable, request size limits, rate limits and strict input validation.
- Do not expose the dashboard route or data to guests or ordinary users.
- Audit denied high-risk attempts without storing secrets or message content.

## 15. APIs and UI behavior

Inspect `src/routes.js`, `src/main.js`, existing auth helpers, static UI patterns and test conventions before naming or creating routes. Prefer a small set of read-only endpoints with bounded filters and server-side aggregation. Proposed endpoint names are not commitments until verified against route conventions.

All endpoints must validate date range, enum filters, pagination, and request IDs. Use stable response schemas with `generated_at`, `data_as_of`, source status, and a clear error code. Do not return stack traces or provider credentials. Avoid N+1 queries and full-table scans; add indexes only after query plans and expected volume are understood.

Refresh intervals must be configurable and conservative; use backoff on errors and visibility-aware polling where supported. Manual refresh should be available. Show stale/offline states and preserve the last successful timestamp without pretending it is live.

## 16. Testing and acceptance criteria

Tests must verify:
- signed-out and guest requests cannot access owner data;
- authenticated non-owner users receive 403 and no metric data;
- owner access is checked server-side on every request;
- query filters, pagination, date bounds, aggregation and empty-data states;
- missing telemetry is not represented as zero;
- sensitive fields, message content, secrets, tokens and headers are absent from responses and logs;
- tenant/account boundaries cannot be crossed;
- rate limits and budget protections remain unchanged;
- audit records are emitted for privileged actions and denied attempts where appropriate;
- retry/cancel controls are idempotent and reject invalid state transitions;
- export authorization, row limits, safe CSV escaping and redaction;
- database RLS and grants are restrictive and covered by database tests;
- mobile UI handles narrow viewport, loading, errors, stale data and no data;
- telemetry write failures do not break normal chat or user requests;
- CI, secret scan, dependency scan, unit tests and DB tests pass.

Acceptance is not met by screenshots, mock data, static cards, or documentation alone. Each metric must trace to a real, verified source and display its freshness. Any unavailable integration must be clearly marked unavailable.

## 17. Phased delivery

### Phase 0 — Repository audit and design
Inspect current branch, working tree, route/auth conventions, schemas/migrations, existing telemetry, UI patterns, Vercel/Supabase integration availability and legal retention. Produce a gap matrix: source exists / needs instrumentation / external integration unavailable. No speculative schema or API names.

### Phase 1 — Secure read-only MVP
Owner-only shell and Overview, AI Operations, Users & Growth using only verified sources. Add missing minimal telemetry only after review. Use safe empty/unavailable states. Add authorization, unit tests and database tests where applicable.

### Phase 2 — Infrastructure, Security & Audit
Add verified deployment/health sources, incident list, audit events and security/CI status. No production mutation controls.

### Phase 3 — Automation & Finance
Add durable job/run visibility and financial reconciliation from verified sources. Add retry/cancel only after idempotency and authorization tests.

### Phase 4 — Alerts and AI investigation
Add threshold alerts, incident correlation, evidence-based AI summaries, release guard, and owner-approved allowlisted remediation. Keep deploy/rollback automated actions disabled until separately approved and tested.

### Phase 5 — Reports and refinements
Add safe exports, scheduled summaries, retention controls, mobile polish and performance improvements.

## 18. Required Claude Code workflow

Claude Code must:
1. Read `CLAUDE.md`, `docs/claude-code-handoff.md`, `docs/operations.md`, relevant auth/routing/data docs, and current code before changing anything.
2. Report current branch, working-tree status, target branch, files planned, production impact and confirmed sources.
3. Work on a dedicated short feature branch; never modify `main` directly.
4. Implement one phase at a time. Do not stop at a mockup or documentation if the approved task is implementation.
5. Keep runtime dependencies at zero (Node 22 built-ins only), per ADR-002.
6. Never run destructive production SQL, expose secrets, change production environment variables, merge, or deploy without explicit owner approval.
7. Update this spec, `CLAUDE.md`, relevant operations docs, tests, migrations and legal docs together when the implementation changes them.
8. Run `npm test`, database tests where available, secret scan, and relevant quality/red-team checks. Report exact commands and outcomes; do not claim unrun checks passed.
9. Deliver a concise report with files changed, actual data sources connected, migration instructions, tests, limitations and owner actions.
10. Keep each PR reviewable and do not mark it complete while required checks fail.

## 19. Explicit non-goals for the first release

- No public analytics endpoint.
- No direct browser access to privileged Supabase data.
- No automatic deployment, rollback, secret rotation, arbitrary SQL, or destructive account action.
- No collection or display of private chat contents for monitoring.
- No invented real-time metrics, fake integrations, mock success states, or claims that MFA/alerts are enabled without verification.
- No new runtime dependencies.
