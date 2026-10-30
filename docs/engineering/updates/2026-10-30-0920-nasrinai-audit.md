# NasrinAI Audit Delta — 2026-10-30 09:20 Asia/Manila (01:20 UTC)

- Repository: https://github.com/nasrinaiv0/nasrinAI
- Scope: NasrinAI repository and its own production deployment only.
- Current main: `b39f4dcd62641d5f601e4e707cb46155ca8e135e`, merge of PR #709.
- Current production: [Vercel deployment dpl_EYBvVZe2o1qdMrUuXvGoXcqD4qkG](https://vercel.com/nasrin-ai/nasrinai/EYBvVZe2o1qdMrUuXvGoXcqD4qkG) is READY at the same SHA. Deployment readiness is not authenticated feature QA.
- No production writes, migrations, merges, application-code changes, or deployments were performed by this audit.

## PR #709 — OCC automation labels

- PR: https://github.com/nasrinaiv0/nasrinAI/pull/709
- PR head: `2eaf616f904930c2e55c31ae072db88dbce1c65a`; merge/main commit: `b39f4dcd62641d5f601e4e707cb46155ca8e135e`.
- Changed paths: `docs/CLAUDE_MASTER_PLAN_SUMMARY.md`, `docs/pr-change-log.md`, `public/owner-console.js`, `src/owner-console.js` (4 files; 17 additions, 3 deletions).
- Before: OCC navigation and mini-report used the ambiguous label `Automation (NCC)`.
- After: navigation label is `Automation & Jobs`; mini-report label is `Automation`. Routes, APIs, NCC links, and automation behavior are intended to remain unchanged.
- Rationale: distinguish Owner Command Center automation from the separate Nasrin Client Connect product.
- CI: [#40972509344](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40972509344) passed; [Documentation Gate #40972509431](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40972509431) passed on the PR head.
- Production: deployment is READY at `b39f4dcd62641d5f601e4e707cb46155ca8e135e`. Live label rendering and authenticated OCC browser/API behavior were not independently smoke-tested in this audit.
- Security/privacy: no authorization, credential, data-access, or schema behavior changed in PR #709.
- Rollback: revert only the presentation-label change if needed; do not rename NCC routes or APIs.

## Carry-forward: PR #708 / migration 085

- PR: https://github.com/nasrinaiv0/nasrinAI/pull/708; merge commit `5521bd0a4a019693d99ffd4e7a75e26a53c88ea4`.
- Migration: `db/migrations/085_restore_owner_console_automation_schema.sql`.
- Prior SQL evidence: `owner_console_dashboard(7)` returned a seven-day series and twelve recent-activity entries; both automation tables had RLS enabled and no browser-role SELECT grants; both tables were empty.
- These SQL results were not re-run in this 09:20 audit. Hosted OCC browser/API behavior remains unverified.

## Documentation PR inventory

- PR #710: https://github.com/nasrinaiv0/nasrinAI/pull/710 — open/draft, head `a48c67312c5c7a5734f90d0e71c51694152160fb`; 5 commits ahead / 5 behind current main; mergeable=false. CI #40972637453 and Documentation Gate #40972812295 passed on that head, but the branch is stale.
- PR #705: https://github.com/nasrinaiv0/nasrinAI/pull/705 — open/draft, head `a20902355ba39ecefc314520daa637e00309b048`; 22 ahead / 16 behind current main; mergeable=false. No workflow run was returned for this exact head.
- This current-main-based documentation branch is the reconciliation candidate; do not merge either stale branch as-is.

## Carried-forward security/database findings — not rechecked

- Migration registry/source parity for 080–082 remains unresolved; do not fabricate registry rows or blindly replay migrations.
- Supabase Auth leaked-password protection was previously reported disabled; not re-queried or changed in this run.
- A prior catalog review identified SECURITY DEFINER functions with `search_path=public, pg_temp` for targeted source review. This is an audit lead, not a confirmed vulnerability; not rechecked here.
- Integration/OAuth flows, semantic retrieval, owner-memory opt-in, and authenticated OCC browser/API behavior remain separate functional release gates.

## Next actions

1. Perform an authenticated production OCC browser/API smoke test and capture the actual rendered labels and Recent Activity response.
2. Reconcile migration registry entries 080–082 against exact source and live definitions before any writes.
3. Recheck leaked-password protection through Supabase Auth settings without exposing secrets.
4. Inspect flagged SECURITY DEFINER function bodies for unqualified references/dynamic SQL before changing search paths.
5. Reconcile stale documentation PRs and require both CI and Documentation Gate on the final exact head.

## Evidence

- Main commit: https://github.com/nasrinaiv0/nasrinAI/commit/b39f4dcd62641d5f601e4e707cb46155ca8e135e
- PR #709: https://github.com/nasrinaiv0/nasrinAI/pull/709
- CI: https://github.com/nasrinaiv0/nasrinAI/actions/runs/40972509344
- Documentation Gate: https://github.com/nasrinaiv0/nasrinAI/actions/runs/40972509431
- Production deployment: https://vercel.com/nasrin-ai/nasrinai/EYBvVZe2o1qdMrUuXvGoXcqD4qkG
