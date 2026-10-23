# Security

How NasrinAI handles the problems found in the Phase 0 audit of the original
Nasrin chat, and what is still open. Nothing here makes NasrinAI "unhackable";
the aim is to prevent, limit, detect and recover.

## Audit findings, as of Phase 3

| Finding in the original code | How NasrinAI handles it | Where |
| --- | --- | --- |
| H2 AI and voice endpoints open to anyone, no spend cap | Routed model calls require an authenticated caller and use atomic token reservations plus a shared PostgreSQL USD reservation ledger. The ledger covers routed model attempts, web search, image generation, generated speech, video jobs, and browser-direct realtime sessions; it fails closed when a required reservation cannot be made. Realtime and generated media are charged at conservative maximum-use estimates because exact provider billing is not available synchronously. | `src/gateway/`, `src/limits.js`, `src/ai/budget.js`, `db/migrations/025_global_spend_reservations.sql`, `db/migrations/026_daily_realtime_voice_allowances.sql` |
| M1 Browser sends the chat history | History is read from the database; anything else in the request body is ignored | `src/chat.js` |
| M2 Rate limits counted per server instance | Counters live in the database (`rate_hit`), shared by all instances | `db/migrations/001_core.sql` |
| M3 Customer text sent to an outside model without notice | Emails, phone and card numbers removed from what an outside model sees; the page states where messages go | `src/ai/redact.js`, `public/app.js` |
| M4 Inline-script CSP with tokens in browser storage | Page CSP allows only the site's own script and styles, no inline code; messages rendered as text only | `src/http/headers.js`, `public/` |
| M5 No tests or CI | Server tests (97 at Phase 3) and database access-rule tests run in CI on every push | `test/`, `db/tests/`, `.github/workflows/ci.yml` |
| M6 No record of AI use | Usage telemetry records tokens, latency, outcome, and provider-reported cost when available, without message text. Unknown cost stays null; provider billing dashboards are authoritative. | `usage_events`, `src/limits.js` |
| H1 Support desk can be claimed by anyone | Not applicable: NasrinAI has no call desk. Still open in the Crazybite app | Crazybite repo |

## Controls in place

- **Fail closed:** unknown credentials, unreadable token counters, a missing tenant, or a suspended business refuse the operation. Model selection does not require a local price entry; provider-side spending controls must be enabled.
- **Provider-authoritative billing:** model/media requests are not gated by local per-model price tables or estimated USD reservations. Usage records store actual provider-reported cost only when returned; missing costs remain unknown. Provider account billing limits and alerts are required operational safeguards. Token quotas, plan restrictions, per-caller/IP limits, media quotas, and realtime session/token allowances remain separate application controls.
- **Shared daily realtime voice quota:** the server reserves account-scoped seconds in PostgreSQL under an advisory lock, keyed by tenant and actor and reset at Manila midnight. It also reserves conservative token-quota units against the paid actor allowance and, for business tenants, their configured tenant ceiling. Browser roles cannot access the voice reservation table or RPCs. Unknown session outcomes consume held duration/token allowances conservatively; failed credential creation releases them. Provider-side spending limits are the billing backstop; application token and session quotas remain independent abuse controls.
- **Tenant from the credential only:** `tenant_id` and the actor are never read from the request body.
- **Database:** RLS on every table. Migration 028 adds explicit `USING (false)` / `WITH CHECK (false)` policies for `anon` and `authenticated` on the 34 server-only tables flagged by Supabase, and revokes their table grants; the service-role access used by the server is preserved. This is defense in depth, not a substitute for server-side ownership checks. Confirm the migration is applied to production before claiming the live project has these policies. Business secret keys are stored as SHA-256 hashes; key creation is possible only in the SQL Editor.
- **Conversations:** owned by one caller; anyone else gets 404.
- **Input and output:** JSON bodies capped at 16 KB (the chat route: 4.1 MB for files); messages at 4,000 characters; model replies cleaned of control characters and capped.
- **Files:** photos, PDFs and UTF-8 text only, decided by the file's first bytes, never its name. At most 4 files and 3 MB per message. Photos are re-drawn as JPEG on the phone, which also drops location and camera details. Files are used for one reply and not stored; the saved message keeps their names. Text files are redacted like messages; photos and PDFs cannot be, so they reach the outside model as sent.
- **Voice:** `POST /v1/speech` takes a voice from a fixed list and either a reply id (checked for ownership first; someone else's is 404) or `preview: true` for a fixed line. Text from the request is never spoken. Limited per caller (`LIMIT_*_SPEECH_HOUR`) and per IP, recorded in `usage_events`. Audio is kept in server memory briefly so replays are free; it is not stored. In a hands-free voice turn (`/v1/chat` with `voice` and `speak_voice`) the server speaks only the reply it is writing for that caller, sentence by sentence, with the same voice list and limits (counted once per reply); request text is still never spoken.
- **Sign-in:** the page talks only to NasrinAI's server; the server talks to Supabase Auth with the public key. The refresh token lives in an HttpOnly, Secure, SameSite=Strict cookie limited to `/v1/auth`; page scripts never see it, and the access token (one hour) is kept in memory only. Cookie routes refuse cross-site requests (`Sec-Fetch-Site` and `Origin` checks) and CORS never allows credentials. Google uses PKCE with the verifier in a short-lived HttpOnly cookie. Codes are limited per IP and per address (hashed), attempts per address. Supabase's messages are never shown to the page. When Turnstile is configured, the browser receives only the public site key; the secret remains server-side. Email OTP passes the one-use challenge token to Supabase Auth for CAPTCHA verification in `gotrue_meta_security.captcha_token` (the only place Supabase Auth reads it; a top-level `captcha_token` is ignored and every code request is rejected with "no captcha_token found"), while Google OAuth start verifies the token with Cloudflare Siteverify before issuing the PKCE redirect. Verification fails closed when Google verification fails. CSP allows only the Cloudflare Turnstile script, frame and connection endpoints.
- **Plans and payments:** Max/Ultra are checked on the server for every message (403 `plan_required`). NasrinAI Connect separately fails closed unless the signed-in account's current plan is Max or Ultra (403 `connect_plan_required`). Connect installation ownership is bound to both the tenant and the signed-in account ID, so accounts sharing the platform tenant cannot read or mutate one another's Connect sites. Plans live in `plan_periods`, writable only by the service role; `grant_plan` can only be run by the owner. PayMongo keys stay on the server. The webhook checks `Paymongo-Signature` (HMAC-SHA256 over `t.body`, timing-safe), then re-reads the checkout from PayMongo and records the plan only if the full amount was paid for the plan and account in the checkout; each checkout id is recorded once. If plans cannot be read, users are treated as Free.
- **Own model (Phase 3):** in production a model server on another machine needs `https://` and a credential (bearer key or Cloudflare Access service token), or the server will not start. Credentials in the URL are refused. The browser never learns the model server's address. Its health is checked at most every 30 seconds. See [ADR-004](decisions/004-local-model-runtime.md).
- **Errors:** callers see a plain message and a request id; details stay in the server log. Logs redact anything that looks like a credential.
- **Headers:** CSP, HSTS (production), X-Frame-Options DENY, nosniff, no referrer, Permissions-Policy.
- **Supply chain:** no third-party packages in the main app; two pinned, on-demand packages for the coding sandbox only ([ADR-002](decisions/002-no-runtime-dependencies.md), amended 2026-10-14). `package-lock.json` is committed.
- **Configuration:** the server will not start with missing production settings, a short guest secret, or Supabase keys in the wrong slots.

## Tenant-isolation regression coverage

Cross-chat recall is intended to read only conversations matching the authenticated caller's tenant, actor type, and actor ID. The application-level query is scoped by all three values. The regression suite includes adversarial fixtures for a different account in the same tenant and the same actor ID in a different tenant; private marker strings must never appear in recalled context. This is automated test evidence only and does not replace verification against the live Supabase project or an external penetration test.

## Known limits

- Supabase's `auth_leaked_password_protection` advisor warning is an Auth dashboard setting, not a SQL migration. NasrinAI currently uses email OTP and Google OAuth rather than password sign-in; review enabled Auth providers and enable leaked-password protection if password sign-in is enabled. The setting and live provider configuration must be verified separately.
- Supabase unused-index notices are informational and can reflect indexes on low-traffic or newly deployed features. Do not drop indexes solely to clear the advisor; collect workload evidence and check foreign-key/query coverage first.

- Guests can use the AI without signing in. They do not share a platform-wide token ceiling; shared per-IP/hourly abuse controls, image limits and daily realtime voice allowances remain enforced.
- Rate limits use fixed hourly windows, so a burst at the turn of an hour can reach up to twice the limit.
- NasrinAI no longer estimates or reserves model USD costs from a local price table. Provider-reported cost is recorded when available; otherwise telemetry leaves cost unknown. Enable spend caps/alerts in every provider account. Token allowances, hourly rate limits, media quotas, and realtime session/token limits remain separate abuse controls.
- Token quotas count usage units rather than money, so Max/Ultra may incur higher provider charges. `TIERS_USER` and the `TIER_*` settings control which plans are offered. Provider-side spending limits remain the billing backstop.
- Natural-voice speech no longer receives a locally estimated USD charge. Its provider account owns billing; hourly speech limits remain enforced.
- Realtime voice still connects from the browser directly to OpenAI or Gemini. The server enforces the shared daily session allowance and token-quota reservations before returning a short-lived credential. Gemini token expiry does not prove an established session has ended; provider-side spend controls are still required because the server cannot verify every billable turn.
- Video jobs are governed by plan, duration, capability, token and abuse controls. If a provider omits final cost, usage telemetry leaves it unknown; no model-price estimate is substituted.
- With an own model, what the model server and tunnel log is outside NasrinAI's control.
- A signed-in user's token is trusted for up to 30 seconds after sign-out (short cache).
- Revoking a publishable key stops new widget guest sessions; guests already started keep chatting until their session ends (24 hours by default).
- CORS reflects any origin, without credentials. Access is decided by the credential, and for publishable keys by the origin check at session start.
- Supabase's built-in email sender is for testing only (few emails, team addresses); real users need custom SMTP.
- Two tabs renewing the sign-in at the same moment can sign one of them out (Supabase rotates refresh tokens).
- Tested against a local PostgreSQL copy of Supabase's roles, not yet against the live project. Not yet penetration tested.


## Dependency-audit CI coverage (2026-10-13)

- CI now runs an npm advisory audit with a high-severity failure threshold, in addition to the existing test, secret-scan, and database jobs.
- Resolved 2026-10-14: `express` and `@supabase/supabase-js` were removed (nothing imports them). `@vercel/sandbox` and `@agent-browser/sandbox` stay, pinned to exact versions, because the coding runner loads them on demand (ADR-002 amendment). `package-lock.json` is now committed, so installs are reproducible; CI audits it and fails if it is out of date with `package.json`.
- CI results must be checked on the PR before merge. This change does not modify production settings, database schema, credentials, or application runtime code.


## Secret scanner test coverage (2026-10-13)

- The committed-file secret scanner includes test files; it no longer exempts the entire `test/` directory.
- Synthetic credential examples in tests are assembled from fragments so test behavior remains realistic without committing a complete credential-like value.
- `scripts/teacher/pipeline.js` remains excluded because it contains the detection patterns themselves. `reference/` and binary/document assets remain excluded; this scanner is a guardrail, not a replacement for provider-side secret scanning.
