# NCC Upgrade — NasrinAI Control Center Architecture

**Repository:** `primusco20/nasrinAI`  
**Product:** NCC (Nasrin Client Connect), at `ncc.nasrinai.com`  
**Document status:** Architecture and implementation plan; not a claim that every capability described here is already implemented.  
**Last updated:** 2026-10-14

## 1. Purpose and product boundary

NCC is NasrinAI's enterprise CRM and workflow-automation application. It combines contact and deal management with a programmable automation layer inspired by n8n: visual workflows, event and schedule triggers, branching logic, API integrations, AI-assisted planning, reliable execution, diagnostics, and controlled outbound actions.

NCC is **separate from NasrinAI Connect**. Connect governs authorized website/widget installation; NCC is the business CRM and automation workspace. NCC remains team-enabled and off by default. Access is allowed only when `NCC_ENABLED=true` and the verified sign-in email is included in `NCC_ACCOUNTS`. The product is enterprise-led, not open self-service, until the owner changes that decision.

This document extends the current implementation documented in `docs/ncc.md`; it does not replace that source of truth. Preserve existing CRM behavior, Meta integration contracts, tenant checks, approval outbox, and the repository's zero-runtime-dependency rule.

## 2. Architecture principles

1. **Goal-oriented automation:** users may build workflows visually or describe a goal in natural language. AI proposes a validated workflow; it does not gain authority merely by reasoning.
2. **Control plane / execution plane separation:** workflow design, versioning and authorization are separate from durable background execution.
3. **Deterministic first:** use ordinary code and rules for known transformations. Call an AI model only where interpretation, generation or reasoning is useful.
4. **Fail closed:** missing configuration, unsupported capabilities, invalid permissions or unavailable required services must produce a clear failure—not a fake success or silent skip.
5. **Tenant isolation:** every request and database operation is scoped to the authenticated account and tenant on the server.
6. **Approval for side effects:** outward actions require explicit confirmation or a narrow, owner-enabled permission for that exact action and workflow.
7. **Durable and observable:** executions, node results, retries, approval states and outbound delivery outcomes must survive process restarts and be inspectable.
8. **No secrets in model context or logs:** AI sees only the minimum sanitized information needed to perform its task.
9. **Small, reviewable increments:** stage changes first, preserve tests and avoid unrelated modifications.
10. **No new runtime packages (ADR-002):** Node.js 22 built-ins only, except the existing on-demand coding sandbox's two pinned packages. Any proposed dependency exception requires a separate owner decision.

## 3. High-level system

```text
NasrinAI UI / NCC Workspace
  ├─ Visual Workflow Studio
  ├─ AI Workflow Builder
  ├─ Connections & Permissions
  ├─ Approval Outbox
  └─ Execution Inspector
             |
             v
NCC Control Plane (authenticated server routes)
  ├─ Tenant and account authorization
  ├─ Workflow CRUD, schema validation and immutable versions
  ├─ Trigger registration and schedule management
  ├─ Connector registry and policy checks
  └─ Execution request creation
             |
             v
Durable Execution Plane
  ├─ Scheduler / webhook ingress / manual trigger
  ├─ Durable queue and worker processes
  ├─ Graph executor and node registry
  ├─ Checkpoints, retry policy and cancellation
  └─ Error and recovery workflows
             |
             v
Policy and Integration Boundary
  ├─ Per-node permission checks
  ├─ Secret broker / credential references
  ├─ Outbound network and sandbox restrictions
  ├─ Human approval gates
  └─ Provider adapters and official APIs
             |
             v
Persistence and Observability
  ├─ Supabase PostgreSQL (RLS, tenant-scoped records)
  ├─ Execution logs, metrics and audit events
  ├─ Durable outbound outbox and provider receipts
  └─ Object storage for large artifacts, if needed
```

### Existing-stack deployment guidance

- **Vercel:** retain the existing UI, authenticated API and short-lived control-plane work. Do not rely on a normal request handler to remain alive for long-running workflow execution.
- **Supabase/PostgreSQL:** persist workflow definitions, versions, run state, approvals, connector metadata and outbox state. Keep RLS enabled and browser roles denied for server-only tables as in the current NCC design.
- **Durable queue/workers:** introduce or select a durable background execution mechanism with job recovery, concurrency controls and worker-restart recovery. Redis-backed queue workers are one option, but durability guarantees must be verified. Do not assume Supabase by itself is a complete queue or Vercel functions are persistent workers.
- **Scheduler/webhooks:** convert schedule ticks and external events into authenticated, deduplicated execution requests. Verify webhook signatures where supported.
- **Object storage:** store large outputs/media separately when required, with scoped access and retention rules.
- **Observability:** centralize structured logs, metrics, traces and alerts. Redact credentials, authorization headers, tokens and sensitive payloads.

The queue/worker technology is an architectural decision still to be validated against current infrastructure and deployment constraints; do not add dependencies before that decision.

## 4. Workflow Studio

Provide a responsive, accessible node editor suitable for desktop and iPhone. The editor should support:

- Drag/drop node placement and connections, pan/zoom, search, undo/redo, copy/paste and templates.
- Typed inputs and outputs, field mapping, schema validation and visible configuration errors.
- Draft, validate, publish, compare versions and roll back.
- Test runs with sample/pinned input where safe.
- Per-node input/output inspection, status, duration and error explanation.
- Run history, filtering, cancellation and replay from a safe checkpoint.
- Reusable sub-workflows with explicit input/output contracts.

A workflow's published definition must be immutable. Executions reference a specific published version and node versions, never the unsaved editor state. Secrets must be represented by connection references, not embedded in workflow JSON.

## 5. Standard node contract and categories

All nodes use a versioned contract with typed schemas, declared permissions, validation and an execution function. Conceptual TypeScript shape:

```ts
interface NCCNode {
  type: string;
  version: number;
  inputSchema: object;
  outputSchema: object;
  permissions: string[];
  validate(config: unknown): ValidationResult;
  execute(
    context: ExecutionContext,
    input: unknown,
    config: unknown
  ): Promise<NodeResult>;
}
```

The actual implementation should follow the repository's JavaScript conventions; this interface is illustrative, not a requirement to introduce TypeScript.

| Category | Node examples |
|---|---|
| Triggers | Manual, webhook, schedule, contact created, tag added, deal created/stage changed, task completed |
| Logic | IF, switch, filter, merge, loop, wait, deduplicate |
| Data | Map fields, transform, parse JSON, validate, aggregate |
| AI | Agent, classify, extract, summarize, draft, evaluate |
| Integrations | HTTP request, email, CRM, database, supported third-party service |
| Social | Create draft, preview, approve, publish, delivery-status check |
| Reliability | Retry, error handler, checkpoint, alert, sub-workflow |
| Developer | Sandboxed JavaScript; sandboxed Python only if a reviewed isolated runtime is available |

Validate every node's configuration and inputs/outputs. Apply node-version compatibility and migration rules so old workflows remain readable and reproducible. Never execute user-supplied code inside the main web server. Arbitrary code must run in an isolated sandbox with CPU, memory, wall-clock, filesystem and network restrictions. Shell access is disabled by default and requires a separately authorized isolated environment.

## 6. Trigger and execution lifecycle

Supported trigger families should include manual execution, signed webhooks, schedules, supported application events and sub-workflow calls. Triggers must authenticate, validate payloads, enforce quotas and deduplicate events before creating a run.

Recommended lifecycle:

1. Receive trigger and create a request with a stable event/idempotency key.
2. Authenticate the actor, resolve the tenant, check NCC enablement and authorize the trigger.
3. Load an immutable published workflow version.
4. Validate graph structure, node versions, credentials, permissions, budgets and required configuration.
5. Create a durable execution record and enqueue it.
6. Workers execute ready nodes, persist node state and pass validated outputs to dependent nodes.
7. Pause at an approval gate, persist the pending action, and resume only after a valid authorized decision.
8. Classify failures, retry safe transient errors, or run the configured error workflow.
9. Finalize status and persist sanitized outputs, timing, resource use, provider result and audit events.

Use bounded concurrency, timeouts, retry backoff with jitter, cancellation and execution budgets. A retry must not duplicate an external side effect. Use idempotency keys where supported, and reconcile ambiguous provider outcomes before replaying sends or publishes. Do not claim exactly-once delivery where the external provider cannot guarantee it.

## 7. AI workflow builder and agent policy

Users may describe an automation in natural language. NasrinAI should:

1. Parse the goal and propose a structured plan.
2. Select only registered node types and available connector capabilities.
3. Ask for missing essential configuration, credentials or permissions rather than inventing them.
4. Validate schemas, graph reachability, cycles, budgets and approval gates.
5. Show a readable preview of the workflow and its external effects.
6. Save as a draft and require explicit publication before scheduled/production execution.
7. Execute only within user- and tenant-authorized capabilities.

Agents receive bounded tools and sanitized context. The model cannot grant itself permissions, reveal credentials, disable policy checks, bypass approvals or silently install new connectors. Deterministic operations should not incur unnecessary LLM calls.

### NasrinAI intelligence tiers

Use the existing Quick / Pro / Max / Ultra routing policy, subject to plan entitlements and configured budgets:

- **Quick:** simple classification, extraction and lightweight transformations.
- **Pro:** standard multi-step workflows, summaries and routine orchestration.
- **Max:** complex multi-tool planning and deeper diagnosis.
- **Ultra:** demanding analysis, advanced planning and complex developer workflows.

The orchestrator selects providers based on task complexity, tool availability, latency, context size, privacy policy, plan entitlement and estimated cost. Model choice never overrides connector permissions or action approval. Track actual token/provider usage and enforce both plan allowances and separate anti-abuse rate limits.

## 8. Connector gateway

Provide one integration boundary for native adapters, HTTP APIs, webhooks, databases and approved internal NasrinAI services. Each adapter declares supported actions, input/output schemas, required scopes, rate limits, idempotency support and error mapping.

Required capabilities:

- OAuth connection lifecycle and token refresh where applicable.
- Tenant-bound encrypted credential references; no raw credentials in workflow JSON, browser state or model context.
- Pagination, normalized errors, rate-limit handling and timeouts.
- Allowlisted destinations and SSRF protections, including redirect/DNS/private-network defenses.
- Egress restrictions for code sandboxes.
- Connector health/status and explicit unavailable/reauthorization states.
- Official APIs only for third-party social and messaging platforms.

Do not promise a fixed number of integrations until each adapter exists and is tested. Start with current NCC and NasrinAI integrations, then add connectors incrementally.

## 9. Social media automation and approval outbox

Preserve the existing Meta integration in `src/ncc-meta.js`, channel storage in `ncc_channels`, and `ncc_outbox` behavior described in `docs/ncc.md`. Current supported actions include Facebook Page posts, Instagram publishing, Threads posts and WhatsApp messages; Messenger inbox support is not built yet. Do not imply that all Meta products share the same endpoints, permissions or publishing capabilities.

Recommended flow:

```text
Schedule / CRM Event
  -> Generate platform-specific draft
  -> Validate channel, media, policy and permissions
  -> Create preview and outbox item
  -> Await explicit approval or narrow per-workflow authorization
  -> Claim outbound item atomically
  -> Call the official provider API
  -> Reconcile provider result
  -> Mark sent/published or failed; show actionable reason
```

Keep explicit states: `draft`, `pending_approval`, `approved`, `queued`, `publishing`, `published`, `failed`, `cancelled`. Adapt names to existing schema/state conventions where necessary rather than breaking current clients.

Requirements:

- Default outward actions to approval-required.
- Any unattended-send setting must be opt-in, narrow, visible and scoped to a specific action/workflow/channel.
- Use a stable idempotency key and atomic claim/lease to prevent concurrent duplicate sends.
- Store provider IDs and sanitized delivery results for reconciliation.
- Handle expired tokens, permission failures, rate limits, media constraints and WhatsApp template/window rules.
- Never log access tokens or message contents unnecessarily.
- If a result is ambiguous, reconcile before retrying; never silently report success.
- Confirm channel-specific support and Meta app review requirements before enabling an action.

## 10. Persistence model

Review the existing schema before adding migrations. The current logical data includes `ncc_contacts`, `ncc_deals`, `ncc_tasks`, `ncc_activities`, `ncc_automations`, `ncc_channels` and `ncc_outbox`.

Potential new logical entities, only if equivalent structures do not already exist:

| Entity | Purpose |
|---|---|
| `ncc_workflows` | Workflow identity, owner, tenant and lifecycle |
| `ncc_workflow_versions` | Immutable published definitions and node versions |
| `ncc_executions` | Trigger, workflow version, lifecycle and final outcome |
| `ncc_node_runs` | Node state, timing, sanitized output and error classification |
| `ncc_schedules` | Schedule definition, next run and registration status |
| `ncc_approvals` | Pending action, authorized approver, decision and timestamps |
| `ncc_audit_events` | Security-sensitive workflow, permission and action events |
| `ncc_connections` | Optional normalized connector metadata and credential references |

Do not duplicate current channel/outbox tables. All new migrations must be additive, reviewed, ordered, tested against a clean database and an existing database, and run in staging before production. Every tenant-owned query must be server-authorized and tenant-scoped; keep RLS on and deny browser roles direct access to server-only records. Define retention, export and deletion behavior for new execution data and update privacy/terms documents in the same change when data handling changes.

## 11. Security and governance

- Authenticate every API request; authorize every workflow, run, node, connection, schedule, approval and outbox action server-side.
- Enforce tenant and user ownership in every database operation. Never trust browser-supplied tenant IDs.
- Encrypt connector credentials at rest, limit decryption to authorized execution paths, redact secrets, and support rotation without exposing values.
- Treat AI output, webhook payloads, imported files, connector responses and node output as untrusted data.
- Protect against SSRF, DNS rebinding, malicious redirects, injection, unsafe deserialization and cross-tenant references.
- Apply per-user/tenant concurrency, rate, runtime, memory, output-size and cost budgets.
- Verify webhook signatures, use replay protection, and limit payload size.
- Require approval for publishing, external messages, destructive operations, financial actions and permission changes unless the owner explicitly configured a narrow authorized policy.
- Keep append-only or tamper-evident audit records for security-sensitive events.
- Never store secrets in Git, tests, fixtures, error messages, screenshots or execution logs.
- Ensure user-visible errors are clear without disclosing internal secrets or provider credentials.

## 12. Failure handling, diagnosis and repair

Classify errors into transient, authorization, configuration, validation, rate-limit, provider-permanent and unknown categories.

- **401/403:** report authentication/scope problem; never reveal the token.
- **429:** honor `Retry-After`, back off and enforce quotas.
- **Timeout:** determine whether the action might already have succeeded before retrying.
- **Invalid input:** identify the exact node and field and show expected schema.
- **Missing connector/capability:** stop or take an explicitly configured error branch; do not silently skip.
- **Repeated failure:** stop retry loops and trigger the configured alert/error workflow.

AI-assisted repair may inspect sanitized logs and node metadata, propose a minimal patch, and generate a regression test. Validate the patch in a test execution before promotion. Automatic repair may retry safe transient errors; production changes affecting permissions, credentials, public posts or other side effects require appropriate approval. A rollback is reported only when it was actually executed and verified.

## 13. Observability and operator experience

The NCC execution inspector should show:

- Workflow/version, trigger source, execution ID, tenant-scoped owner and lifecycle state.
- Per-node queued/running/succeeded/failed/skipped status, duration and retry count.
- Sanitized input/output, validation results and actionable error messages.
- Approval waiting state, approver decision and outbound provider status.
- Queue delay, worker health, failure rates, retries, cost/token use and quota consumption.
- Search/filter by workflow, status, date and error category.
- Safe retry/replay and cancellation controls with authorization checks.

Provide operational alerts for queue backlog, repeated failures, expired connectors, scheduler drift and exhausted quotas. Never expose another tenant's run or artifact in search, logs or UI.

## 14. Implementation roadmap (one focused PR per phase)

### Phase 0 — Repository audit and baseline
- Inspect current NCC UI, `src/ncc.js`, `src/ncc-automations.js`, `src/ncc-meta.js`, migrations, tests, scheduler/cron setup and Vercel limits.
- Trace the real trigger-to-run-to-result path and confirm what executes today.
- Document existing state machines and avoid duplicating tables/routes.
- Record baseline tests and known gaps. No architecture-only document should be represented as shipped functionality.

### Phase 1 — Reliable execution core
- Define node contracts and workflow schema validation.
- Persist immutable versions and execution/node-run states.
- Implement bounded graph execution, timeout, cancellation, safe retries, idempotency and error states.
- Demonstrate restart recovery using the selected durable queue/worker approach.

### Phase 2 — Workflow Studio
- Improve the visual editor, node inspector, validation, version history and test-run UX.
- Keep draft and published states separate.
- Provide accessible desktop/mobile interaction and actionable validation errors.

### Phase 3 — Connectors and governance
- Normalize connector capabilities, credential references and error mapping.
- Add webhook verification, network restrictions, permissions, quotas and audit events.
- Add connectors only after their capabilities and failure behavior are tested.

### Phase 4 — Social and CRM automation hardening
- Verify the current Meta approval outbox end-to-end in staging.
- Add schedule/event triggers and supported sub-workflows.
- Test duplicate events, expired credentials, ambiguous timeouts, rate limits and per-channel restrictions.
- Keep Messenger marked planned until implemented and verified.

### Phase 5 — AI workflow generation and repair
- Generate schema-valid draft workflows from user goals.
- Add safe test mode, bounded tool selection and cost limits.
- Add failure diagnosis, candidate patches and regression tests.
- Keep authorization and approvals outside the model's control.

### Phase 6 — Production operations and scale
- Load-test queue and worker behavior with documented target workloads.
- Test worker crash/restart, queue backlog, database failure, provider outage and recovery.
- Add dashboards, alerts, backup/restore and retention controls.
- Enable features gradually behind explicit flags and account allowlists.

## 15. Acceptance tests / release gates

A phase is not complete until relevant automated tests and staging verification pass.

- [ ] A workflow can be drafted, validated, published, executed and inspected end-to-end.
- [ ] Executions reference immutable workflow versions.
- [ ] Worker restart preserves and recovers eligible queued/running work.
- [ ] Duplicate webhook/event delivery cannot create duplicate side effects.
- [ ] Timeouts and ambiguous provider outcomes do not blindly replay outbound actions.
- [ ] Cross-tenant access tests fail securely for workflows, runs, connections, approvals, artifacts and outbox items.
- [ ] Disabled NCC accounts and unauthorized channel actions cannot execute.
- [ ] Approval-required posts/messages cannot bypass the approval policy.
- [ ] Provider failure and missing capability are visible; success is reported only when verified.
- [ ] Expired credentials and permission failures produce safe, actionable errors.
- [ ] Sandboxed code cannot access host secrets or unrestricted private network targets.
- [ ] Runtime, memory, output, concurrency, token and cost budgets are enforced.
- [ ] Logs, traces, errors, tests and screenshots do not expose secrets or unnecessary customer data.
- [ ] Database migrations pass clean-install and upgrade tests; RLS and server-only grants are verified.
- [ ] Privacy, Terms, export and deletion behavior are updated where required.
- [ ] `npm test` and database tests pass; live-provider staging tests are clearly distinguished from mocked tests.
- [ ] Feature flags remain off for accounts/channels not explicitly enabled.

## 16. Repository workflow and release discipline

Follow `CLAUDE.md` and `docs/claude-code-handoff.md`:

- Inspect the actual code and branch state before implementation.
- Keep changes focused and reviewable; use a short-lived feature branch.
- Do not work directly on `main`, force-push, rewrite history or merge without the owner's authorization.
- Run `npm test` and relevant database/security/integration tests; do not hand over a PR with failing checks.
- Use staging before production; do not point production DNS or secrets at staging.
- Update `docs/ncc.md`, `CLAUDE.md`, changelog and legal documents when implementation or data handling changes.
- Keep this architecture document aspirational where a feature is not yet implemented. Update its status only after code, tests and staging evidence confirm the capability.
- Never commit or print API keys, tokens, database dumps or customer data.

## 17. Decisions still requiring verification or owner input

- Select a durable queue/worker implementation that fits the no-new-runtime-dependency rule, or request explicit approval for an exception.
- Confirm execution-data retention, export and deletion policy before storing expanded node inputs/outputs.
- Confirm target workload, concurrency and latency objectives before making scale claims.
- Confirm connector list and provider permissions one adapter at a time; do not promise a fixed integration count.
- Complete enterprise contract and data-processing terms per the existing `docs/ncc.md` owner-input list.
- Complete Meta app review and verify each channel capability before production enablement.

## Definition of success

NCC is successful when a business user can describe or visually build a workflow, validate it, authorize its effects, run it reliably, inspect every step, understand failures, and recover safely—without silent skips, duplicate outbound actions, cross-tenant access or secrets exposed to models or logs.


## 18. Reference interaction model — connected, agentic node canvas

The target UX is the node canvas shown in the owner's reference image: a trigger node flows into an AI Agent node; the agent has separate **Chat Model**, **Memory**, and **Tool** connections; its result enters an IF/Switch node; true/false branches lead to different application actions. This is a core NCC interaction pattern, not merely a static diagram.

### Canvas behavior

- Every node is a visible card with an icon, name, configured operation, status and input/output ports.
- Users connect output ports to compatible input ports by dragging edges. The editor highlights valid targets and rejects incompatible types with a clear explanation.
- Main workflow edges carry execution data. AI sub-connections are visually distinct and typed: Chat Model, Memory and Tool.
- Branch nodes expose named outputs such as true/false, matched/unmatched, success/error. Each branch's condition is editable and testable.
- Tool nodes connect to an agent through a tool port, and the agent can choose only among tools explicitly connected and authorized for that workflow.
- The canvas supports zoom, pan, fit-to-workflow, node search, keyboard navigation, undo/redo, multi-select, copy/paste, duplicate, disable, notes and reusable subflows.
- Selecting a node opens a configuration/inspection panel with fields, credential reference selector, required scopes, input/output schema, test action and documentation.
- Run mode displays node state, duration, sanitized input/output, retries and error details. A node that was not reached must be marked skipped/not-run, never shown as successful.
- Provide both an interactive canvas and a simple step/list view for mobile and accessibility. Do not make precise drag-and-drop the only way to edit on iPhone.
- Draft edits do not alter the currently published version. Publish shows a diff and validates the graph before activation.

### Agent node contract

The Agent node is an orchestrator for bounded tool calls, not a replacement for the graph runtime. It receives a task and permitted context, reasons using the configured chat model, and may invoke only its connected tools. Each invocation is validated and authorized by the server. The agent has configurable iteration, time, token/cost and tool-call budgets. It returns structured output matching a declared schema and a trace of tool names/results with sensitive values redacted.

- **Chat Model port:** references a supported NasrinAI model/provider configuration; it never stores a provider key in the workflow.
- **Memory port:** optional, tenant-scoped memory with explicit retention and data minimization. Memory is not an authorization source. Do not train on business customer data by default.
- **Tool port:** one or more registered, typed, permissioned tools. A tool may read data, transform data or request a write action; write-capable tools enforce policy at invocation time.
- **Human approval:** agent proposals for external or consequential side effects pause at a durable approval gate when required. The agent cannot approve its own action.
- **Structured output:** downstream IF/Switch nodes should branch on validated fields, not parse arbitrary free-form prose when a typed result is possible.
- **Loop prevention:** cap agent iterations and workflow recursion; track call budgets and detect repeated identical tool calls.

### Example matching the reference image

```text
[Form/Webhook Trigger: Create User]
                 |
                 v
       [AI Agent: Provision User]
          |       |        |
          |       |        +-- Tool port --> [Directory: Find User]
          |       |        +-- Tool port --> [Jira: Create User]
          |       |
          |       +-- Memory port --> [Tenant-scoped approved memory]
          +---------- Chat Model port --> [Configured NasrinAI model]
                 |
                 v
          [IF: Is Manager?]
              /       \
           true       false
            |           |
            v           v
 [Slack: Invite to   [Directory/Jira:
  approved channel]   Update user profile]
            \           /
             v         v
          [Record Result / Notify]
```

This is illustrative. The actual available operations depend on connected and verified adapters; Slack, directory and Jira actions must not appear executable until their connector, permissions and credentials are configured.

### Universal capability model

“Do everything” means the canvas can orchestrate any operation exposed by a registered, authorized node or connector—not unrestricted access to every website, account, machine or API. NCC should support:

1. Built-in trigger, logic, data, AI, approval, error and utility nodes.
2. Registered native service connectors with explicit operation catalogs.
3. A secure HTTP/API node for authorized destinations, with schema validation and SSRF/egress protections.
4. Webhook send/receive nodes with signature verification and replay protection.
5. Reusable sub-workflows and bounded AI agents that combine multiple tools.
6. Sandboxed custom code only when the isolated runtime is available and approved; shell execution stays disabled by default.
7. A capability catalog that tells users which connectors/actions are available, what permissions are required, and whether the action is read-only, reversible or externally consequential.

Unknown integrations should be reported as unavailable or offered as a draft connector configuration. NCC must never invent a successful integration, silently skip a missing node, or claim an external action completed without a verified result.

### Additional acceptance criteria for the canvas

- [ ] A user can recreate the trigger → AI Agent → IF true/false → action branches pattern shown in the reference.
- [ ] Chat Model, Memory and Tool connections are separate, typed and validated.
- [ ] The agent cannot invoke tools that are not connected, registered and authorized.
- [ ] Conditional branches route using typed output values and have testable conditions.
- [ ] The run inspector shows the actual executed path and node-level results.
- [ ] Editing a draft cannot mutate an active published workflow.
- [ ] Mobile users can configure and inspect workflows without relying exclusively on drag-and-drop.
- [ ] Missing connectors, invalid scopes and disabled actions fail visibly and securely.
