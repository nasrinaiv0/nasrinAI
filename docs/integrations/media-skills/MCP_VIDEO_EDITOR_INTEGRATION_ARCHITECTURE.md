# NasrinAI Video Studio — MCP Video Editor Integration Architecture

**Status:** Planning only — no application code imported or executed  
**Target:** `nasrinaiv0/nasrinAI`  
**Upstream:** [AISEO-VirtualabDigital/mcp-video-editor](https://github.com/AISEO-VirtualabDigital/mcp-video-editor)  
**Audited revision:** `97da3e381df57641cd9af5f83c05eff0abfde862`  
**License signal:** `package.json` declares MIT; the audited tree has no standalone `LICENSE` file. Confirm upstream license/permission before redistributing.

## 1. Decision

Treat the upstream MCP editor as a **reference implementation and potential reusable editing adapter**, not as a drop-in production video renderer. Preserve the separation between NasrinAI's AI media skills, provider integrations, editing project model, render workers, storage, and user-facing Video Studio.

The source is TypeScript/Node.js and supports CapCut/OpenCut project JSON. Its export implementation does **not** provide a self-contained production rendering pipeline: CapCut exports require the desktop GUI; OpenCut can use a local export endpoint when available, otherwise an export task is written for an external renderer. NasrinAI must implement or integrate a real, isolated renderer and verify the produced artifact.

## 2. Target architecture

```text
NasrinAI Video Studio (mobile-first UI)
        |
        v
Authenticated Video API / job coordinator
        |-- entitlement + plan limits (Quick / Pro / Max / Ultra)
        |-- workflow planner / media-skills registry
        |-- provider router (Higgsfield and approved media providers)
        |-- project/timeline service (normalized, editor-neutral schema)
        |-- cost estimate + idempotency + quota reservation
        |
        +--> Asset generation adapters --> object storage
        |
        +--> Editing adapter layer
        |      |-- upstream MCP concepts/tools, adapted behind server boundary
        |      |-- optional CapCut/OpenCut import/export adapters
        |      |-- no mandatory dependency on a desktop editor
        |
        +--> Isolated render queue --> FFmpeg/render worker --> MP4 + render receipt
        |
        +--> QA worker: probe, duration, streams, audio, black/frozen frames,
        |               aspect ratio, file size, subtitles and delivery manifest
        |
        +--> Supabase: projects, assets, jobs, events, usage/cost reconciliation
```

### Service boundaries

- **Browser:** UI and upload flow only. Never expose provider keys, filesystem paths, MCP credentials, or privileged storage credentials.
- **API/coordinator:** authenticates users, checks ownership/entitlements, validates requests, reserves quotas, creates idempotent jobs, and returns safe status.
- **Provider adapters:** call only allowlisted providers with server-side credentials; normalize provider job IDs, status, cost and sanitized errors.
- **Editing service:** deterministic project/timeline operations. Do not expose arbitrary local filesystem access from the hosted web app.
- **Render workers:** isolated per job, non-root, bounded CPU/memory/disk/time, fixed binaries and argument arrays (no shell concatenation), private temporary directories, cancellation and cleanup.
- **Storage:** private buckets by default; short-lived signed URLs; explicit retention and deletion; never trust client-supplied object paths.
- **Observability:** record job ID, user/tier, skill/provider versions, input/output metadata, latency, finish reason, estimated and actual costs, and sanitized failure category.

## 3. Upstream capability mapping

The upstream repo exposes 50 MCP tools across seven groups:

| Upstream group | Count | NasrinAI treatment |
|---|---:|---|
| Project lifecycle | 7 | Adapt project lifecycle to an owned Supabase project record; do not expose desktop paths |
| Timeline/clips | 11 | Reuse concepts; implement server-side schema validation and overlap rules |
| Text/captions | 5 | Adapt after defining caption/font asset policy |
| Transitions/effects | 7 | Map to a supported renderer capability matrix; reject unsupported effects explicitly |
| Audio | 7 | Adapt with codec, duration, source and licensing validation |
| Export/render management | 5 | Replace task simulation/desktop handoff with real render jobs and artifact verification |
| Inspection | 8 | Adapt as read-only, ownership-scoped project queries |
| **Total** | **50** | Count is from upstream README/tool registry; revalidate when pinning a new revision |

Do not expose upstream MCP as a public internet endpoint by default. If retained internally, restrict it to a private worker boundary with authenticated calls, narrow permissions, request timeouts, schema validation and audit logs.

## 4. Data model (proposal; requires schema review before migration)

- `video_projects`: id, owner_id, title, normalized_project_json, schema_version, created_at, updated_at, optimistic_lock_version.
- `video_assets`: id, owner_id, project_id, storage_key, media_type, size_bytes, duration_ms, width, height, checksum, provenance, retention_expires_at.
- `video_jobs`: id, owner_id, project_id, job_type, status, idempotency_key, input_snapshot, output_asset_ids, provider, provider_job_id, estimated_cost, actual_cost, currency, usage_units, error_code, created_at, started_at, completed_at.
- `video_job_events`: id, job_id, event_type, safe_payload, created_at; no secrets or raw sensitive provider payloads.
- `video_usage_ledger`: immutable usage/cost entries linked to job and provider reconciliation identifiers.
- `video_skill_registry`: reviewed skill ID, pinned source revision, license/provenance evidence, enabled flag, capability metadata and review timestamp.

Required database controls: RLS on user-owned rows, server-only writes for privileged job/cost fields, foreign-key consistency, unique idempotency scope, immutable cost ledger, retention/deletion policy, and tests for cross-user access. No SQL is included or applied in this planning PR.

## 5. Rendering strategy

1. Define a normalized timeline schema independent of CapCut/OpenCut vendor formats.
2. Select an actively maintained renderer compatible with the target deployment; evaluate FFmpeg-based rendering first for deterministic media assembly.
3. Convert normalized project data into an allowlisted render graph/filter graph; never pass user text directly into a shell command.
4. Enforce duration, resolution, frame rate, input count, output bytes, worker time and concurrency caps before execution.
5. Render to a temporary private object; probe the result and validate expected streams, codec, dimensions, duration and non-zero size.
6. Publish the artifact only after QA passes; otherwise mark the job failed and clean up.
7. Return a render receipt with output key, checksum, bytes, duration, stream metadata, renderer version and validation results.

A job acknowledgement is not proof that an MP4 exists. Only a verified artifact may be marked successful.

## 6. Provider, plan and cost controls

- Use existing NasrinAI plan entitlements; do not invent or hard-code prices in the renderer.
- Preflight provider and render cost; reserve budget before fan-out; reconcile actual spend from provider receipts where available.
- Keep token budgets separate from provider credits, render compute, storage and egress.
- Add idempotency, bounded retries, concurrency limits, per-provider kill switches and a global media kill switch.
- Paid generation requires explicit confirmation when the configured threshold/policy requires it.
- If pricing is stale or a cost cannot be bounded, fail closed for paid operations.
- Video generation limits (including the existing Ultra plan duration policy) must be enforced server-side, not just in the UI.

## 7. Security and reliability requirements

- Re-audit all upstream code before any code reuse; pin commit and dependency lockfile.
- Confirm exact license and attribution obligations; the package declares MIT but no standalone LICENSE was present in the audited tree.
- Never run upstream installer scripts in production or during user job execution.
- Restrict source and destination paths; reject traversal, symlinks, unapproved URLs, and unexpected file types. For hosted jobs, use storage object IDs, not arbitrary filesystem paths.
- Validate project JSON both at API boundaries and immediately before mutations/rendering.
- Protect against prompt injection by treating media metadata, captions, filenames and embedded text as untrusted data.
- Prevent lost updates using project version checks/optimistic locking and per-project job serialization.
- Keep writes dry-run/preview until the user explicitly commits destructive edits; create recoverable snapshots.
- Redact secrets, credentials, personal data and raw media URLs from logs.
- Use private storage, least-privilege service roles, retention controls and deletion verification.

## 8. Required implementation phases

### Phase 0 — evidence and approval
- Complete source and dependency audit; verify upstream license.
- Confirm the exact upstream revision and intended subset.
- Choose renderer and validate production-host compatibility.
- Threat-model public API, workers, storage and provider credentials.

### Phase 1 — foundations
- Add editor-neutral project schema and validators.
- Add RLS-protected project/asset/job tables through a reviewed migration.
- Add API authorization, quota reservation, idempotency and job lifecycle.
- Add private storage and signed upload/download flows.

### Phase 2 — editing adapter
- Port/adapt only approved project/timeline/text/audio/effect logic.
- Keep desktop editor paths and MCP client configuration out of production code.
- Add optimistic locking, atomic writes/snapshots and overlap prevention.
- Add supported-operation reporting for effects and export settings.

### Phase 3 — real renderer
- Build isolated workers and bounded queue.
- Implement render planning, cancellation, retry policy and artifact validation.
- Produce real MP4 files and verifiable receipts.
- Add cleanup for temporary media and abandoned jobs.

### Phase 4 — provider orchestration
- Connect approved generation providers and media skills.
- Add prompt/asset provenance, provider status polling and cost reconciliation.
- Enforce plan, consent, quota and provider kill-switch policy.

### Phase 5 — Video Studio UX and release
- Mobile-first timeline, project autosave, render progress, cancel/retry and clear failure states.
- Display estimated charges/credits before paid work and final usage after reconciliation.
- Run staging soak tests and production canary; document rollback and alert thresholds.

## 9. Acceptance gates

Do not mark the feature complete until all gates pass:

- [ ] Every imported file is pinned, licensed, reviewed and listed in an import manifest.
- [ ] Dependency lockfile, SBOM, vulnerability scan and license inventory are generated.
- [ ] Unit, integration, RLS, API authorization and cross-user isolation tests pass.
- [ ] Path traversal, symlink, malformed media, oversized input, prompt injection and secret-leak tests pass.
- [ ] A multi-clip timeline with text, transitions and audio renders a real playable MP4 in the target environment.
- [ ] Output metadata and checksum are verified; failure never produces a false-success state.
- [ ] Cancellation terminates work and removes temporary assets.
- [ ] Duplicate requests do not create duplicate paid jobs.
- [ ] Actual provider costs and render usage reconcile to the owner dashboard.
- [ ] Plan quotas, privacy retention, deletion and provider kill switches are verified.
- [ ] Rollback is tested and no production deployment occurs before owner approval.

## 10. Scope of this PR

Documentation and source inventory only. No third-party source files copied into NasrinAI, no package/dependency changes, no SQL or Supabase changes, no environment variables/secrets, no provider calls, and no deployment. A separate implementation PR must follow after explicit approval.
