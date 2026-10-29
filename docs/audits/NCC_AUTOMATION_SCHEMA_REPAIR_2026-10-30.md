# OCC production repair — automation schema missing (2026-10-30)

## Status
- **Production schema repair:** Implemented.
- **Migration 085 source committed to repository:** Pending PR review/merge.
- **Dashboard SQL verification:** Passed after migration.
- **UI/browser smoke test:** Not verified.
- **Automation runtime execution:** Not verified and intentionally not exercised by this schema repair.

## Scope
Repository: `nasrinaiv0/nasrinAI` only. Supabase project ref: `wquuqyjbznijpmiwerdv`. This repair is for the NasrinAI Owner Command Center (OCC); it does not touch any other product repository.

## User-visible symptom
The OCC Recent Activity card showed “Activity unavailable — Needs migration 080.”

## Root cause (verified)
The production function `public.owner_console_dashboard(integer)` existed, but calling it raised PostgreSQL error `42P01: relation "public.automation_runs" does not exist`. The function's query references `public.automation_runs` in its daily automation series, automation summary, and recent activity union. The migration registry also lacked the expected 080–082 entries; that registry mismatch was not itself sufficient proof that migration 080 needed to be replayed.

The canonical repository migration `030_ai_automation.sql` defines `public.automation_workflows` and `public.automation_runs`; migration 032 sets the server-only boundary and migration 033 adds workflow/run tenant-owner identity consistency. The production catalog had neither automation table, and only an unrelated `public.occ_automations` table existed. Replaying migration 080 was not appropriate because its function already existed and its historical SECURITY DEFINER search_path needed separate hardening (migration 084 already changed that).

## Production action
Applied Supabase migration `085_restore_owner_console_automation_schema` to production at 2026-10-30. Migration runner returned success and recorded registry version `20261029230728`.

Migration creates the two canonical automation tables only if absent, restores the canonical owner indexes, checks the tenant prerequisite, restores the composite workflow identity key and composite run→workflow foreign key, refuses to proceed if existing runs disagree with their workflow tenant/owner, enables RLS, revokes browser-role grants, creates explicit deny policies for `anon` and `authenticated`, and grants table CRUD to `service_role`. It does not insert automation workflows/runs or enable any workflow.

## Verification evidence
After applying migration:
- `to_regclass('public.automation_workflows')` and `to_regclass('public.automation_runs')` both resolve.
- Both tables contain zero rows; no workflow/run data was synthesized.
- `public.owner_console_dashboard(7)` executes successfully and returns JSON.
- Dashboard payload includes `recent_activity_count = 12` and `series_days = 7` in the verification query.
- Both tables have RLS enabled, `server_only_deny_browser` policy present, and `anon` / `authenticated` lack SELECT privileges.
- Migration registry now includes `085_restore_owner_console_automation_schema`.

## Remaining caveats
- The zero automation rows mean the dashboard will show no automation run history until real automation activity exists; this is an honest empty state.
- The database query proves the backend dashboard function now returns data. It does **not** prove the hosted OCC page refreshed, that its API authorization path works, or that every dashboard card is functional. A browser/production smoke test is still required.
- The separate 080–082 registry/history parity issue remains unresolved. Do not fabricate registry records or blindly replay old migrations. Compare source migration definitions to live catalog before reconciling that history.
- Existing `public.occ_automations` is a separate table and was not renamed or modified.
- No application test suite or deployment was run as part of this database repair.

## Security and privacy
Automation tables remain server-only. Browser roles have no table privileges, RLS is enabled, and explicit false policies deny browser-role row access. Workflow definitions and run payloads are not returned in dashboard activity; the dashboard exposes only bounded counts/status labels and timestamps through the existing function. The migration does not grant access to owner-console functions or change auth policy.

## Rollback
Do **not** drop the automation tables as a routine rollback: they are canonical product tables and may gain real workflow data. If the dashboard function change is later reverted, keep the tables and server-only protections. Any destructive rollback requires a fresh catalog/data check and explicit owner approval.

## Next steps
1. Merge the source migration and this evidence into `main` after required repository gates pass.
2. Perform an authenticated owner-console browser smoke test on the deployed version and confirm Recent Activity no longer displays the migration warning.
3. Separately reconcile migration registry entries 080–082 using verified source/live definitions.
