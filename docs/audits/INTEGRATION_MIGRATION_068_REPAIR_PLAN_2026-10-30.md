# NasrinAI Integration Persistence — Migration 068 Repair Plan

**Audit date:** 2026-10-30 (Asia/Manila)  
**Repository:** https://github.com/nasrinaiv0/nasrinAI  
**Audited main SHA:** `33f9283f35a0627c700efb43b3335bcfd8d52840`  
**Database checks:** read-only; latest catalog/registry query at `2026-10-30 06:39:56 +08:00`  
**Scope:** NasrinAI integration persistence only. No unrelated product workstreams are audited here.

## Executive decision

**Status: BLOCKED — production schema prerequisite missing.**

The current main branch contains `db/migrations/068_user_owned_integrations.sql`, and `src/integrations/store.js` issues PostgREST requests to `public.integration_connections`. A read-only production catalog check returned NULL for both `public.integration_connections` and `public.integration_oauth_states`. The production migration registry also has no migration record corresponding to 068. The migration list does contain a later 069 entry, so this is migration-history/schema drift, not proof that the migration file itself is absent.

No migration was applied, no schema or data was changed, and no production write was performed. The repair is intentionally not marked complete.

## Evidence and exact paths

| Item | Evidence | Status |
|---|---|---|
| Migration definition | `db/migrations/068_user_owned_integrations.sql` exists at main; blob SHA `d405e25c611d539e901a2d1f133366aa6bee38e3`. | **Implemented in repository** |
| Runtime store | `src/integrations/store.js` queries `integration_connections` for list/get/save/disconnect and scopes requests by verified tenant and user. Blob SHA `d09e449c5892ea56d36d01a8f053d4957824c21b`. | **Implemented in repository; production prerequisite blocked** |
| Ownership boundary | `src/integrations/ownership.js` rejects non-user actors, requires tenant identity, verifies row ownership, and serializes only allowlisted public fields. Blob SHA `988449baf2c06bbb9adcb705a9d31234ed48be07`. | **Implemented in repository** |
| SQL regression test | `db/tests/068_user_owned_integrations.test.sql` tests browser-role privilege denial, encrypted credential format, uniqueness, and provider allowlisting. Blob SHA `94c88951fb5967006ca120355b2bdc58f2bccf53`. | **Test exists; not run during this audit** |
| Live catalog | Read-only `to_regclass` check returned NULL for both integration tables. | **Not implemented in production schema / Blocked** |
| Migration registry | Read-only `list_migrations` response has no 068 entry; later 069 is recorded. | **Blocked by history/schema drift** |
| End-to-end behavior | No integration connection was created or tested, and the missing tables prevent confirming the persistence path. | **Not verified** |

## Security properties in the repository migration

The migration definition creates:

- `public.integration_connections` with a unique key on tenant, user, provider, and provider-account ID.
- `public.integration_oauth_states` with hashed OAuth state and expiry/consumption metadata.
- Owner lookup indexes.
- Credential format checks requiring a `v1.` encrypted envelope, plus bounded sizes and explicit provider/status allowlists.
- RLS enabled on both tables, explicit revocation of browser-role privileges, and deny-all policies for `anon` and `authenticated`.

The runtime store requires verified server-side caller identity and includes both tenant and user filters. Its public list/get results are allowlisted and omit credential columns. These are code-level properties; they do not prove the production schema currently enforces them.

## Safe remediation sequence

This plan is intentionally **not** an instruction to run DDL against production.

### Gate 0 — freeze unsafe activation

1. Do not mark universal integration persistence as working.
2. Do not manually insert a migration-history row to make the registry appear consistent.
3. Do not blindly replay migrations 080/081 or any other migration; those have a separate object-present/history-missing discrepancy.
4. Do not expose integration tables to browser roles to work around server persistence failures.
5. Keep any feature flag or UI that would cause users to depend on this persistence path disabled, if such a flag exists. The relevant production flag was not inspected in this audit; **Not verified**.

### Gate 1 — non-production preflight

Before any schema change is approved, use an isolated NasrinAI development database/branch and confirm:

- The branch/database is not production and its project identity is recorded.
- Neither target table exists, or any existing partial objects are inventoried before applying anything.
- The migration file is reviewed against current `main`, not an old PR snapshot.
- The actual migration runner's supported naming/version behavior is checked; do not assume this repository's numbered filename maps automatically to the registry version.
- Existing roles, grants, RLS flags, policies, constraints, indexes, extensions, and dependencies are inspected read-only.
- The SQL regression test is run only against the isolated database and rolled back by its test transaction.

### Gate 2 — reviewed migration packaging

Prefer the repository's standard Supabase migration workflow and an explicitly versioned, reviewed migration artifact. Because production already records later migrations and has historical drift, do not silently edit historical migration history or assume that replaying the original file is safe. If a forward repair artifact is required, it must first be created, reviewed, and tested in the isolated branch. That artifact has **not** been created by this audit because migration execution/creation was explicitly out of scope for this pass.

The forward repair must be idempotent only where object parity is proven; it must fail visibly on incompatible partial schemas rather than silently accepting a wrong definition. It must not drop tables, overwrite credentials, broaden grants, or create permissive browser policies.

### Gate 3 — isolated verification

Run and record exact results for:

1. `db/tests/068_user_owned_integrations.test.sql` in the isolated database.
2. `db/tests/run.sh` (or the repository's documented database test command).
3. Targeted Node tests for integration ownership/store/routes.
4. A catalog assertion that both tables, expected columns, constraints, indexes, RLS flags, deny policies, and role privileges match the reviewed migration.
5. Negative tests proving `anon` and `authenticated` cannot select or write credential/OAuth-state rows.
6. Tenant/user isolation tests and a test that public API responses never include encrypted credentials.
7. A controlled integration connection save/list/disconnect test using non-sensitive test credentials in the isolated environment only.

A green SQL test alone is insufficient; confirm the test runner actually includes migration 068's SQL file.

### Gate 4 — separate production authorization

Only after the non-production evidence and migration review are complete should a separate production change request be raised. This audit did not authorize or perform that step. Production application must have a maintenance/rollback plan, pre-change catalog snapshot, owner approval, explicit migration version handling, post-change catalog/grant checks, and a tested server-side smoke test. No production rollback was performed or needed by this documentation-only work.

## Rollback considerations

- This audit made no runtime or database changes; rollback of this audit branch is simply reverting its documentation commits.
- For a future schema rollout, do not drop tables as a rollback if any real credentials or OAuth state could have been written. First disable the dependent feature, preserve encrypted credential rows and audit evidence, and use a reviewed forward-fix or restore plan.
- Do not roll application code back independently of the database without checking schema compatibility.
- Never log credential payloads, refresh credentials, OAuth state values, or raw provider tokens while diagnosing this incident.

## Validation performed in this audit

- Read-only production query at `2026-10-30 06:39:56 +08:00`: `integration_connections = NULL`, `integration_oauth_states = NULL`; migration registry relation exists.
- Read-only migration-list query: migration record 068 absent; migration 069 present.
- Repository file inspection: migration, store, ownership module, and SQL regression test exist.
- **No application tests run manually.**
- **No migration created or applied.**
- **No production settings, schema, data, grants, policies, credentials, or deployment changed.**

## Next action

Have a maintainer review the migration runner/version conventions and run the preflight on an isolated NasrinAI development database. Until the table/constraint/RLS/privilege assertions pass there, and a separate production change is approved, the universal integration persistence path remains **Blocked**.
