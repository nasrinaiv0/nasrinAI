# NasrinAI Bidirectional MCP Integration

Status: architecture proposal; implementation and production verification are not yet complete.

## Goal

Provide a secure, reusable Model Context Protocol (MCP) integration in both directions:

1. **ChatGPT → NasrinAI:** ChatGPT can discover and call explicitly exposed NasrinAI tools through a remote HTTPS MCP server.
2. **NasrinAI → external MCP services / OpenAI models:** NasrinAI's application can call approved remote MCP servers from its own server-side workflows and can use OpenAI's Responses API MCP tool when configured.

These are separate flows with separate authentication and permissions. Do not imply that connecting one automatically connects the other.

## Existing platform constraints

- Repository: `nasrinaiv0/nasrinAI`; production site: `https://nasrinai.com`.
- Runtime is Node.js >=22.13 and the project intentionally has zero runtime dependencies other than two pinned sandbox packages loaded on demand. Prefer built-in Node APIs unless an explicit architecture decision approves an MCP SDK.
- Keep the existing shared auth, tier, quota, privacy, AI routing, tool confirmation, audit, and tenant-isolation services as the source of truth.
- Do not expose provider credentials, Supabase service-role keys, internal environment values, private prompts, or other users' data to MCP callers.
- Do not implement a second AI router or bypass Quick/Pro/Max/Ultra entitlements.
- All changes must preserve the existing app and pass `npm test` plus database CI checks. Never report tests or deployment as passing without observed results.

## Architecture

```
ChatGPT (web, when account/workspace supports custom MCP)
    │ HTTPS + authenticated MCP session
    ▼
NasrinAI Remote MCP endpoint
    │ authenticate → authorize → validate → rate-limit → audit
    ▼
Existing NasrinAI application services
    ├── AI gateway / shared provider router
    ├── authorized knowledge search
    ├── repository inspection (read-only by default)
    ├── service health / approved analytics
    └── approved workflow execution (confirmation required)

NasrinAI server-side workflows
    │ explicit allowlist + credentials + approval policy
    ├── OpenAI Responses API with remote MCP tool (optional)
    └── other approved remote MCP servers
```

## Public endpoint and transport

Proposed endpoint: `https://nasrinai.com/mcp`. This URL is a target, not a claim that the route currently exists.

- Implement the current supported remote MCP transport (prefer Streamable HTTP) and protocol version negotiation.
- Validate JSON-RPC envelopes, method names, content types, request sizes, session lifecycle, and origin/host handling.
- Support tool discovery and invocation with deterministic JSON schemas and structured, bounded outputs.
- Return protocol-compliant errors without leaking stack traces, credentials, prompts, or internal service details.
- Add health/readiness checks that disclose no secrets.
- Verify the deployed Vercel routing and function runtime before selecting the final route shape.

## Initial tool allowlist

Start with low-risk tools only; keep the list small to reduce context cost and attack surface.

1. `nasrinai_chat`: invoke the existing server-side chat/orchestration service, enforcing caller identity, tier, quota, privacy, provider policy, and bounded input/output.
2. `nasrinai_search_knowledge`: search only knowledge sources the authenticated user is authorized to access.
3. `nasrinai_inspect_repository`: read-only inspection of repositories already authorized for that user; no arbitrary URL fetch or shell execution.
4. `nasrinai_check_health`: return a small allowlisted operational health summary without environment values or personal data.
5. `nasrinai_usage_summary`: return only the authenticated caller's permitted usage summary, not owner-only OCC/NCC analytics.
6. `nasrinai_development_plan`: produce a plan only; do not edit files, create PRs, deploy, or mutate databases.

Future write tools (repository writes, workflow triggers, deployments, financial actions, database changes) must be separate tools with explicit scope, least-privilege credentials, audit records, replay protection where applicable, and an explicit confirmation step. Never expose arbitrary command execution.

## Authentication and authorization

- Prefer standards-based OAuth 2.1 / OAuth authorization-server metadata for ChatGPT custom app connections where supported; validate issuer, audience, expiry, scopes, redirect URIs, state, and PKCE.
- If OAuth cannot be completed in the first increment, do not ship an unauthenticated public MCP endpoint. Use a narrowly scoped, revocable bearer credential only for controlled staging, store its hash where practical, and never embed it in client code or logs.
- Map each authenticated MCP identity to a NasrinAI user/tenant. Enforce ownership server-side on every tool call.
- Use scopes such as `chat:invoke`, `knowledge:read`, `repository:read`, `usage:self:read`; never grant owner-only scopes by default.
- Apply request and per-user limits, timeout budgets, payload limits, idempotency where relevant, and redacted append-only audit records.
- Treat all tool arguments, repository content, retrieved documents, and model outputs as untrusted; protect against prompt injection and SSRF.
- Never let model-provided URLs, IDs, user IDs, tenant IDs, or tier names determine authorization.

## NasrinAI → MCP / OpenAI

- Add a server-side MCP client capability only for explicitly allowlisted remote servers and tool names.
- When using OpenAI's Responses API MCP integration, configure `server_url`, the approved tool allowlist, and approval policy. Require approvals for write or sensitive tools; do not globally disable approvals.
- Provider API keys stay in server-side environment configuration. Do not forward a user's private conversation or data to a third-party MCP server unless the product's privacy rules and user authorization permit it.
- Route OpenAI model calls through the existing provider policy when possible; do not create a bypass around tiers, budget limits, privacy redaction, or provider billing.
- Make this integration optional: missing configuration must disable the feature with a safe diagnostic rather than breaking core chat.

## Data and privacy

If this integration adds new collection, storage, sharing, or retention of user data, update `public/legal/privacy.md` and `public/legal/terms.md` in the same implementation change and update the corresponding legal version defaults in `src/config.js`. Minimize stored arguments/results; redact secrets and sensitive content; use configured retention policies. Never use MCP user data for training without the applicable explicit consent.

## Implementation phases

### Phase 0 — repository reconnaissance
- Inspect `src/routes.js`, `src/main.js`, `src/config.js`, auth, rate limiting, confirmations, audit/usage logging, Vercel routing, legal docs, and CI.
- Confirm current branch/default branch and existing routes before changing files.
- Decide whether a dependency-free protocol implementation is maintainable or whether the owner explicitly approves a pinned official MCP SDK.

### Phase 1 — read-only remote MCP server
- Add the MCP transport and tool registry behind a feature flag.
- Wire only existing services and low-risk read tools.
- Add unit tests for protocol negotiation, tool discovery/calls, malformed requests, auth failures, scope failures, tenant isolation, limits, redaction, and tool errors.
- Add integration tests using fake providers/stores and verify existing test suite remains green.
- Verify Vercel preview endpoint with a real MCP client before proposing production rollout.

### Phase 2 — authenticated ChatGPT connection
- Complete OAuth metadata, consent, scopes, refresh-token behavior, revocation, and identity mapping.
- Test on ChatGPT web using an account/workspace that supports custom MCP connections.
- Do not assume Go-plan access: OpenAI's current published availability lists full custom MCP connections for Business and Enterprise/Edu, with read/fetch-only custom MCP connections for Pro. Availability must be rechecked at implementation time.

### Phase 3 — NasrinAI outbound MCP client
- Add a controlled client for approved remote MCP services and/or OpenAI Responses API MCP tool calls.
- Enforce tool allowlists, approval requirements, egress restrictions, cost budgets, timeouts, and audit logs.
- Add tests for untrusted tool results, prompt injection, remote server errors, timeouts, and data-sharing policy.

### Phase 4 — gated write actions
- Add individual write tools only after the read-only server passes security and production smoke tests.
- Require explicit user confirmation for consequential actions and keep rollback/revocation paths.
- Never auto-merge or deploy based solely on a model's unreviewed output.

## Acceptance criteria

- Existing app behavior remains intact; `npm test` and CI database tests pass.
- Unauthenticated and insufficiently scoped calls are denied.
- Every tool validates inputs and enforces per-user/tenant authorization.
- No secret, cross-tenant data, internal environment details, or owner-only analytics leak through tool schemas, errors, or logs.
- ChatGPT can discover tools and successfully invoke each enabled read-only tool in a supported web account.
- NasrinAI can invoke an explicitly allowlisted outbound MCP tool through the selected outbound path, with approvals for sensitive actions.
- Vercel preview and production status are reported separately and only after actual verification.

## Official references

- OpenAI MCP server guide: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- OpenAI MCP server building guide: https://developers.openai.com/api/docs/mcp
- ChatGPT custom MCP connection guidance: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
