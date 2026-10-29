# NasrinAI Audit Delta — Production schema reconciliation and OCC automation recovery

**Audit timestamp:** 2026-10-30 07:11 Asia/Manila (2026-10-29 23:11 UTC)  
**Repository:** https://github.com/nasrinaiv0/nasrinAI  
**Scope:** NasrinAI repository, its Vercel production deployment, and its Supabase project only. MOVO client status is maintained in the separate MOVO ledger.  
**Method:** Read-only GitHub/Vercel/Supabase inspection plus documentation-only updates. No database writes, migrations, code changes, merges, or deployments were initiated in this audit.

## Executive status

- **Production main:** `52392234ce7583303d4d25880296c06d7ad529b1`, merge of PR #707.
- **Production Vercel:** deployment `dpl_9Ta9xUconH4kxQMipobLbDaUNMJF` reports READY at that exact SHA. READY is a deployment/build state, not proof of every user flow.
- **PR #707:** merged. Its exact head was `6c77a65666da6b187b41697074581488593cfa33`; merge commit is `52392234...`.
- **PR #708:** open, non-draft, reported mergeable. Current head `6bf461687c440210d3d3d5f598ff23e7917e00f3`. CI run [40971199851](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40971199851) passed; Documentation Gate [40971199886](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40971199886) passed. This PR's migration source is not yet merged.
- **Critical state split:** migration 085 was applied directly to production before its source PR was merged. The database is verified repaired, but migration source/history still needs to be merged and reconciled through normal review. No preview deployment was returned for the PR #708 branch.
- **Owner Command Center (OCC):** backend dashboard SQL now executes and returns a seven-day series plus 12 recent-activity entries. The automation tables contain zero rows, so there is no automation run history yet. Hosted browser/API smoke test remains unverified.
- **Auth security:** current Supabase Security Advisor still reports leaked-password protection disabled.
- **Migration registry:** versions for 068, 079, 083, 084, and 085 are present. Versions 080–082 remain absent from the registry; source/live parity is not established for those entries.

## Change record A — PR #707: production schema/security reconciliation

- **PR:** [#707](https://github.com/nasrinaiv0/nasrinAI/pull/707)
- **Status:** merged.
- **PR head:** `6c77a65666da6b187b41697074581488593cfa33`
- **Merge commit:** [`52392234ce7583303d4d25880296c06d7ad529b1`](https://github.com/nasrinaiv0/nasrinAI/commit/52392234ce7583303d4d25880296c06d7ad529b1)
- **Changed paths (5):**
  - `db/migrations/083_explicit_deny_server_only_tables.sql`
  - `db/migrations/084_harden_owner_dashboard_search_path.sql`
  - `docs/CLAUDE_MASTER_PLAN_SUMMARY.md`
  - `docs/audits/PRODUCTION_SCHEMA_REPAIR_PROGRESS_2026-10-30.md`
  - `docs/pr-change-log.md`
- **Behavior/security change:** migration 083 records explicit deny policies for `anon` and `authenticated` on server-only `knowledge_learning_runs`, `openrouter_generations`, and `public_technical_chunks`, while revoking browser-role table privileges and preserving service-role access. Migration 084 sets `public.owner_console_dashboard(integer)` to `search_path=pg_catalog, pg_temp` to reduce object-shadowing risk for this SECURITY DEFINER function.
- **Pre-existing production repairs recorded by the PR:** migrations 068 (`integration_connections` and `integration_oauth_states`) and 079 (tenant hybrid-knowledge schema/search) were applied directly to production before PR #707 merged. Their application-level OAuth and semantic retrieval behavior was not proven by the schema changes.
- **Checks:** PR-head CI run [40969812290](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40969812290) passed; Documentation Gate run [40970398301](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40970398301) passed. Other successful documentation runs are recorded in GitHub, but the listed runs are the primary exact-head references for this record.
- **Deployment:** Vercel production deployment [`dpl_9Ta9xUconH4kxQMipobLbDaUNMJF`](https://vercel.com/nasrin-ai/nasrinai/9Ta9xUconH4kxQMipobLbDaUNMJF) reports READY at merge commit `52392234...`.
- **Unverified:** OAuth connect/disconnect lifecycle, hybrid retrieval relevance and tenant isolation under live requests, OCC browser rendering, and complete end-to-end owner-console authorization.

## Change record B — PR #708: restore missing OCC automation schema

- **PR:** [#708](https://github.com/nasrinaiv0/nasrinAI/pull/708)
- **Current head:** `6bf461687c440210d3d3d5f598ff23e7917e00f3`
- **Status:** open, non-draft, mergeable according to current PR metadata; no preview deployment was returned for branch `fix/ncc-automation-schema-085-2026-10-30`.
- **Changed paths (4):**
  - `db/migrations/085_restore_owner_console_automation_schema.sql`
  - `docs/CLAUDE_MASTER_PLAN_SUMMARY.md`
  - `docs/audits/OCC_AUTOMATION_SCHEMA_REPAIR_2026-10-30.md`
  - `docs/pr-change-log.md`
- **Migration behavior:** checks that `public.tenants` exists; creates canonical `automation_workflows` and `automation_runs` tables if absent; applies owner indexes and bounded JSON/step/action constraints; checks existing workflow/run tenant-owner consistency before adding a composite identity foreign key; enables RLS; revokes browser-role table privileges; adds explicit false policies for `anon` and `authenticated`; grants CRUD to `service_role`. The migration does not create workflow/run rows or enable any workflow.
- **Production action (reported by PR, independently corroborated by read-only database checks):** migration `085_restore_owner_console_automation_schema` was applied directly to Supabase production and appears in the migration registry at version `20261029230728`. This audit did not execute the migration.
- **Exact-head CI:** [run 40971199851](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40971199851) passed; [Documentation Gate run 40971199886](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40971199886) passed.
- **Why it was needed:** production `owner_console_dashboard(integer)` referenced missing `automation_workflows` / `automation_runs` relations, causing the Recent Activity card to report a missing migration.
- **Live read-only verification performed in this audit:**
  - `to_regclass` resolves both automation tables, plus `integration_connections`, `integration_oauth_states`, and `knowledge_chunks`.
  - Both automation tables contain **0 rows**.
  - RLS is enabled on both automation tables; each has one policy; `anon` and `authenticated` lack SELECT privilege; `service_role` has SELECT privilege.
  - `owner_console_dashboard(7)` executed successfully and returned **7 series days** and **12 recent-activity entries**. The automation summary reports 0 workflows, 0 enabled workflows, and an empty recent-run list.
  - `owner_console_dashboard(integer)` is SECURITY DEFINER and its current `proconfig` is `search_path=pg_catalog, pg_temp`.
  - Current migration registry includes 068, 079, 083, 084, and 085; 080–082 are still absent.
- **Verification boundary:** backend SQL success does not prove the hosted OCC UI/API has recovered. No browser smoke test was run. No synthetic automation rows were inserted.
- **Release risk:** the live database has migration 085 while main does not yet contain the migration source through a merged PR. Keep the source change under review and reconcile the registry/source history; do not rerun old migrations blindly or fabricate history entries.

## Read-only security recheck

- Supabase Security Advisor returned one current security warning: **Leaked Password Protection Disabled**. Remediation guidance: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Catalog checks show RLS enabled on `automation_workflows`, `automation_runs`, `integration_connections`, `integration_oauth_states`, `knowledge_learning_runs`, `openrouter_generations`, and `public_technical_chunks`; each has an explicit policy. The checked browser roles have no SELECT privilege on these server-only tables, while `service_role` does.
- A read-only catalog query found 16 SECURITY DEFINER functions with `search_path=public, pg_temp`, including OCC summary/action helpers and owner-alert functions. This is an **audit lead, not a confirmed exploit**: `anon`, `authenticated`, and `service_role` currently have no CREATE privilege on schema `public`. Next audit should inspect the function bodies for unqualified object references, dynamic SQL, and temp-object assumptions, then decide whether targeted hardening is warranted. Do not claim this is exploitable without that review.
- No database schema, policy, grant, migration, Auth setting, user data, or provider credential was changed by this audit.

## Cross-check and current blockers

1. Merge/reconcile PR #708 migration source after review; its CI and Documentation Gate pass, but it remains open.
2. Run an authenticated owner-only browser/API smoke test against the deployed OCC, confirming Recent Activity no longer shows the migration warning and that normal dashboard authorization still applies.
3. Keep automation execution disabled/unexercised during this schema verification; confirm no workflow was auto-enabled.
4. Reconcile migration registry/source parity for 080–082 using exact source and catalog evidence; do not blindly replay.
5. Enable Supabase Auth leaked-password protection in the dashboard, then recheck the advisor.
6. Audit the 16 SECURITY DEFINER functions with `search_path=public, pg_temp`; verify fully qualified relations/functions and dynamic SQL handling.
7. Re-run tests and gates for any new PR head. CI on an earlier SHA does not validate later commits.

## Audit/documentation branch status

The ledger branch `docs/change-ledger-refresh-2026-10-30-0614` was originally based on main `33f9283f35a0627c700efb43b3335bcfd8d52840`. Main has since advanced to `52392234ce7583303d4d25880296c06d7ad529b1`. This documentation branch is therefore stale relative to main and must be reconciled before merge; do not treat a passing documentation check as proof it is merge-ready.

## Change-control statement

This audit performed read-only GitHub, Vercel, and Supabase checks and documentation-only updates on the existing audit branch. No application code, production database state, auth settings, deployment, PR state, or user records were changed by the audit.
