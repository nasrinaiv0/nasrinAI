# NasrinAI Media Skills — Integration Architecture

**Status:** Proposed architecture only. No implementation or provider integration is authorized by this document.

## Goals

Add reusable media-production judgment and constrained tools to Video Studio while reusing the existing NasrinAI orchestrator, authentication, billing, storage and observability. Do not create a separate foundation model per skill or bypass existing tier/provider policy.

## Logical flow

1. User submits a brief or media job in Video Studio.
2. API authenticates user, checks tenant ownership, plan entitlement, quota and consent.
3. Orchestrator classifies intent, complexity, media type, privacy level, cost ceiling and required capability.
4. Skill registry returns only approved, enabled skills compatible with the task and user's tier.
5. Planner produces a structured job plan: steps, inputs, expected outputs, tools, provider candidates, estimated cost and risks.
6. API validates the plan against a strict schema and permission policy. Paid or sensitive actions may require user confirmation.
7. Job scheduler dispatches constrained operations to isolated workers/adapters.
8. Workers return structured results and artifact references; API validates output, stores artifacts privately and records provenance.
9. QA stage checks technical quality, rights/provenance metadata and required deliverables.
10. User receives status, output and transparent cost/usage information. Failures are resumable/cancellable and do not silently re-submit paid work.

## Components

- **Skill registry:** immutable skill ID/version/source SHA, capabilities, tier gates, license/security/test state, cost class and enabled flag.
- **Policy gate:** enforces user permissions, tier, consent, provider allowlists, cost cap, network allowlist and tool scopes.
- **Orchestrator adapter:** asks for a plan; it does not execute arbitrary instructions or expose secrets.
- **Provider adapters:** typed contracts per official API; validate inputs/responses and normalize job state/output.
- **Worker pool:** isolated media operations with strict resource and filesystem boundaries.
- **Artifact service:** private object storage, signed URLs, retention/deletion and tenant-scoped access.
- **Cost/usage ledger:** estimated versus actual provider cost, token/runtime costs, retries, refunds/failed calls and job ID.
- **Audit telemetry:** structured state changes and security events; no credentials or unnecessary prompt/media content.
- **Owner controls:** enable/disable approved skills, view errors/costs, change caps and trigger kill switch; owner access remains server-authorized.

## Skill contract

A runtime skill should declare: name/version, description, input schema, output schema, capability tags, required tool IDs, data sensitivity, provider dependencies, cost class, permissions, time/resource limits, idempotency support, acceptance tests, source provenance, license and owner approval. Skills may recommend a workflow but cannot grant themselves permissions.

## Tool policy

- No unrestricted shell, arbitrary URL fetch, arbitrary filesystem paths, direct database access, or secret-reading tools from the agent.
- Expose narrow tools such as `probe_media`, `render_remotion_template`, `request_provider_generation`, `transcribe_with_consent`, and `write_job_artifact`, each with schema validation and authorization.
- Each tool enforces the policy independently; prompt instructions alone are not a security boundary.
- Paid requests require an estimated cost, idempotency key and configured cost ceiling.
- Sensitive cloud upload requires disclosure and affirmative consent.
- Store API credentials only server-side and inject them into the adapter, never into prompts or browser code.

## Tier and provider routing

Use the existing NasrinAI plan and provider-routing policy. The skill layer should express task requirements, not hard-code a model as if it were always best. Router selects only configured providers based on capability, user tier, privacy, latency, quota, availability and estimated cost. Respect Quick/free restrictions and do not silently charge a user. Keep provider-independent skills usable if one vendor is unavailable.

## Persistence

Suggested entities (names are illustrative; align with current schema before migration):
- `media_skill_registry`: approved skill metadata and enablement state.
- `media_jobs`: owner, tenant, skill/version, state, idempotency key, cancellation and timestamps.
- `media_job_steps`: typed operation, status, retry count, bounded error code and timing.
- `media_artifacts`: private storage key, content type, size, checksum, provenance, retention/deletion state.
- `media_usage_events`: provider/model, estimated and actual cost, units, currency, job/step ID.
- `media_skill_audit_events`: approval, enable/disable, version changes and security decisions.
Do not create these tables until current schema, RLS patterns, migration conventions and retention policy have been inspected and a separate implementation is approved.

## Failure behavior

Use explicit job states, bounded retries, backoff for transient failures, no retry for invalid requests, cancellation propagation, orphan cleanup and reconciliation for provider jobs whose final status is unknown. Do not retry non-idempotent generation without checking whether the first request was accepted.

## Non-goals for first pilot

No autonomous publishing, social account access, face/voice identity training, arbitrary third-party MCP execution, remote-shell installation, or bulk import of the catalog. Those require separate threat models and approvals.


## Existing NasrinAI integration alignment — 2026-10-27

- `docs/NASRINAI_SKILLS.md` and `knowledge/nasrinai_skills_kb.json` already define a descriptive capability catalog and status lifecycle. Do not create a parallel public skill catalog or mark a capability `implemented_verified` just because a markdown package has been added. Any new KB entry must remain `planned` or `needs_verification` until the live code path and tests prove it.
- Video Studio already has a render-worker path in `src/video-studio-render-worker.js` and uses a sandboxed render architecture documented in `docs/ai-video-studio-architecture.md`. Reuse the existing authenticated job/storage/cost/ownership flow where appropriate; do not create a duplicate render queue or bypass the existing sandbox.
- The current renderer and provider-backed generation path are not equivalent to an arbitrary skill runtime. First import provider-independent skill instructions as **planning guidance only**. Any script execution or external API integration must be a separate, explicit adapter with its own tool schema, sandbox, budget gate, test coverage and rollout approval.
- Proposed source staging path for the five instruction-only candidates: `docs/integrations/media-skills/proposed-imports/<skill-id>/SKILL.md` in the documentation/review branch, or an agreed runtime path only after the existing loader is identified. Do not silently choose a production runtime destination before verifying how current orchestration loads skill instructions.
- Keep `EVAL.md` out of any production agent context. Use it only to derive NasrinAI-owned evaluation cases, then write tests into the appropriate existing test structure.
