# Owner Command Center — Phase 0 repository audit

Date: 2026-10-14  
Branch reviewed: `feature/owner-command-center`  
Target PR: [#353](https://github.com/primusco20/nasrinAI/pull/353)  
Scope: read-only source inspection; no runtime, database, environment, DNS, or production changes made by this audit.

## 1. Current repository facts verified

| Area | Verified observation | Implementation consequence |
| --- | --- | --- |
| HTTP application | `src/http/app.js` handles `/healthz`, sends `/v1/*` through the API router/gateway, then serves static files through `src/http/static.js`; unmatched requests return HTTP 404. | The owner page and owner APIs need explicit server handling before static file serving. Never place protected dashboard HTML in `public/` and rely on a hidden link. |
| Static file server | `src/http/static.js` serves files from `public/` and applies path checks. | Owner data and privileged UI must not be shipped as a public static page. Only non-sensitive shared assets may be public. |
| Authentication | `src/auth/routes.js` issues Supabase access tokens to the browser and keeps refresh tokens in HttpOnly cookies. The current refresh cookie is scoped to `Path=/v1/auth`. | A direct GET to `/owner` cannot authenticate by relying on the existing refresh cookie alone. |
| API identity | `src/gateway/index.js` identifies callers from bearer credentials and resolves a verified user through the existing verifier. | Reuse existing Supabase verification; never trust a browser-supplied email, user ID, role, or owner flag. |
| Client IP | `src/main.js` passes `clientIpFrom(req, config.trustProxyHops)`; `src/net.js` resolves IP using the configured trusted-proxy hop count. | Owner IP checks must reuse this server-side resolver and confirm the deployment's actual trusted-proxy setting. Never use raw client-supplied forwarding headers directly. |
| Runtime constraints | `CLAUDE.md` and ADR-002 require Node built-ins and no new runtime dependencies for this work. | Use existing Node/server/UI conventions; no new packages or frontend framework. |
| Database boundary | Migrations `028_explicit_server_only_rls_policies.sql`, `030_ai_automation.sql`, `032_automation_server_only_rls.sql`, and `033_automation_run_identity_fk.sql` establish server-only tables and automation tenant/owner integrity. | Do not query privileged tables from browser code or weaken RLS/grants. Verify exact schema and data source before adding queries or migrations. |
| Deployment | `vercel.json` rewrites `/v1/*` and `/healthz` to `api/index`; it defines the existing CSP and security headers. | Any owner route must work with Vercel's rewrite order and must not weaken CSP or introduce inline scripts/styles. |
| Existing dashboard | `CLAUDE.md` describes the Owner Command Center as a blueprint not yet implemented. No owner route, owner API, or owner allowlist configuration was found in the inspected app/config excerpts. | Treat all dashboard functionality as not implemented until code and tests prove otherwise. |

## 2. Critical security architecture finding

The existing sign-in design is token-in-memory for the browser and a refresh cookie restricted to `/v1/auth`. A normal browser navigation to `/owner` does not include the bearer token held in JavaScript, and the scoped refresh cookie is not sent to `/owner`. Therefore, simply adding a server-side check to the static route would lock out legitimate direct visits; serving the dashboard first and checking later would violate the required 404 boundary.

### Required owner-session flow

Implement a dedicated, short-lived owner session bridge:

1. The signed-in app requests an owner-session bootstrap using the current bearer access token over same-origin HTTPS.
2. The server independently verifies the token with the existing Supabase Auth verifier, checks the verified email against `OWNER_ALLOWED_EMAILS`, and checks the IP returned by the trusted `clientIpFrom` resolver against `OWNER_ALLOWED_IPS`.
3. If and only if both allowlists are valid and both checks pass, the server sets a dedicated Secure, HttpOnly, SameSite=Strict owner-session cookie. Scope that cookie as narrowly as the route layout permits; do not reuse the refresh token cookie or expose access tokens in URLs/local storage.
4. The owner page and every owner API/export/control request validate the owner session and re-check the current trusted IP and allowlist configuration. The session must expire promptly and must not remain valid after sign-out/revocation beyond its explicitly documented short lifetime.
5. Unauthorized page and API requests return the same generic real HTTP 404, with no owner HTML, metric data, allowlist diagnostics, or cache leakage.
6. If the selected cookie/session design cannot safely support all of the above, stop and document the blocker instead of weakening the 404 policy.

The exact session token format, cookie scope, expiration, revocation behavior, and whether a separate secret is required must be finalized in code review and covered by tests before implementation is considered secure. Never reuse an unrelated secret merely to avoid adding configuration. Missing/invalid allowlists or any unavailable identity/IP verification must fail closed.

## 3. Source-of-truth audit status

The following sources have **not yet been fully mapped** to exact schemas, fields, definitions, permissions, and query plans. They must not be represented as connected just because related tables or integrations exist.

| Domain | Current audit status | Required next verification |
| --- | --- | --- |
| AI usage/tokens/cost | Partial: `usage_events` and `spend_reservations` appear in migration/security documentation; exact fields and semantics not yet verified. | Inspect migration definitions and store writers; separate logical requests, provider attempts, estimates, reservations, and actual provider cost. |
| Accounts/plans/billing | Partial: existing account/plan/billing handlers are present. | Trace authoritative store methods and PayMongo webhook records; define settled/refunded/pending amounts without exposing customer payment data. |
| Infrastructure/releases/CI | Not yet verified as connected to dashboard-readable APIs. | Identify approved Vercel/GitHub sources and safe credentials; missing integrations remain explicitly unavailable. |
| Security/audit events | No owner-specific append-only audit model verified. | Reuse safe events where they exist; otherwise propose additive server-only model and tests after schema audit. |
| NCC workflows/runs/outbox | Automation and NCC-related schema files exist. | Verify current migration history, schema fields, status transitions, tenant/owner scope, retention, and source-of-truth for execution outcomes. |
| Alerts/delivery | Not verified end-to-end. | Verify destinations, secrets, delivery attempts, retries, deduplication, cooldown, and resolution flow. |
| Metrics/freshness | No owner metric dictionary verified. | Define every KPI and its source, units, timezone, freshness, coverage, estimate status, and tests before displaying it. |

## 4. Build and validation boundaries

- Work remains on `feature/owner-command-center` in PR #353 so all implementation phases stay in one PR, as the owner requested.
- Do not merge, deploy, alter production environment variables, or apply production migrations without explicit owner approval.
- Inspect migration history and actual schema before designing a migration. Production Supabase must not be used as a scratch database.
- Required checks from the handoff: `npm test`, `npm run check:secrets`, `db/tests/run.sh`, GitGuardian, and Vercel Preview where configured. Report only observed outcomes.
- The GitHub source inspection used for this audit does not execute code or tests. No test result is claimed by this document.
- Every implementation phase must update the main feature specification, this audit/gap matrix, and `docs/pr-change-log.md` in the same PR. If data collection/retention changes, update legal docs and the version defaults required by `CLAUDE.md`.

## 5. Immediate next actions

1. Inspect the exact relevant migrations/store writers and current tests for usage, spend, plans/payments, automation, and NCC.
2. Implement and test the owner-session bootstrap and uniform 404 boundary before any dashboard data endpoint.
3. Add an authorization regression matrix for signed-out, non-owner, wrong IP, forged proxy headers, invalid/missing configuration, expired/revoked session, and direct owner API/export requests.
4. Only after the security boundary passes, implement the premium responsive read-only shell and first metrics using verified sources.
5. Continue all modules sequentially on this same branch and PR; keep controls read-only until separately implemented and tested.
