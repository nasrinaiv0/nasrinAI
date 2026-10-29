# NasrinAI Production Schema Repair Progress — 2026-10-30

## Scope and operating boundary

- Repository: https://github.com/nasrinaiv0/nasrinAI
- Supabase project ref: `wquuqyjbznijpmiwerdv`
- Organization: `primusco2` (Free plan)
- Scope: NasrinAI only. MOVO/MOVI repositories and product-specific changes are excluded.
- The user approved execution of the updated plan and approved a development branch at $0.01344/hour, then said a separate testing environment was not needed.
- Supabase rejected development-branch creation because branching requires Pro or higher. No separate test project was created.
- Consequently, the user explicitly requested direct execution, and three additive/restrictive schema migrations were applied to production. No destructive data changes were made by these migrations. No GitHub PR was merged and no Vercel deployment was initiated.

## Executive status matrix

| Work item | Status | Evidence / current state | Remaining work |
|---|---|---|---|
| Migration 068 — integration schema | **Implemented (schema only)** | Both tables exist, migration registry contains `20261029225506`, RLS + browser-deny policies confirmed | App/OAuth/credential flows and tenant ownership still need runtime verification |
| Migration 079 — tenant hybrid knowledge | **Implemented (schema only)** | Embedding columns, HNSW index, function and registry entry `20261029225531` confirmed | Verify query behavior, embeddings, audience filters and retrieval path |
| Migration 083 — server-only deny policies | **Implemented** | Registry entry `20261029225602`; three explicit deny policies; advisor warnings cleared | Recheck after any future grants/policy changes |
| Migration 080 — owner dashboard | **Not verified** | Function exists; registry entry absent; SECURITY DEFINER config includes `search_path=public, pg_temp` | Compare live definition to source; review/harden search_path before replay |
| Migration 081 — owner API keys | **Not verified** | Create/list/revoke functions exist; registry entry absent; functions are SECURITY DEFINER with empty search_path | Verify exact source parity, grants, audit events and live create/revoke path |
| Migration 082 — user message recall | **Not verified** | Function exists; earlier catalog check found FTS index; registry entry absent | Verify function definition/grants and confirm server only invokes it when signed-in user Memory is enabled |
| Leaked-password protection | **Blocked** | Security advisor still reports it disabled | Enable in Supabase Dashboard Auth password-security settings; connector has no supported setting-mutation tool |
| PR #702 — rich reply rendering | **Blocked** | Open, not merged, GitHub reports not mergeable against current base; old head needs reconciliation | Rebase/resolve conflicts and rerun CI/docs gate; verify CSP and rendering regressions |
| PR #703 — agent tools | **Blocked** | Open, not merged, GitHub reports not mergeable against current base; old head needs reconciliation | Reconcile branch, re-review sandbox/SSRF/rate limits, rerun checks |
| End-to-end production behavior | **Not verified** | Database catalog/migration/advisor checks only | Functional smoke tests and app CI are still needed; schema success is not product QA |

## Exact production changes made

### 1. `068_user_owned_integrations`

- Repository migration: `db/migrations/068_user_owned_integrations.sql`
- Repository file blob SHA: `d405e25c611d539e901a2d1f133366aa6bee38e3`
- Applied through the Supabase migration runner on 2026-10-30 (Manila time).
- Registry version returned by Supabase: `20261029225506`.
- Created:
  - `public.integration_connections`
  - `public.integration_oauth_states`
- Security properties confirmed after apply:
  - RLS enabled on both tables.
  - `server_only_deny_browser` policy for `anon` and `authenticated`, with `USING (false)` and `WITH CHECK (false)`.
  - `PUBLIC`, `anon`, and `authenticated` table privileges revoked.
  - `service_role` has required table privileges.
  - Unique owner/provider/account constraint and owner/expiry indexes are present as defined by migration.
- The migration stores encrypted credential columns but does not itself encrypt credentials; server code must continue to encrypt/decrypt with authenticated context and enforce user/tenant ownership.
- Status: **Implemented (schema only)**. Runtime persistence, OAuth state consumption/expiry, reconnect/disconnect, and owner isolation are **Not verified**.

### 2. `079_tenant_hybrid_knowledge`

- Repository migration: `db/migrations/079_tenant_hybrid_knowledge.sql`
- Repository file blob SHA: `8350a4e52c29521fd79154efd3d3c25882c0b6e9`
- Applied through the Supabase migration runner on 2026-10-30 (Manila time).
- Registry version returned by Supabase: `20261029225531`.
- Confirmed:
  - `knowledge_chunks.embedding vector(384)`
  - `knowledge_chunks.embedding_model text`
  - partial HNSW index `knowledge_chunks_embedding_hnsw`
  - `public.search_knowledge_hybrid(uuid,text,vector,text,text,integer)`
  - function is SECURITY DEFINER with `search_path=pg_catalog, public, extensions`
  - routine execute privilege observed for `postgres` and `service_role`; browser-role grants revoked.
- The function scopes chunks and documents to `p_tenant`, filters by `p_audience = any(d.who)`, combines semantic similarity with full-text rank, and bounds result count to 1–10.
- Nullable embedding columns mean existing chunks can remain unembedded; migration application does not perform embedding generation or prove semantic results.
- Status: **Implemented (schema only)**; retrieval integration and semantic quality are **Not verified**.

### 3. `083_explicit_deny_server_only_tables`

- Source file added to the repository branch in this change: `db/migrations/083_explicit_deny_server_only_tables.sql`.
- Applied through the Supabase migration runner on 2026-10-30 (Manila time).
- Registry version returned by Supabase: `20261029225602`.
- For each table below, migration revokes privileges from `PUBLIC`, `anon`, and `authenticated`, ensures RLS is enabled, and adds explicit false policy `server_only_deny_browser` for browser roles:
  - `public.knowledge_learning_runs`
  - `public.openrouter_generations`
  - `public.public_technical_chunks`
- The migration does not grant any new browser access. Existing `service_role` grants are retained.
- Verification: read-only catalog confirmed all three policies and no table grants to `PUBLIC`, `anon`, or `authenticated`. A fresh Supabase security-advisor query no longer reported the previous `rls_enabled_no_policy` findings for these tables.
- Status: **Implemented**.

## Security advisor after changes

A fresh `get_advisors(type=security)` result returned only:

- `auth_leaked_password_protection` — WARN — disabled.

The prior three `rls_enabled_no_policy` findings were absent after migration 083.

### Leaked-password protection limitation

The available Supabase connector tools do not expose a supported mutation for this Auth configuration. Do not try to alter Auth internals via SQL. An authorized owner must enable leaked-password protection in the Supabase Dashboard under Auth password/security settings, then re-run the security advisor to confirm.

## Migration-history reconciliation: 080–082

Live catalog inspection found these functions:

- `owner_console_dashboard(integer)`: SECURITY DEFINER, `search_path=public, pg_temp`.
- `owner_console_mask_email(text)`: non-SECURITY DEFINER, `search_path=pg_catalog, pg_temp`.
- `owner_console_create_api_key(text,text,text)`: SECURITY DEFINER, empty search_path.
- `owner_console_list_api_keys()`: SECURITY DEFINER, empty search_path.
- `owner_console_revoke_api_key(text,text,text)`: SECURITY DEFINER, empty search_path.
- `search_user_messages(uuid,text,text[],timestamptz,uuid,integer)`: SECURITY DEFINER, empty search_path.

However, the production migration registry has no entries named `080_owner_console_dashboard`, `081_owner_console_api_keys`, or `082_user_message_recall`. Their presence in the schema does not prove they exactly match repository SQL, nor does missing history prove they were never applied.

**Do not blindly replay migration 080.** Its repository source configures the SECURITY DEFINER dashboard function with `search_path=public, pg_temp`; review whether the public schema is necessary and prefer a hardened path before recording/replaying. Then compare exact function definitions, grants, index definition, owner audit behavior and Memory opt-in call path before reconciling registry state.

## Validation record

### Successful checks

- Supabase `apply_migration` returned `success: true` for 068, 079 and 083.
- Read-only SQL verified integration tables, RLS flags, deny policies, table grants, 079 embedding columns/index/function/grants, and registry versions.
- Security advisor after migration 083 returned no `rls_enabled_no_policy` findings for the three server-only tables.

### Not run / not proven

- No application test suite was run for this production schema pass.
- No end-to-end OAuth/provider integration test.
- No embedding generation, retrieval relevance, tenant-crossing negative test, or Memory opt-in integration test.
- No owner dashboard/API-key UI smoke test.
- No Vercel deployment triggered.
- No PR merge performed.
- No proof of live user-visible behavior.

## Rollback / recovery notes

- Migrations 068 and 079 are additive. Do not drop their new tables/columns/index/function as a rollback without first checking application usage and stored data.
- Migration 083 only revokes browser-role grants and adds deny policies; a rollback is normally unnecessary. Do not remove the deny policies unless the access model is intentionally changed and reviewed.
- If an application regression appears, first revert application callers or disable the affected feature. Avoid dropping credential tables or deleting stored integration data.
- Record any follow-up change in this file, `docs/CLAUDE_MASTER_PLAN_SUMMARY.md`, and `docs/pr-change-log.md`.

## Next actions, in order

1. **Blocked:** enable leaked-password protection in Supabase Dashboard and verify advisor result.
2. **Not verified:** compare 080/081/082 live definitions with repo files and harden the dashboard SECURITY DEFINER search path before any replay/history reconciliation.
3. **Not verified:** verify runtime integration connection ownership, credential encryption and OAuth state lifecycle.
4. **Not verified:** verify hybrid knowledge retrieval with embeddings and tenant/audience isolation.
5. **Blocked:** rebase PR #702 and PR #703, inspect changed files, rerun CI and Documentation Gate; do not merge without passing checks.
6. Update this document with exact SHAs, test output, deployment status and any new blockers.


## Follow-up hardening — migration 084

- Repository migration: `db/migrations/084_harden_owner_dashboard_search_path.sql`.
- Applied successfully to production through Supabase migration runner on 2026-10-30 (Manila time); registry version returned: `20261029225619`.
- Changed `public.owner_console_dashboard(integer)` SECURITY DEFINER function's configured search path from `public, pg_temp` to `pg_catalog, pg_temp`. Application tables and helper function references in the function body are schema-qualified, so public-schema name shadowing is not required for resolution.
- This narrows the search path and reduces object-shadowing risk. It does not prove owner dashboard endpoint authorization, output sanitization, or UI behavior; those remain **Not verified**.
- The Supabase migration runner returned success. A follow-up catalog query must confirm the stored function configuration before this hardening is marked verified.
