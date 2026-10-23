# Production audit and migration reconciliation — 2026-10-23

Scope: read-only review of the connected Supabase project, GitHub main, and the Vercel `nasrinai` production project. No new production SQL or environment-variable writes were made during this audit.

## Verified production state

- GitHub main at `44069788d0ad1d6b4cb140dbd9b3db575ae517d8` has a successful CI run: [run 39947344673](https://github.com/primusco20/nasrinAI/actions/runs/39947344673).
- Vercel reports the `nasrinai` production deployment for that commit as `READY`.
- Vercel's grouped runtime-error view reported no runtime errors in the 24-hour window ending 2026-10-23 11:50 UTC. Runtime logs do contain configuration warnings below, so this is not equivalent to a clean configuration audit.
- `owner.nasrinai.com` is present on the project and Vercel reports it verified. A request to `/owner` without an owner session returned the expected generic, no-store 404. The same route on `www.nasrinai.com` also returned 404. This confirms the tested unauthenticated/wrong-host paths fail closed; it does **not** prove that a valid owner can complete sign-in and open the console.
- Production environment-variable *names and targets* were inspected without retrieving decrypted values. The owner allowlist/session variables are present for production. Do not record their values in this report or logs.

## Migration-history discrepancy — do not replay blindly

The Supabase migration API currently records these relevant latest entries:

- `060_server_only_rls_deny_policies`
- `061_foreign_key_performance_indexes`

It does not list migration labels `057`, `058`, or `059`. However, live schema inspection confirms these objects exist:

- `owner_audit_events`, `owner_console_incidents`, and `owner_alert_outbox` tables;
- the owner-console aggregate, audit, and incident RPCs;
- the tables have RLS enabled, no SELECT grant for `anon` or `authenticated`, SELECT granted to `service_role`, and a deny-browser policy;
- owner-console RPCs inspected are `SECURITY DEFINER`, set `search_path=public, pg_temp`, deny EXECUTE to `anon` and `authenticated`, and grant EXECUTE to `service_role`.

This is a **history-versus-live-schema mismatch**, not proof that those migrations are absent. They may have been applied outside the currently tracked migration workflow or recorded under different labels. Compare the exact migration SQL and live function definitions/grants before deciding whether to baseline, repair, or apply anything. Do not insert synthetic history rows or re-run 057–059 merely to make the registry look complete.

## Production configuration warnings

The latest production initialization logs report that these plan-price settings are invalid under the current whole-PHP-peso validation and therefore the corresponding paid plans are not for sale until corrected:

- `PLAN_MAX_PRICE`
- `PLAN_ULTRA_PRICE`
- `PLAN_MAX_ANNUAL_PRICE`
- `PLAN_ULTRA_ANNUAL_PRICE`

The same logs report that the Tier 2 image route is disabled because its primary price is missing or invalid, and the fallback is configured without an active primary. No pricing values were read into this report or changed. An operator must confirm the intended subscription prices and image model price in USD before correcting them; do not invent prices.

## Performance-advisor interpretation

After migration 061, the performance advisor no longer reports the eight previously identified unindexed foreign-key columns. It still reports 32 unused-index informational findings. These are not automatic removal candidates: several may support infrequent cleanup, incident, security, or owner-console queries. Review query plans and workload history before dropping any index.

## Next safe actions

1. Export the intended Supabase migration registry and compare it with migrations 057–061 and live schema/function definitions.
2. Establish the approved Max/Ultra monthly and annual prices, then correct the four production price variables and verify the checkout UI remains disabled until valid configuration is deployed.
3. Establish the verified USD cost for the Tier 2 image route before correcting its price; test the primary/fallback path in preview before production.
4. Run an authorized owner-console sign-in smoke test from the allowlisted email and IP. Confirm the owner page, session expiry, sign-out, audit write, and wrong-host 404 without weakening host/IP/email checks.
5. Keep production migrations 057–059 untouched until reconciliation is reviewed. No production schema changes beyond the previously approved 060/061 work were made as part of this audit.

## Phase 6 — Provider-authoritative billing (updated 2026-10-23)

- PR #557 merged as `95ac977e78d71210826c2cda196ec2977863c728` after the reconciled billing branch passed CI unit tests, JavaScript syntax checks, secret scanning, dependency audit, database regression tests, and the documentation gate. Vercel reported success for the merge commit.
- Production model routing no longer depends on local per-model USD prices. Provider-reported costs are recorded only when available; unknown cost remains unknown. Subscription prices, token/abuse limits, plan quotas, and media restrictions remain separate.
- **Migration 062 is not applied in production yet.** Production `usage_events` currently has no `cost_source` column, so the application has a compatibility fallback that preserves telemetry but omits provenance until migration 062 is applied. Existing historical cost values must not be relabeled as provider-reported.
- The production table currently has 3,838 usage events, of which 3,582 have non-null legacy `cost_usd` values. These values were not changed or reclassified.
- Remaining operator actions: approve/apply migration 062 after reviewing the production DDL; confirm the intended Max/Ultra monthly and annual subscription prices for `PLAN_MAX_PRICE`, `PLAN_ULTRA_PRICE`, `PLAN_MAX_ANNUAL_PRICE`, and `PLAN_ULTRA_ANNUAL_PRICE`; perform an authenticated Owner Console sign-in/session smoke test. No subscription prices were guessed or modified.
