# NCC AI Receptionist — Upgrade Specification

**Product:** NasrinAI Client Connect (NCC)  
**Status:** Implementation specification for Claude  
**Scope:** Add an **AI Receptionist** tab that lets each authorized NCC customer configure, test, enable, pause, and monitor an AI receptionist for their business.

> This document specifies the intended behavior. Do not treat the feature as implemented until the code, migrations, tests, integrations, and deployment checks are complete.

## 1. Objective

Give NCC customers a clear, self-service way to turn on an AI receptionist that can handle inbound calls, capture customer and lead details, answer approved business questions, assist with appointment requests, and arrange permitted callbacks. It must work as a production feature—not a decorative settings page or a collection of nonfunctional buttons.

Keep this feature inside **NasrinAI Client Connect (NCC)**. Do not confuse it with the separate NasrinAI Connect product.

## 2. Navigation and experience

Add a first-class **AI Receptionist** tab to the NCC workspace navigation. Follow the existing NCC routing, permissions, design system, responsive behavior, and accessibility conventions rather than creating a parallel app.

The tab should contain these areas:

1. **Overview** — current state, setup checklist, recent call activity, missed/failed calls, appointments or callback requests, and usage/cost indicators where supported by real data.
2. **Receptionist setup** — business name, timezone, supported languages, greeting, tone, business hours, holidays, approved FAQs, services, escalation instructions, and contact details.
3. **Call handling** — inbound call routing/number configuration, after-hours behavior, voicemail fallback, human handoff/transfer destination, and fallback behavior when the AI or telephony service is unavailable.
4. **Appointments & callbacks** — supported calendar/booking integrations, availability rules, callback windows, retry limits, and customer time-zone handling.
5. **Knowledge & tools** — approved business information and authorized NCC tools (such as CRM/lead capture and booking). Reuse existing NCC integrations and permission controls; do not invent provider capabilities.
6. **Call history** — searchable call records with outcome, timestamps, duration, disposition, captured lead fields, callback/booking status, and links to permitted recordings/transcripts when available and legally enabled.
7. **Safety, privacy & spending** — consent disclosures, recording/transcription settings, retention controls, opt-out handling, usage limits, budget alerts, and emergency pause.
8. **Testing** — a test-call or simulation workflow that validates configuration before activation and clearly distinguishes simulations from real calls.

Use a premium, restrained, professional interface. Make status and next steps obvious. Provide useful loading, empty, error, retry, and success states. Ensure the controls work on mobile and desktop.

## 3. Enablement lifecycle

Implement an explicit lifecycle, for example:

- **Not configured** — setup incomplete; activation unavailable.
- **Ready to test** — required settings and integration checks pass.
- **Testing** — a test is running.
- **Active** — receptionist is enabled and the runtime confirms it can receive work.
- **Paused** — temporarily disabled by the customer or an authorized operator.
- **Degraded** — service/integration health check failed; show the reason and fallback status.
- **Error** — activation or runtime failed; preserve diagnostics for authorized users without exposing secrets.

The main enable control must be a real, authenticated action. Before enabling, show a concise review of the selected phone/route, business hours, human fallback, consent/recording choices, and usage controls. Require confirmation before switching from paused to active or activating for the first time.

On enable:
1. Validate tenant ownership and feature permissions on the server.
2. Validate all required settings and telephony/calendar/CRM integrations.
3. Confirm a working fallback path and enforce spending limits.
4. Persist the requested state and create an audit event.
5. Provision/update the required integration using supported APIs.
6. Verify runtime readiness before reporting **Active**.
7. If any step fails, roll back or retain a safe paused state and show a recoverable error.

Pause must prevent new AI-handled sessions as soon as safely possible, while handling in-progress calls according to a documented safe policy. Provide an emergency stop. Do not report success until the backend confirms the state transition.

## 4. Receptionist capabilities

### Inbound calls
- Answer calls only on explicitly configured numbers/routes and within configured rules.
- Identify itself as an AI receptionist when applicable and use the customer's approved greeting.
- Answer from tenant-approved knowledge; do not invent prices, policies, availability, or commitments.
- Capture caller intent and configurable lead/contact fields.
- Route to a human when requested, when confidence is insufficient, for sensitive/escalated cases, or when policy requires it.
- If transfer fails, offer a configured fallback such as taking a message or arranging a callback.
- Support after-hours greetings, voicemail/message capture, and business holiday rules.

### Outbound and scheduled callbacks
- Support callbacks only for a documented, permitted purpose, using an authorized business workflow and a valid consent/legal basis.
- Respect local calling-hour rules, do-not-call lists, opt-outs, customer preferences, and retry limits.
- Never initiate unsolicited bulk or deceptive calls. Do not spoof caller identity.
- Cancel queued callbacks when consent is withdrawn, a number is opted out, or an authorized user cancels the task.
- Make retries idempotent so duplicate events cannot create duplicate calls.

### Booking and CRM
- Create or update a lead/contact only through tenant-authorized integrations.
- Check real availability before confirming an appointment; never claim a booking succeeded until the connected booking system confirms it.
- Prevent duplicate contacts, bookings, and callback jobs with idempotency keys and appropriate uniqueness constraints.
- Capture an auditable outcome for every attempted action.

## 5. Architecture and data boundaries

Claude must inspect the actual repository and existing NCC specification before implementing. Reuse existing patterns and integrations; do not duplicate services or create a separate architecture unnecessarily.

Recommended responsibility boundaries:
- **NCC UI:** tab, configuration forms, test workflow, status, history, and customer-facing controls.
- **Authenticated API:** tenant-scoped configuration, lifecycle actions, call/booking requests, history, and usage.
- **Runtime/worker layer:** event processing, call orchestration, callbacks, retries, and scheduled jobs. Use a durable queue/scheduler where required; do not rely on a browser tab or an in-memory timer for production callbacks.
- **Supabase:** tenant-owned configuration and operational records, with migrations, RLS, and server-side authorization.
- **Vercel:** existing application/API deployment and server-side secrets/configuration, consistent with the current repository setup. If a persistent worker or telephony runtime cannot safely run in the current deployment environment, document and implement the appropriate supported worker deployment rather than pretending a serverless request is a durable worker.

Suggested entities (adapt to existing schema and naming):
- receptionist configuration, scoped to tenant/workspace;
- phone-number/route association and integration status;
- consent/opt-out records;
- call sessions and outcome/disposition;
- lead capture and booking references;
- callback jobs and attempt history;
- usage/budget counters;
- audit events and integration health events.

Store only necessary personal data. Use tenant IDs and server-verified ownership for every read/write. Add indexes and retention policies appropriate to access patterns. Do not store provider credentials in client-visible tables.

## 6. Configuration and secrets

- Inspect the repository's current environment-variable and secret-management conventions first.
- Keep credentials and server-only integration secrets in the established Vercel environment configuration (or the repository's already-approved secret manager). Never hardcode credentials or expose them to the browser.
- Do not add fake default phone numbers, hardcoded customer configuration, fabricated provider IDs, or silently selected integrations.
- Customer-specific non-secret settings should be persisted per tenant in the database with validated schemas and server-side authorization.
- If a required integration or secret is absent, show a clear **Not configured** state and exact setup guidance. Never claim the receptionist is active when the underlying capability is unavailable.
- Keep customer-facing errors and notifications provider-neutral; do not expose internal provider names, API keys, environment variable names, raw stack traces, or secrets.

## 7. Security, privacy, and compliance

- Enforce tenant isolation and server-side authorization for every API route and database operation; hiding a tab in the UI is not authorization.
- Apply and test RLS to new tenant-owned tables. Use least-privilege service credentials only in trusted server-side code.
- Validate and rate-limit lifecycle changes, call requests, callback scheduling, and test calls.
- Record who enabled, paused, edited, or triggered an action, with timestamp and relevant non-secret metadata.
- Provide clear caller disclosure when interacting with an AI system. Recording/transcription must be disabled unless explicitly configured with appropriate notice and consent/legal basis.
- Respect applicable privacy, telemarketing, recording, and calling-hour rules for the customer's jurisdiction. Provide configurable retention/deletion behavior and access controls for recordings/transcripts.
- Protect against prompt injection from callers, voicemail, transcripts, and retrieved business content. Treat them as untrusted input; do not allow them to override system policy, access other tenants, reveal secrets, or execute arbitrary tools.
- Limit AI actions to an explicit allowlist. Require human confirmation for high-impact or ambiguous actions.
- Define a safe fallback for outages, low confidence, abuse, and spending-limit breaches.

## 8. Observability and usage controls

Show only metrics backed by persisted, trustworthy data:
- inbound calls received/answered/missed;
- calls handed off, messages captured, callbacks queued/completed/failed;
- appointments requested/confirmed/failed;
- integration health, recent errors, and last successful health check;
- usage and spend against configured limits, when the relevant usage data is available.

Use structured logs with correlation IDs. Redact secrets and unnecessary personal data. Add bounded retries with exponential backoff and jitter, dead-letter/recovery handling where supported, duplicate-event protection, and alerting for repeated failures. Never log full credentials, payment data, or unredacted transcripts by default.

## 9. API and state consistency

Follow existing route and API conventions. Add typed request/response validation and explicit error codes. All mutations must:
- authenticate the user;
- authorize access to the specific tenant/workspace;
- validate inputs and lifecycle transitions;
- enforce rate/usage limits;
- persist state and audit events transactionally where possible;
- return the authoritative persisted state.

Use idempotency for operations that can create calls, callback jobs, leads, or bookings. A browser refresh must not reset configuration or lose history. Do not trust a client-supplied tenant ID without verifying membership.

## 10. Required tests and acceptance criteria

Claude must add tests using the repository's existing framework and fix any failures introduced by the work.

### UI and flow
- AI Receptionist tab appears only for authorized users with access to the relevant NCC workspace/feature.
- Setup is usable on mobile and desktop and has accessible labels, keyboard support, and visible validation.
- Incomplete setup cannot be activated.
- Test, enable, pause, and emergency-stop controls invoke real API behavior and reflect server-confirmed state.
- Loading, empty, failed, retry, degraded, and active states render correctly.
- Refreshing or opening a new session preserves persisted settings and history.

### Security and data
- Cross-tenant reads and writes are denied, including direct API requests.
- Unauthenticated requests and unauthorized lifecycle transitions are rejected.
- RLS and migration tests cover every new tenant-owned table.
- Secrets never appear in browser bundles, API responses, logs, or customer-facing errors.
- Consent, opt-out, retention, and audit behavior are tested.

### Runtime reliability
- Missing integration credentials produce a safe not-configured state.
- Provider/telephony outage does not falsely report active readiness.
- Retry behavior cannot generate duplicate calls or bookings.
- Callback scheduling respects timezone, business hours, cancellation, and opt-out.
- Human handoff failure triggers the configured fallback.
- Budget/usage limits stop or safely degrade new work as specified.

### Repository quality
- Run targeted tests, type checking, linting, and the full relevant test suite.
- Check for migration conflicts, route conflicts, broken builds, and regressions in existing NCC automation features.
- Do not merge or claim deployment success unless the repository's required CI checks pass and the deployed behavior has actually been verified.

## 11. Implementation plan for Claude

1. Inspect the current branch, NCC navigation, existing NCC docs (including `docs/ncc-upgrade.md` and `docs/ncc.md` if present), API conventions, Supabase schema/RLS, environment configuration, integrations, test suite, and open PRs that may overlap.
2. Produce a short implementation map identifying the actual files and existing abstractions to reuse. Resolve conflicts before changing overlapping files; do not blindly overwrite another feature branch.
3. Implement the tab and end-to-end enablement lifecycle, backed by real server-side state and integration health checks.
4. Add schema migrations, RLS/policies, validation, audit events, idempotency, runtime scheduling/retries, and privacy/usage controls required for the supported feature scope.
5. Implement only integrations that are actually available and configured. Where external credentials or customer onboarding are required, provide a truthful setup state and document the exact remaining manual configuration.
6. Add tests for all acceptance criteria, run the full relevant checks, and repair failures introduced by this change.
7. Open a focused pull request with screenshots or test evidence where appropriate, migration/deployment notes, configuration requirements, risks, and an explicit list of anything not implemented. Do not merge automatically if repository policy or checks require review.
8. Report the PR URL, changed files, test results, migration status, and deployment status separately. Distinguish verified facts from remaining work.

## 12. Definition of done

The upgrade is complete only when a permitted NCC user can open the **AI Receptionist** tab, configure the business and routing safely, run a test, enable or pause the receptionist, see server-confirmed status and real activity, and rely on secure tenant-scoped persistence and tested fallbacks. If the required telephony integration or credentials are unavailable, the UI must explain what is missing instead of simulating a working receptionist.
