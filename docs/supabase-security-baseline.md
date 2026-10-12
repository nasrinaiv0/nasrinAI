# Supabase security baseline (production)

- **Project:** `nasrinAI` (ap-southeast-1, Postgres 17)
- **Audited:** 2026-10-12
- **How:** read-only, via the Supabase connector. Only catalog metadata (tables, policies, grants, functions, buckets) and Auth logs were queried. No user rows were read and no keys were fetched or recorded.

This is the reference point for later work: a change must leave every check in §1 unchanged or stricter.

## 1. Access model

All 34 tables in `public` are server-only (see [security.md](security.md) and migration 028):

| Check | Result on 2026-10-12 |
|---|---|
| RLS enabled | ✅ 34 / 34 (not forced; only the service role bypasses it) |
| Policy | `server_only_deny_browser` on every table: `anon`, `authenticated`, `ALL`, `USING false`, `WITH CHECK false` |
| `anon` / `authenticated` table privileges | ✅ none on any table |
| `public` functions executable by `anon` / `authenticated` | ✅ none of 33 |
| `SECURITY DEFINER` functions | ✅ all have a pinned `search_path` (migration 024) |
| Edge Functions | none deployed; the API is `server.js` on Vercel |
| Storage | one bucket, `media`: private, MIME allow-list, no browser policies on `storage.objects` |
| Supabase security advisor | 1 finding (S1 below) |

## 2. Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| S1 | Medium | Leaked-password protection is off (advisor `auth_leaked_password_protection`). | **Owner action.** Turn it on in Supabase → Authentication → Providers → Email → *Prevent use of leaked passwords*. It needs the Pro plan. Sign-in is by email code and Google, so passwords are not used today; this is defense in depth. [Docs](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) |
| S2 | Low | The `media` bucket had no file-size limit. | ✅ **Fixed.** [`029_media_bucket_size_limit.sql`](../db/migrations/029_media_bucket_size_limit.sql) sets a 50 MB limit. It was applied to production on 2026-10-12; Supabase's migration history lists it as `026_media_bucket_size_limit` (it is renumbered in the repo because 026 is taken). The bucket was empty, and it was verified private with an unchanged MIME list afterwards. DB test: `db/tests/029_media_bucket_size_limit.test.sql`. |
| S3 | Low | Supabase's migration history lists only 4 entries (`017_retention_config`, `024_security_definer_search_path`, `025_move_vector_to_extensions` (not a repo file name), and S2), but the repo has 001–029. This is expected: migrations are run in the SQL editor (see `CLAUDE.md`), so the history table cannot be used to tell which repo files are live. | Spot check: objects from 025 (`spend_reservations`), 026 (`realtime_voice_reservations`) and 028 (deny policies on every table) exist in production. Before running a new migration, check its objects in the live schema rather than relying on the history list. |
| S4 | Info | RLS not forced. | No change: browser roles are denied by policy and have no grants. |

## 3. Sign-in finding from the same audit

The Auth logs showed every email-code request rejected with `no captcha_token found`. This was fixed in PR #219 (token sent as `gotrue_meta_security.captcha_token`). See the troubleshooting note in [operations.md](operations.md).

## 4. Rules kept for later work

- No new `anon`/`authenticated` policy, grant, public bucket or browser-callable function.
- Every migration is repeatable, gets a DB test, and is tried on the staging Supabase before production.
- Secrets stay in Vercel env vars. CI runs `npm run check:secrets` and GitGuardian on every PR.
- Re-run the Supabase security advisor after each migration.
