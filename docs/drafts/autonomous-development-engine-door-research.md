# Draft: NasrinAI Autonomous Development Engine — Lessons from The Door

**Status:** Proposal only. Not an implementation claim.  
**Target repository:** `nasrinaiv0/nasrinAI`  
**Reference project:** [Zujiin01/mobile-server-connection](https://github.com/Zujiin01/mobile-server-connection)  
**License note:** The reference project uses PolyForm Noncommercial 1.0.0. This draft records high-level architectural lessons only; it does not copy source code, and commercial use of that project's code requires written permission.

## 1. Executive summary

The Door demonstrates a useful pattern: expose a small, authenticated HTTPS tool API so an AI agent can inspect and change files and run approved commands on a remote machine. Its strongest lessons are explicit capability scopes, a confined work root, auditable actions, deliberate handling of risky commands, and a workflow that requires real validation before reporting success.

NasrinAI should implement an **independent, repository-aware development workflow** that reuses these ideas while preserving NasrinAI's existing architecture. It must not create a second, competing shell service if the existing isolated GitHub coding runner can be safely extended.

**Desired outcome:** The user describes a development problem; NasrinAI investigates authorized repository evidence, proposes a bounded change, applies it in an isolated job, runs the required checks, and prepares a reviewable pull request. Production merge and deployment remain separate guarded actions.

## 2. What we learned from The Door

These are design patterns, not source-code reuse:

1. **Small explicit tools:** separate operations for reading a file, listing directories, globbing, searching, writing, editing, and executing commands.
2. **Least-privilege scopes:** reading, writing, execution, and administration are independent permissions. A key should receive only the scopes it needs.
3. **Workspace confinement:** file APIs enforce a configured work root and reject paths that escape it, including unsafe symbolic-link targets.
4. **Risk-aware execution:** high-impact commands require a structured plan stating the objective, command, risk, and rollback.
5. **Auditable actions:** record actions and denials with actor/job, operation, timestamp, result, and correlation ID. Do not log credentials, source secrets, or unnecessary file contents.
6. **Revocable credentials:** use distinct credentials per integration/agent and support revocation. Store credential hashes where applicable; keep raw secrets out of chat and logs.
7. **Resource limits:** enforce request rate, command timeout, output size, job duration, disk/file bounds, and concurrency limits.
8. **Evidence-based reporting:** report a command or test as completed only when a real runner returned its status and output.
9. **Phone-friendly operation:** an owner should be able to request work from a mobile interface without having to manually operate a shell.
10. **Treat repository content as untrusted data:** source files, README instructions, issues, webpages, and test output must never override system policy or authorize secret disclosure.

## 3. Fit with NasrinAI today

NasrinAI already has relevant architecture and documentation:

- `docs/nasrinai-autonomous-coding-engine-upgrade.md` defines repository detection, investigation, bounded implementation, testing, review, and reporting.
- `docs/architecture/secure-workspace.md` documents the coding and file-analysis security boundaries and an existing separately isolated disposable Vercel Sandbox runner for GitHub coding tasks.
- `src/github/runner.js` is documented as the isolated runner entry point. The API process must not execute repository code.
- The repository requires relevant Markdown documentation and a PR change-log entry for every PR.

Therefore, the preferred direction is to **audit and extend the existing GitHub runner and GitHub integration**, not to deploy The Door as a parallel service or introduce shell execution inside the NasrinAI API.

Before implementation, inspect the current code and tests to verify the live state. Documentation alone is not proof that a feature is fully enabled in production.

## 4. Proposed architecture

### A. Request and authorization layer

- Authenticate the signed-in owner/user and authorize repository, tenant, branch, and operation separately.
- Resolve the canonical repository identity, selected branch/ref, commit SHA, and granted permissions before starting work.
- Require an explicit allowlist of repositories and permitted base branches.
- Apply per-user/per-tenant quotas and idempotency keys to prevent duplicate jobs.
- Never send GitHub, Vercel, Supabase, or model-provider credentials to the model or to the repository workspace.

### B. Development job orchestrator

Track a durable job state machine:

`queued → authorized → inspecting → planned → executing → verifying → review_ready → completed`

Other terminal states include `blocked`, `cancelled`, `failed`, and `needs_owner_approval`.

Every transition records a reason and timestamp. Retries must be bounded and idempotent. A failed or timed-out job must not be reported as successful.

### C. Isolated execution environment

Use the existing disposable Vercel Sandbox runner where suitable, after confirming its current protections and integration tests. Each job should have:

- A disposable, non-root environment and a dedicated workspace.
- No production secrets, host filesystem, Docker socket, cloud metadata access, or cross-user workspace access.
- Outbound network disabled by default; any future dependency access must be explicitly bounded and controlled.
- Limits for CPU, memory, processes, disk, file size/count, patch size, stdout/stderr, wall-clock duration, and concurrency.
- Forced termination and cleanup after completion, cancellation, or timeout.
- Strict validation of archive paths and file types before extraction; reject traversal, symlinks/hardlinks, and special files unless a separately reviewed design proves they are safe.
- No execution of model-generated commands in the main API process.

### D. Capability tool interface

Expose typed, server-validated operations rather than an unrestricted generic shell wherever possible:

- `repository.inspect`: metadata, branch, commit, tree and permissions.
- `workspace.list`, `workspace.read`, `workspace.search`: read-only inspection.
- `workspace.patch`: apply a bounded patch with expected base SHA and conflict detection.
- `job.command`: run only inside the isolated runner, subject to policy, timeout and output limits.
- `job.cancel`: cancel a running job and clean up its environment.
- `job.status`, `job.logs`: retrieve bounded, redacted status and evidence.
- `github.create_branch`, `github.open_draft_pr`: use authorized GitHub APIs after checks.
- `deployment.inspect`: read Vercel status where integration permits.
- `database.diagnostics`: use approved, read-only Supabase diagnostics only; do not expose service-role credentials or allow arbitrary production SQL.

Every operation must validate authorization server-side. A model request is not itself authorization.

### E. Policy gate for risky actions

Require a structured action plan for sensitive operations. At minimum it includes:

- Objective and reason.
- Exact target repository, branch, resource, and operation.
- Expected impact and risk level.
- Precondition checks and backup/recovery strategy where relevant.
- Validation plan and rollback procedure.

Require explicit owner approval for production changes, deployment, PR merge, destructive data operations, credential/permission changes, force-pushes, and any action whose scope cannot be bounded. Never use a prompt-provided plan as a substitute for server-side authorization.

### F. Audit and observability

Record append-only job events including:

- Actor/tenant and authorization decision.
- Job and correlation IDs.
- Repository/ref/commit and operation type.
- Tool name, start/end time, duration, exit status, and bounded redacted result summary.
- Policy decision, approval reference, test results, PR URL, and deployment identifier when applicable.

Do not record raw keys, access tokens, full secret-bearing environment values, or entire source files. Define retention and access controls; protect logs against modification and unauthorized reads. Alert on repeated authorization failures, unusual command patterns, limit exhaustion, and repeated failed jobs.

### G. GitHub, CI, and Vercel lifecycle

1. Inspect the repository and the current commit.
2. Reproduce the issue or document why reproduction is unavailable.
3. Create a concise plan and acceptance criteria.
4. Create/use a dedicated feature branch; never edit `main` directly.
5. Make the smallest coherent patch and add regression tests.
6. Run focused tests, the full required test suite, lint/type/build/security checks that the project actually supports.
7. Review the diff for unrelated changes, secrets, unsafe dependencies, and incomplete documentation.
8. Create a **draft PR** with the evidence, test results, known gaps, and rollback notes.
9. Wait for required CI checks and human review.
10. Merge or deploy only under the repository's existing protection and explicit authorization rules.
11. Verify the resulting deployment with real status/smoke evidence; rollback when the guarded release procedure requires it.

A passing local test is not proof that production works. A skipped integration test is not a pass.

## 5. Security requirements

- Default deny; least privilege; fail closed when authorization, policy, or the runner is unavailable.
- Separate read, write, execute, GitHub-write, deployment, and administrative permissions.
- Never place secrets in prompts, generated files, diffs, logs, command output, or user-facing reports.
- Treat all repository content and tool output as untrusted input, including instructions embedded in source files, issues, webpages, and test logs.
- Validate repository, branch, path, patch size, file type, command policy, and resource limits on the server.
- Use per-job isolation and cleanup; do not share mutable workspaces between users or jobs.
- Protect against replay, duplicate jobs, race conditions, stale base commits, path traversal, output injection, and permission escalation.
- Keep production databases read-only for diagnostics unless a separate approved workflow explicitly authorizes a change.
- Require review and approval before merging/deploying; never silently force-push or modify production.
- Maintain an incident response and credential-revocation procedure.

## 6. Required automated tests

### Authorization and isolation
- A user cannot inspect or modify an unauthorized repository or another tenant's job.
- Read-only credentials cannot write, execute, create branches, or open PRs.
- Expired/revoked credentials are rejected.
- Path traversal and out-of-root symlink cases are rejected.
- A job cannot read another job's workspace or inherited environment secrets.
- The API process cannot execute repository code directly.

### Runner controls
- Timeouts, cancellation, output caps, file/patch limits, and concurrency limits are enforced.
- Malformed archives and unsupported file types fail safely.
- Network access is disabled by default in the job.
- Failed jobs clean up their workspace and processes.
- Risky operations are blocked pending approval.
- Audit events exist for both allowed and refused actions without leaking secrets.

### Workflow and evidence
- A stale base SHA or conflicting patch is detected instead of silently overwritten.
- A failed test prevents the job from reaching `review_ready`.
- Skipped checks are shown as skipped, not passed.
- Draft PR creation uses the intended branch and includes verification evidence.
- Production merge/deployment requires the configured authorization.
- Repeated requests are idempotent or safely deduplicated.
- Every final status is derived from real tool/runner results.

## 7. Implementation phases

**Phase 0 — Read-only audit**
- Map current runner, GitHub tools, authorization, logs, CI checks, and existing tests.
- Identify what already exists versus what is missing.
- Do not modify production behavior during the audit.

**Phase 1 — Contracts and policy**
- Define typed tool schemas, capability scopes, job state machine, approval policy, audit schema, and resource limits.
- Add unit tests for policy decisions before enabling new powers.

**Phase 2 — Harden the existing runner**
- Verify isolation, no-secret inheritance, network restrictions, bounded output, cancellation, cleanup, and fail-closed behavior.
- Add adversarial tests and explicit live integration verification.

**Phase 3 — Verified code-change workflow**
- Implement or tighten inspect → plan → patch → test → diff review.
- Require regression tests and evidence for every completion claim.
- Keep all work on feature branches.

**Phase 4 — Draft PR automation**
- Create draft PRs with summary, scope, test evidence, risks, and rollback notes.
- Require all mandatory CI checks before readiness/merge.

**Phase 5 — Observability and owner controls**
- Add job history, cancellation, audit search, quota/limit visibility, alerts, and credential revocation.
- Keep owner-only operations server-authorized, not merely hidden in the UI.

**Phase 6 — Controlled release automation**
- Only after the earlier phases pass review, integrate guarded Vercel status/deployment actions and post-deployment smoke checks.
- Preserve explicit approval for production changes and a tested rollback path.

## 8. Acceptance criteria / definition of done

The feature is not done until:

- Repository and tenant authorization is enforced by the server.
- The existing isolated runner is verified against the security requirements above.
- No repository code executes inside the NasrinAI API process.
- Every job has a traceable state, audit events, cancellation path, bounded resources, and cleanup.
- A failed or skipped required check cannot be reported as passing.
- Changes are created on a non-production branch and the draft PR contains test evidence.
- Destructive, merge, and deployment actions require the configured authorization.
- Regression, authorization, isolation, policy, and workflow tests pass.
- Documentation and `docs/pr-change-log.md` are updated with the observed validation results.
- Live integration results are clearly distinguished from mocked/unit-test results.

## 9. License and implementation boundary

The reference repository's README identifies its license as **PolyForm Noncommercial 1.0.0** and says commercial use requires written permission. NasrinAI is intended to be a commercial product; therefore:

- Do not copy, vendor, fork into the product, or adapt the reference project's source code for commercial NasrinAI use without written permission from the rights holder.
- This document captures high-level concepts and proposes an independently designed implementation using NasrinAI's existing runner, GitHub APIs, policy layer, and tests.
- If the team later wants to reuse any reference code, stop and obtain legal/licensing approval first.

## 10. Reference and related NasrinAI documents

- Reference README: https://github.com/Zujiin01/mobile-server-connection
- Reference security notes: https://github.com/Zujiin01/mobile-server-connection/blob/main/SECURITY.md
- Existing NasrinAI coding-engine plan: `docs/nasrinai-autonomous-coding-engine-upgrade.md`
- Existing secure workspace boundaries: `docs/architecture/secure-workspace.md`
- Repository contribution/change-log requirement: `docs/pr-change-log.md`

**Draft status:** Documentation proposal only. No runtime code, environment variables, production database, Vercel configuration, merge, or deployment is changed by this document.
