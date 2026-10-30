# Unified User Dashboard & AI Workforce Architecture

**Status:** Proposed architecture and implementation contract; not evidence of implementation  
**Owner surface:** `dashboard.nasrinai.com`  
**Repository:** `nasrinaiv0/nasrinAI`  
**Last updated:** 2026-10-30  
**Scope:** User dashboard, NasrinAI product workspaces, custom AI professions, workflow automation, CRM grid, testing/preview/deployment, usage, billing, and security.

> This document defines the target architecture. Existing code, database schema, route contracts, subscriptions, and deployment configuration must be audited before implementation. Reuse existing services when they satisfy the contract. Do not infer that a listed feature exists merely because it appears here.

## 1. Product outcome

Provide one authenticated, multi-tenant user workspace where users can access entitled NasrinAI products, configure their settings, build custom AI professionals, connect authorized tools and data, operate spreadsheet-style CRM workflows, and validate changes before production.

The platform must support a shared identity, project model, entitlement enforcement, AI orchestration, workflow execution, auditability, and usage accounting. Product workspaces are experiences over shared platform services, not separate implementations of authentication, routing, billing, or permissions.

## 2. User-facing workspaces

Primary navigation:

1. NasrinAI — general AI workspace, conversations, research, file analysis, and entitled tools.
2. MOVO — the separate MOVO product experience; preserve product/data isolation.
3. NasrinAI Connect — website/widget and authorized application integrations; distinct from Nasrin Client Connect.
4. NasrinAI Code — coding workspace and approved isolated execution/editing workflows.
5. NasrinAI Studio — supported image, video, audio, and media projects.
6. NasrinAI Cloud — supported environments, deployments, and cloud-resource management.
7. NasrinAI Receptionist — inquiry intake, routing, scheduling, and follow-up workflows where supported.
8. NasrinAI Client Connect — client relationship and client-facing workflows; confirm existing product naming and routes before implementation.
9. Library — user-authorized documents, assets, knowledge sources, and reusable resources.
10. Projects — central organization boundary for applications, AI professionals, data, workflows, environments, and usage.
11. AI Workforce Builder — create, version, test, and deploy custom AI professional configurations.
12. CRM & Business Operations — configurable tables, leads, contacts, companies, deals, tasks, and required attention.

**Naming guardrail:** historical project notes define NCC as **Nasrin Client Connect**, a distinct CRM/client-management/automation product; **NasrinAI Connect** is for website/widget integrations. The requested label “NasrinAI Client Connect” must be reconciled with existing branding and routes before changing names. Do not silently rename NCC or conflate these products.

Each product may have tailored tabs. A shared shell may provide Overview, Configuration, Automations, Data & Knowledge, Integrations, Preview, Testing, Activity/Logs, Usage/Billing, Settings, and Security where applicable. Do not show controls that are not implemented or relevant to that workspace.

## 3. Architecture principles

- **Inspect before building:** inventory existing routes, modules, database tables, migrations, entitlements, billing, tests, and open PRs.
- **Shared platform services:** no duplicate authentication, model router, billing ledger, workflow engine, or permission implementation per product.
- **Server-authoritative security:** frontend state is presentation only. Every resource and action is authorized server-side.
- **Tenant and project isolation:** ownership and membership must be enforced in queries, storage access, tool execution, and background jobs.
- **Configuration is data, execution is code:** user-authored AI definitions and workflows are validated data; they must not become arbitrary code execution.
- **Version everything that can change production behavior:** agent definitions, workflow definitions, schemas, prompts, tool permissions, and deployment manifests need immutable revisions.
- **Async for long-running work:** use bounded jobs and worker execution for video, large research, scheduled automation, and other long-running operations; do not rely on a browser request remaining open.
- **Auditable state transitions:** record who/what initiated a change, authorization result, version, outcome, and correlation ID without storing secrets or unnecessary sensitive payloads.
- **Idempotent side effects:** retries must not duplicate charges, CRM records, messages, or external actions.
- **Fail closed:** missing configuration, uncertain authorization, unavailable policy, or failed validation must not silently enable production access.
- **Honest status:** planned, implemented, tested, deployed, and production-verified are different states.

## 4. Logical architecture

### 4.1 Experience layer
- `dashboard.nasrinai.com`: authenticated user workspace and developer console.
- Existing NasrinAI main site and current product surfaces remain in place unless an approved migration plan says otherwise.
- Responsive shell, workspace switcher, project selector, contextual navigation, global search, notifications, and account menu.
- Product modules consume shared service contracts and design-system components.

### 4.2 Control plane
The control plane configures and governs resources; it does not execute arbitrary user workloads inside request handlers.

- Identity/session adapter using existing auth.
- Tenant, membership, role, and project authorization.
- Entitlement/policy service for plan, capability, quota, key scope, and approval rules.
- Project/workspace registry.
- API-key lifecycle and authentication.
- Agent/profession definition and immutable version registry.
- Workflow definition and version registry.
- Integration registry and credential references.
- Environment/deployment configuration.
- Usage policy, budgets, and billing configuration.
- Audit/event records and notification preferences.

### 4.3 Execution/data plane
- Public API gateway and existing application routes.
- Shared NasrinAI orchestrator and configured provider/model routing.
- Tool broker that checks per-agent and per-project permissions before each tool call.
- Workflow/job dispatcher and bounded workers for asynchronous execution.
- Isolated coding/runtime sandbox for untrusted code, using the already approved runner architecture.
- Integration adapters with scoped credentials and timeouts.
- CRM service and typed record operations.
- Media generation jobs and private asset access.
- Usage reservation, settlement, and billing ledger integration.
- Sanitized logs, metrics, traces, and error reporting.

### 4.4 Data layer
Use the existing dedicated Supabase/PostgreSQL project and storage where appropriate. Do not introduce a second database without an evidence-based architecture decision.

- Relational source of truth for users, memberships, projects, configuration versions, CRM metadata/records, workflow state, usage, billing references, and audit events.
- Supabase Storage or existing media storage for private user assets, with ownership-aware access.
- Queue/job persistence and worker leases using the established platform capability; do not assume Vercel request handlers can safely run indefinite jobs.
- Optional search/vector indexes only where the current knowledge/retrieval implementation requires them.
- Aggregated analytics views separated from raw operational records and governed by the same tenant boundaries.

## 5. Request and execution contracts

### 5.1 Authenticated dashboard request
1. Validate session/credential.
2. Resolve tenant, project, membership, role, and resource ownership.
3. Resolve subscription entitlements, key scope, quota, budget, and privacy policy.
4. Validate request schema and capability availability.
5. Execute through the appropriate shared service.
6. Persist state changes transactionally where possible.
7. record sanitized audit/usage events with a correlation ID.
8. Return a stable response envelope and actionable errors.

### 5.2 Public API request
1. Authenticate the API key; store only a cryptographic verifier/hash and non-secret prefix, never recoverable plaintext.
2. Resolve key status, owner, project, scopes, expiry, environment, and rate limits.
3. Apply the same entitlement and policy checks used by the dashboard.
4. Validate the request and reserve budget/usage before paid or costly work.
5. Route through the shared orchestrator/tool broker.
6. Settle usage exactly once, including defined handling for retries, partial failures, and provider-reported costs.
7. Return request/job ID and sanitized output; never expose internal provider credentials.

The proposed public API paths and payloads must be based on actual route contracts or an approved API-version proposal. Do not document illustrative endpoints as production-supported.

## 6. AI Workforce Builder data model

An AI profession is a versioned configuration, not a separate foundation model or privileged user.

Logical entities to map onto existing schema before creating migrations:

- `agent_definitions`: tenant/project owner, name, description, profession, status, creator.
- `agent_versions`: immutable instructions, input/output schema, model-routing preference, tool allowlist, knowledge references, memory policy, execution limits, safety rules, and version number.
- `agent_assignments`: which project, workflow, CRM queue, or product surface may invoke an agent.
- `agent_test_runs`: version under test, test case, sanitized input/output references, assertions, usage, result, timestamp.
- `agent_deployments`: version, environment, approval, deployed state, rollback reference.
- `agent_execution_runs`: status transitions, correlation ID, timing, safe error classification, usage references.

Names above are logical proposals, not a mandate to duplicate existing tables. Audit the schema first.

Every invocation must use a pinned version. Editing a draft must not silently change an already-deployed version. Tool access is explicit and checked at execution time; the model itself is never the authority for permissions.

### Profession builder lifecycle
Draft → Validate → Test → Review → Stage → Approve → Deploy → Monitor → Roll back/Retire.

Users configure:
- Profession, objective, responsibilities, and constraints.
- Instructions and output schema.
- Supported model or automatic routing within plan policy.
- Approved tools and data sources.
- Memory and retention settings.
- Triggers, schedules, conditions, retries, and approval steps.
- Rate, token, time, and spend limits.
- Test cases, evaluation criteria, and release version.

## 7. Workflow automation architecture

Use a declarative, versioned workflow graph with validated node types, typed inputs/outputs, and explicit edges. Do not evaluate arbitrary user-supplied JavaScript in the API process.

Workflow node categories may include:
- Trigger: manual, schedule, approved webhook, or supported domain event.
- Transform: schema validation, extraction, normalization, deduplication.
- AI task: invoke a configured agent with pinned version and bounded inputs.
- Condition/branch: deterministic, schema-validated predicates.
- Integration action: call an authorized adapter with scoped credentials.
- Human approval: pause until an authorized reviewer acts.
- Delay/retry: bounded and idempotent.
- Terminal: result, report, notification, or failure state.

Execution controls:
- Per-tenant concurrency and rate limits.
- Job leases/heartbeats and bounded retries.
- Exponential backoff with jitter where appropriate.
- Dead-letter/failed state and replay controls.
- Idempotency keys for external side effects.
- Cancellation and timeout support.
- Secret and personal-data redaction.
- Audit trail and trace/correlation IDs.
- Explicit approval for consequential actions.

Use a durable queue/worker model supported by the existing infrastructure. Research which queue/worker capability is already present before selecting an implementation. Supabase can store definitions, permissions, and history; it should not be assumed to be a complete long-running execution engine by itself.

## 8. CRM grid architecture

Build a metadata-driven CRM over a secure record service, not a set of hardcoded tables per profession.

Logical concepts:
- CRM workspace and table definitions.
- Field definitions with types, constraints, defaults, and validation.
- Records and typed field values or a carefully validated hybrid representation.
- Relations between records.
- Saved views, filters, sort order, grouping, and column preferences.
- Activity history, comments/notes, task assignments, and reminders.
- Import/export jobs with validation reports.
- Automation triggers and record-change events.

Supported field types may include text, long text, number, currency, date/time, checkbox, select/multi-select, email/URL, relation, and controlled formula fields. Formula evaluation must be bounded and safe; do not use `eval`.

Initial CRM tables:
- Leads
- Contacts
- Companies
- Deals/Sales
- Tasks
- Follow-ups
- Custom Tables

Views may include Grid, Kanban, and Calendar. Grid behavior should support search, sorting, filtering, inline edits with permission checks, column resizing, saved views, pagination/virtualization, and accessible mobile fallbacks.

Data integrity:
- Server-side validation for every write.
- Unique/deduplication rules where configured.
- Optimistic concurrency or equivalent protection against lost updates.
- Audit history for material changes.
- Relation checks to prevent cross-tenant links.
- Bulk operations with bounded batches and partial-failure reports.
- CSV/spreadsheet import/export that resists formula injection and validates file size/type.
- Index frequently filtered tenant/project/status/date fields based on measured query patterns.

## 9. Required Attention Center

Create a unified action queue driven by verified events and explicit business rules, not unsupported model speculation.

Potential sources:
- Overdue follow-up/task.
- Deal inactivity beyond a configured threshold.
- Customer inquiry waiting beyond a service target.
- Candidate awaiting human review.
- Failed workflow/job.
- Test failure or unhealthy deployment.
- Disconnected integration or expiring credential.
- Usage/budget threshold or billing failure.

Each item should include source type and record ID, tenant/project, rule or evidence, priority, owner, due time, status, deduplication key, and recommended next step. Users may assign, resolve, dismiss, or snooze where authorized. Repeated events should update/deduplicate the same item rather than create alert floods. AI may summarize evidence but must not fabricate the triggering facts.

## 10. Recruitment profession example

The AI Recruiter/Talent Sourcer is a reference implementation of the profession framework, not a privileged special case.

Workflow:
1. User defines a job opening and job-related criteria.
2. Agent searches approved public sources and authorized integrations.
3. Agent extracts relevant professional information with source URL/reference and retrieval timestamp.
4. Validation marks facts as observed, inferred, or missing.
5. Matching compares documented job-related evidence to criteria and explains the basis.
6. Deduplication checks existing authorized CRM records.
7. Candidate record is proposed or updated with provenance.
8. Human recruiter reviews and decides next steps.
9. Approved workflows may create tasks or draft outreach; sending requires configured authority and consent/compliance checks.

Do not bypass authentication, CAPTCHAs, paywalls, or source access controls. Respect source terms, rate limits, applicable privacy/data protection rules, retention limits, and requests to delete/correct records. Avoid protected traits and inappropriate proxies in matching. Do not automate final hiring decisions. Require human review for consequential candidate decisions and external outreach unless an explicitly approved, lawful workflow permits otherwise.

## 11. Preview, testing, and release

Separate configuration state from production state.

Environments: Development → Staging → Production, where applicable.

Required capabilities:
- Draft preview isolated from production data and credentials.
- Version-pinned test runs with deterministic fixtures where possible.
- Permission-denial and cross-tenant negative tests.
- Failure/timeout/rate-limit simulation.
- Cost and quota estimates with clear uncertainty.
- Comparison of outputs between versions.
- Explicit deployment review and approval.
- Immutable deployment reference and rollback target.
- Health monitoring and release status based on observed results.

Preview mode must not accidentally send real emails, modify production CRM records, trigger real payments, or perform external actions. Use mocks/sandbox integrations or explicit confirmation gates. Production secrets must never be copied into client-side preview bundles or test fixtures.

## 12. Usage, billing, and limits

Use a single authoritative metering and billing path shared by dashboard, API, agent, and workflow execution.

Required concepts:
- Usage reservation before expensive/uncertain work.
- Idempotent settlement keyed by a stable operation/request ID.
- Separate provider-reported cost from customer charge.
- Input/output/cached token fields where available.
- Media/job usage and asynchronous final-cost updates.
- Retry and partial-failure policy.
- Credit adjustments/refunds with audit records.
- Tenant, project, key, product, and capability breakdowns.
- Soft alerts and backend-enforced hard limits.
- Reconciliation against authoritative provider/billing records.

Never infer cost solely from token counts when provider billing or media pricing supplies a more authoritative amount. Never accept new billable work after a hard limit is reached except for explicitly permitted recovery or settlement operations. Do not create a second ledger if an existing authoritative billing/usage service already exists.

## 13. Security, privacy, and governance

- Reuse current authentication; do not introduce a second identity system.
- Enforce tenant/project/resource authorization on every read and write.
- Audit Supabase RLS, grants, SECURITY DEFINER functions, storage policies, and service-role usage.
- Keep privileged credentials server-side and encrypt integration secrets with a documented key-management approach.
- API key creation displays the secret once; subsequent screens show prefix/metadata only.
- Support revocation and rotation; enforce key scopes, environment, expiry, and rate limits.
- Apply least privilege to each AI agent and workflow node.
- Treat model output, imported documents, retrieved pages, webhook payloads, and tool results as untrusted input.
- Defend against prompt injection and indirect instructions in retrieved content; tool execution still requires deterministic policy checks.
- Restrict SSRF and outbound network access for URL fetchers and integrations.
- Apply data minimization, retention controls, export/delete workflows, and explicit memory/processing preferences.
- Redact credentials and unnecessary personal/sensitive content from logs.
- Record access to high-risk data and consequential actions.
- Use CSRF/CORS/session protections appropriate to the existing auth model.
- Do not enable automatic training on customer data; honor existing privacy commitments.
- Preserve product-level data isolation (including MOVO versus general NasrinAI conversations and records).

## 14. Observability and operational states

Use stable correlation IDs across dashboard request → orchestrator → workflow/job → provider/tool → usage/billing event.

Record sanitized:
- Initiator and project.
- Resource/version.
- State transitions.
- Start/end/latency.
- Success/failure category.
- Retry/fallback count.
- Usage references.
- Authorization decision code.
- Deployment/job/request identifiers.

Never log raw API keys, provider secrets, session cookies, or full sensitive payloads by default.

Expose truthful states: Draft, Validating, Testing, Awaiting Approval, Queued, Running, Succeeded, Failed, Cancelled, Paused, Deployed, Rolled Back, and Retired as applicable. A UI must not show “success” until the underlying operation confirms success.

## 15. Implementation sequence and gates

### Phase 0 — Evidence-based audit
- Inspect repository routes/components, service modules, API contracts, auth/session flow, Supabase schema/migrations/RLS, plan entitlements, billing/metering, jobs/workers, product routes, tests, and deployment configuration.
- Inventory existing implementations and open PRs.
- Produce a reuse map and ADRs for any genuine architecture gaps.
- No schema or production changes in this phase.

### Phase 1 — Shared dashboard foundation
- Shell, navigation, project/workspace selector, global settings, permission-aware route guards.
- Integrate existing auth and design system.
- Verify tenant isolation and mobile/accessibility behavior.

### Phase 2 — Projects and configuration registry
- Project/resource ownership, configuration versions, audit events, entitlements.
- Reuse existing tables/services where possible.
- Migration review and RLS tests before applying schema changes.

### Phase 3 — AI Workforce Builder
- Draft agent definitions, tools/policies, immutable versions, test runs, preview, approval, deployment states.
- Use the existing orchestrator.
- Test unauthorized tool calls and cross-tenant access.

### Phase 4 — Workflow runtime and CRM
- Declarative workflow graph, durable job processing, idempotency, failure/retry handling.
- CRM metadata, records, views, tasks, Required Attention.
- Validate data isolation, bulk operations, and alert deduplication.

### Phase 5 — Product integrations and developer controls
- Connect existing NasrinAI products and API-key/playground features according to audited contracts.
- No duplicated product services or undocumented endpoints.

### Phase 6 — Usage, billing, operations
- Unified metering views, budgets, request traces, job monitoring, notifications, reconciliation.
- Validate no double charges and server-enforced hard limits.

### Phase 7 — Production readiness
- Full regression suite, security review, tenant isolation tests, abuse/rate-limit tests, timeout/retry tests, load tests, migration parity, accessibility, documentation, deployment verification, rollback rehearsal.
- No release if critical security defects or required checks remain unresolved.

## 16. Required acceptance tests

- A user cannot read or modify another tenant's project, agent, CRM record, file, run, logs, or usage.
- Revoked/expired/scoped-out API keys are rejected server-side.
- A user cannot exceed subscription entitlements by calling an API directly.
- An agent cannot invoke a tool outside its configured allowlist, even if prompted to do so.
- A draft version does not mutate a deployed version.
- Preview/test cannot accidentally cause real production side effects.
- Workflow retries do not duplicate external actions or billing.
- A repeated webhook/event is idempotent.
- CRM writes validate types, relationships, and permissions.
- Required Attention items have a real triggering event and deduplicate correctly.
- Hard budgets are enforced under concurrent requests.
- Provider failures, partial outputs, timeouts, and cancellation leave consistent states.
- Secrets and sensitive payloads are absent from browser bundles and sanitized logs.
- Migration/RLS/grant tests pass.
- Existing chat, Code, Studio/video, Connect, auth, plans, and billing regression suites continue to pass.
- Production claims require live evidence; CI alone does not prove production behavior.

## 17. Documentation and delivery rules

Every implementation PR must update:
- This architecture document when decisions/scope change.
- `docs/CLAUDE_MASTER_PLAN_INDEX.md` with a concise pointer/status.
- `docs/CLAUDE_MASTER_PLAN_SUMMARY.md` with verified progress and blockers.
- `docs/pr-change-log.md` with changed files, behavior, and actual test results.
- Product-specific documentation and privacy/legal documents when data processing or user-facing behavior changes.

Track each feature as one of:
- Implemented and verified
- Implemented but not verified
- Partially implemented
- Not implemented
- Blocked

Include exact file paths, migration names, API contracts, test commands/results, PR references, deployment evidence, known risks, and next steps. Never infer completion from a plan or passing unit tests alone.

## 18. Explicit non-goals / guardrails

- Do not rewrite the existing application into a new framework as a prerequisite.
- Do not create duplicate auth, database, orchestrator, usage ledger, or workflow runtime without a documented ADR.
- Do not run untrusted code in the API process.
- Do not provide unrestricted scraping or bypass access controls.
- Do not allow AI agents to independently grant themselves permissions.
- Do not execute consequential external actions without explicit scoped authorization and required approval.
- Do not treat dashboard navigation or mock data as proof a feature works.
- Do not deploy, merge, or apply production migrations without the project's current approval rules.
