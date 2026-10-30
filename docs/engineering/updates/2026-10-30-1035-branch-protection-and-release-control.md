# Audit delta — 2026-10-30 10:35 Asia/Manila
## Scope and evidence boundary
Read-only review of GitHub main refs, open PR metadata, exact-head Actions runs, repository rulesets endpoints, and current Vercel deployment metadata. No application code, Supabase state, secrets, branch settings, merges, or deployments were changed.

## Current main and production snapshot
- Repository: nasrinaiv0/nasrinAI.
- Main SHA: b39f4dcd62641d5f601e4e707cb46155ca8e135e (merge of PR #709).
- Production deployment: dpl_EYBvVZe2o1qdMrUuXvGoXcqD4qkG; READY, production target, source SHA b39f4dcd62641d5f601e4e707cb46155ca8e135e.
- No newer main commit or production deployment was returned during this checkpoint.
- Main commit combined status returned Vercel success; this is deployment status, not feature-level end-to-end proof.

## Newly verified release-control risk: main is not protected
- GitHub branch endpoint: https://api.github.com/repos/nasrinaiv0/nasrinAI/branches/main reports protected=false; required_status_checks.enforcement_level=off; contexts=[]; checks=[].
- Repository rulesets endpoint: https://api.github.com/repos/nasrinaiv0/nasrinAI/rulesets returned [].
- Interpretation: no classic branch protection or repository-level ruleset was visible through these endpoints. Any external organization/user-level policy outside the checked response was not separately verified.
- Impact: passing CI is not enforced as a merge prerequisite by the repository-level configuration visible here. This creates a release-governance risk even where individual PR checks pass.
- Recommended owner action: configure main protection/rules requiring PR review, current required CI and Documentation Gate checks, and denial of force-push/deletion. This audit did not change settings.

## PR #711 — audit documentation
- Head: 4c93465bf38600ad6cebe26465bf51fb5c5abec4; open/draft.
- Exact-head CI: https://github.com/nasrinaiv0/nasrinAI/actions/runs/40985781454 — completed success.
- Exact-head Documentation Gate: https://github.com/nasrinaiv0/nasrinAI/actions/runs/40985781356 — completed success.
- This resolves the previous checkpoint's pending-check uncertainty. No merge was performed.

## PR #702 — rich reply renderer
- Head: c9ddf310f48c0157b8267187c0da9e69735a3d09; open, non-draft, mergeable=false.
- Compare against current main: 1 commit ahead / 48 behind; diverged.
- Existing exact-head CI: https://github.com/nasrinaiv0/nasrinAI/actions/runs/40957687555 — success; Documentation Gate: https://github.com/nasrinaiv0/nasrinAI/actions/runs/40957687102 — success. These runs predate current main and do not validate a reconciled branch.
- Changed areas in recorded compare: docs/chat.md, docs/pr-change-log.md, public/app.css, public/app.js, public/format.js, public/index.html, src/ai/prompt.js, test/reply-rendering-rich.test.js.
- Next action: reconcile to current main, preserve DOM-node-only rendering/CSP behavior, rerun exact-head CI and Documentation Gate, then perform malicious/malformed renderer and visual regression tests. Do not merge the stale head.

## PR #703 — agent tools and sandboxed code execution
- Head: cda418b0b6b8ea0f00a68535c0631da5e1408ba1; open, non-draft, mergeable=false.
- Compare against current main: 2 commits ahead / 44 behind; diverged.
- Existing exact-head CI: https://github.com/nasrinaiv0/nasrinAI/actions/runs/40958614017 — success, but created before the latest main baseline; no reconciled-head CI is available.
- Diff areas include src/tools/agent.js, src/chat.js, src/github/api.js, src/github/index.js, src/auto-repair.js, src/config.js, src/routes.js, public/app.js, test/agent-tools.test.js, legal/privacy.md, docs/tools.md, and .env.example.
- PR description says run_code uses a fresh Vercel Sandbox, deny-all network, no secrets, 30-second timeout, signed-in-only access, and rate limits. These are implementation claims to re-verify against the exact reconciled diff; they are not independently re-tested in this checkpoint.
- PR description also reports one local-only FFmpeg test failure because the binary is unavailable. Treat that as a reported environment limitation, not a verified production defect.
- Next action: reconcile branch, inspect sandbox options/timeout/output caps/rate limits and auto-repair loop, rerun exact-head CI + Documentation Gate, and verify privacy notice against actual provider/data flows. Do not merge the stale head.

## Existing open issue #486 — persistent chat attachments
- Issue: https://github.com/nasrinaiv0/nasrinAI/issues/486.
- Created 2026-10-20T11:32:21Z; last updated 2026-10-20T12:07:50Z; remains open. No new implementation progress was detected in this checkpoint.
- Reported current behavior: attachment bytes are processed in memory and message history retains only file names, so attachments disappear or cannot be opened after send/refresh.
- Acceptance boundary: use the approved private Supabase Storage path; stable attachment IDs/object references; owner/tenant authorization and private buckets; server-side MIME/signature/size validation; short-lived URL re-resolution; retention/delete cleanup; no arbitrary uploaded HTML execution; tests for persistence, cross-user denial, upload/send failure, expiry, multiple files, and mobile Safari.
- This is an existing functionality gap, not a new regression introduced by this audit.

## Actions
1. Owner to enable required main-branch review/check protection; this audit intentionally made no settings changes.
2. Reconcile PRs #702 and #703 onto current main and rerun all required checks on the final SHAs.
3. Continue attachment issue #486 as a separate runtime implementation task; inspect existing direct-upload infrastructure before adding buckets/migrations.
4. Keep production and PR evidence separate: READY deployment or green CI does not prove the associated feature works end to end.
