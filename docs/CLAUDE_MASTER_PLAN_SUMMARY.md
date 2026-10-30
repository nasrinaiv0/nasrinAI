# NasrinAI — Claude Handoff & Progress Snapshot

## Latest verified snapshot — 2026-10-30 15:08 Asia/Manila (07:08 UTC)

- Current main: 85db3be07e8fa895a835fa7736e2de8ea07b9ed5, merge of PR #715. The current production deployment is Vercel deployment dpl_HiEJFRKoymqDcVX2PMN88GmCtBqY, READY at that exact SHA; nasrinai.com is listed among its aliases.
- PRs #713, #714 and #715 merged in sequence between 05:56 and 06:06 UTC. Their PR-head CI and Documentation Gates passed; main push CI #41012161842 passed.
- PR #713 CI #41011007035: 1,287 tests total, 1,286 passed, 0 failed, 1 skipped; database tests, dependency audit, OpenRouter activity-sync tests, JavaScript syntax and secret checks passed.
- PR #714 CI #41011532839: 1,294 tests total, 1,293 passed, 0 failed, 1 skipped; database tests, dependency audit, OpenRouter activity-sync tests, JavaScript syntax and secret checks passed.
- PR #715 CI #41012048749: 1,297 tests total, 1,296 passed, 0 failed, 1 skipped; database tests, dependency audit, OpenRouter activity-sync tests, JavaScript syntax and secret checks passed.
- Production root and /app.js returned HTTP 200; the served client bundle contains the multi-picture intent/count flow, and /creative-intent.js contains the MAX_PICTURES cap. This is static asset smoke evidence only, not authenticated live image-generation or sandbox execution proof.
- PR #716 adds a planning-only Video Studio adoption backlog. Its initial Documentation Gate failed because docs/pr-change-log.md was not updated. Changelog correction commit bfc83e87e47e142c5d93096013ade2d4e635958d was pushed; CI #41018566624 and Documentation Gate #41018566645 now pass on the corrected head.
- PR #712 remains the central audit-ledger review path. Its prior head 21e04a47ec287607ecc11315191b90d8c8946990 was 6 commits behind current main in the API comparison. This update merges current main into the documentation branch without merging the PR; exact-head validation is pending.
- Security follow-up remains open: src/tools/agent.js limited() returns true if store.rateHit is absent. Both current supported stores implement rateHit, so this is a fail-open configuration fallback, not a demonstrated production exploit. Harden it and test missing-method/store-failure paths.
- Carried forward and not freshly rechecked: repository main-branch protection, Supabase leaked-password protection, migration 080–082 parity, targeted SECURITY DEFINER review, authenticated Owner Command Center smoke, and persistent attachment issue #486.

### Immediate next actions
1. Harden the missing-rateHit fallback in src/tools/agent.js and add fail-closed regression tests.
2. Verify authenticated coding workspace and sandbox behavior, including network denial, timeout/output limits, cleanup and tenant isolation.
3. Test multi-image allowance, provider billing, partial failures and duplicate retries with synthetic accounts.
4. Keep PR #716 as planning-only; validate any implementation independently because the reference repository is GPL-3.0-only.
5. Reconcile the carried-forward branch-protection, leaked-password, migration 080–082, SECURITY DEFINER, OCC and attachment issues.

--- Historical material retained below ---

## Latest verified snapshot — 2026-10-30 09:20 Asia/Manila

- Main/production source: `b39f4dcd62641d5f601e4e707cb46155ca8e135e`; Vercel deployment [dpl_EYBvVZe2o1qdMrUuXvGoXcqD4qkG](https://vercel.com/nasrin-ai/nasrinai/EYBvVZe2o1qdMrUuXvGoXcqD4qkG) is READY at the same SHA.
- Latest in-scope application change: PR #709 merged; OCC labels now read “Automation & Jobs” and “Automation”. CI #40972509344 and Documentation Gate #40972509431 passed on its PR head. Live authenticated OCC browser/API behavior is not verified.
- PR #708/migration 085 remains the recorded OCC database repair; earlier SQL verification is historical evidence and was not repeated in this audit.
- Documentation PR #710 is 5 ahead / 5 behind and non-mergeable; PR #705 is 22 ahead / 16 behind with no workflow run returned for its exact head. This current-main-based audit branch is the reconciliation candidate.
- Carried-forward, not freshly rechecked: migration registry/source parity for 080–082; Supabase leaked-password protection; targeted SECURITY DEFINER review.
- No production schema, Auth setting, credential, deployment, or application code was changed during this audit. See [the 09:20 audit delta](engineering/updates/2026-10-30-0920-nasrinai-audit.md).



> Original status audit 2026-10-18; this is a running record. The latest reconciled snapshot is 2026-10-30. Historical entries may be stale; always follow the current audit report, GitHub PR state, CI, deployment, and database evidence. See [claude-code-handoff.md](claude-code-handoff.md) for the upgrade backlog and [CLAUDE_MASTER_PLAN_INDEX.md](CLAUDE_MASTER_PLAN_INDEX.md) for the plan index and continuity rules.

Last updated: 2026-10-30
Repository: https://github.com/nasrinaiv0/nasrinAI

## Production reconciliation update — 2026-10-30 (direct Supabase changes)

**Latest observed database status:** migrations `068_user_owned_integrations`, `079_tenant_hybrid_knowledge`, and `083_explicit_deny_server_only_tables` were applied successfully to production Supabase after the user explicitly asked to execute the updated repair plan. Do not rely on the earlier historical lines below that say these changes are pending; this dated update supersedes them for these three migrations.

- `068_user_owned_integrations` — **Implemented (schema only)**. Both `public.integration_connections` and `public.integration_oauth_states` now exist. RLS is enabled; explicit `server_only_deny_browser` policies deny `anon` and `authenticated`; table privileges are revoked from browser roles; `service_role` retains access. Migration registry entry version: `20261029225506`. Application-level OAuth/credential persistence and ownership behavior have not been exercised end-to-end.
- `079_tenant_hybrid_knowledge` — **Implemented (schema only)**. `knowledge_chunks.embedding` and `embedding_model` exist; `knowledge_chunks_embedding_hnsw` exists; `search_knowledge_hybrid` exists as SECURITY DEFINER with fixed `search_path=pg_catalog, public, extensions`; routine privileges observed for `postgres` and `service_role`, with browser roles revoked. Registry version: `20261029225531`. Semantic embeddings are not populated/validated by this schema change; runtime retrieval remains **Not verified**.
- `083_explicit_deny_server_only_tables` — **Implemented (security hardening)**. Explicit false policies now exist for `anon` and `authenticated` on `knowledge_learning_runs`, `openrouter_generations`, and `public_technical_chunks`; no table privileges were found for `PUBLIC`, `anon`, or `authenticated`. Registry version: `20261029225602`. Supabase security advisor no longer reports the three RLS-enabled/no-policy findings.
- **Still Blocked:** leaked-password protection remains disabled. The available Supabase connector exposes no Auth security-settings mutation, so this must be enabled through the Supabase Dashboard's Auth password-security settings by an authorized owner.
- **Still Not verified:** migrations `080_owner_console_dashboard`, `081_owner_console_api_keys`, and `082_user_message_recall` have relevant functions/indexes present in the live schema, but their migration registry entries are absent and exact definition parity has not been established. Do not blindly replay 080: its repository migration sets `search_path=public, pg_temp` on a SECURITY DEFINER dashboard function; review and harden that definition before reconciling history.
- **Still Not verified:** end-to-end integration connection/OAuth flows, tenant hybrid retrieval, memory opt-in behavior, owner dashboard/API-key UI, PR #702 and #703 conflict resolution, and production app behavior.
- **Test/deployment boundary:** these were direct production database changes. Migration runner success and read-only catalog/advisor verification are confirmed; no app test suite or end-to-end test was run for these DB changes. No GitHub PR was merged and no Vercel deployment was initiated as part of this pass.
- **Environment constraint:** Supabase development branches are unavailable on the current Free plan; the approved `$0.01344/hour` branch could not be created. No separate test project was created.

Detailed evidence and exact SQL: [production schema repair progress](audits/PRODUCTION_SCHEMA_REPAIR_PROGRESS_2026-10-30.md).


## How to use this file
Read this before making changes. Treat GitHub's current `main`, open PRs, workflow results, and Vercel deployment state as the source of truth. Do not assume an open PR is merged or that a successful deployment status means every test passed. Inspect the actual diff and run the applicable checks before changing code.

## Working rules
- Quality and security take priority over speed. Avoid speculative fixes and broad refactors when a narrow fix is safer.
- Never claim tests, deployment, OAuth, or UI behavior are verified unless the relevant evidence was checked.
- Keep environment configuration in Vercel; do not introduce hardcoded production secrets or default secret values.
- Preserve authentication, Supabase RLS, provider routing, streaming, and plan/rate/token limits when modifying adjacent code.
- Treat provider permissions as least-privilege. Read/write checkboxes describe requested access only; actual grants must be confirmed by provider OAuth scopes.
- Never expose OAuth tokens or secrets to the browser/model. Write operations need server-side authorization, audit logging, and explicit user confirmation.
- Keep user-facing UI premium, restrained, consistent, accessible, responsive, and especially reliable on mobile Safari.
- After each meaningful change, update this handoff with the PR, commit, test state, limitations, and next steps so Claude can resume without guessing.

## Current verified state — 2026-10-30 04:26 Asia/Manila

- **Main:** 3a2c705461ac5b9920191ef67e5b25213dff0222 (merge of PR #692).
- **Production deployment:** Vercel reports deployment dpl_GkNLFAzWEnU2Sb8okP4X5an1iJSE as READY at the same commit. READY is not end-to-end functional verification.
- **Critical DB blocker:** migration 068 is missing from the production registry, and public.integration_connections / public.integration_oauth_states are absent even though current main queries integration_connections. See [the detailed audit](audits/NASRINAI_PROGRESS_AUDIT_2026-10-30.md).
- **Migration drift:** migration 079 is absent from the registry; existing `knowledge_docs.tenant_id`, `knowledge_chunks.tenant_id`, and `knowledge_chunks_tenant_idx` are present, but `embedding`, `embedding_model`, `knowledge_chunks_embedding_hnsw`, and `search_knowledge_hybrid` are absent. Migrations 080/081 are absent from the registry even though their owner-console functions exist and have service_role-only execution grants. Do not blindly replay migrations.
- **Open PRs:** #693–#698 have passing CI and Documentation Gate on the observed heads but are not merged; #695 addresses the no-database dev-start regression. Draft PRs #651, #652, and #673 have a failing Documentation Gate because docs/pr-change-log.md is absent from the current PR diff.
- **Security:** Supabase still warns that leaked-password protection is disabled (documented as owner-deferred); three RLS-enabled server-only tables have no policies and no anon/authenticated SELECT/INSERT grants, with service_role grants present.
- **Unverified:** owner-console/API-key live flows, universal integration persistence, tenant-hybrid retrieval, coding/reasoning benchmark baseline, hourly learning invocation, and live media/provider end-to-end behavior.
- **Scope boundary:** this handoff and scheduled audit cover only NasrinAI. MOVO/MOVI workstreams and product-specific changes are excluded.

Read [NASRINAI_PROGRESS_AUDIT_2026-10-30.md](audits/NASRINAI_PROGRESS_AUDIT_2026-10-30.md) before acting on historical status entries. The 04:26 refresh rechecked current PR heads/gates and live schema metadata (audit report commit de171326b2be76bf42ff1119226b0542dc37c1c6); the new documentation head must pass fresh CI and Documentation Gate checks before merge.

## Historical task snapshot — plugin settings mobile layout (2026-10-18)
### PR #383
URL: https://github.com/primusco20/nasrinAI/pull/383
Branch: `fix/plugin-settings-mobile-overlap`
Base: `main`
Latest known head at snapshot: `ebaf14a049008e14ce0a997200bf9f83d955188c`
Status at snapshot: open, not merged.

Purpose: fix overlapping/inconsistent text in per-app plugin settings shown in mobile Safari screenshot. CSS changes in `public/app.css` give account and information rows independent grid columns, allow safe wrapping, stack values under labels at widths <= 420px, and normalize spacing/line heights/action button wrapping. A regression test was added to `test/github.test.js`.

Validation observed on 2026-10-18:
- Vercel status for the PR head: success.
- GitHub Actions CI workflow run #2721: completed successfully.
- This does not prove live iPhone rendering has been manually verified. Check the PR is still on the same head and all required checks remain green before merging. Then inspect the settings page on mobile Safari and desktop.

## Recent plugin settings / access work
### PR #382
PR #382 was previously reported merged. It added per-app access settings and scoped Google OAuth authorization options. Verify current `main` before relying on exact implementation details.
- Gmail scopes: read-only (`gmail.readonly`) and write-capable (`gmail.modify` plus `gmail.send`).
- Calendar scopes: read-only (`calendar.readonly`) and event-write (`calendar.events`).
- OAuth scopes alone do not implement send/modify actions. Current tools may remain read-oriented until dedicated safe server-side write endpoints, confirmation UX, and audit logging are implemented.
- Other providers need provider-specific OAuth/API/tool support before their permissions can truthfully be shown as granted.
- UI should display access based on scopes actually granted by Google, not merely the requested setting.
- A settings-sheet bug was identified where opening Plugins could leave both `#pluginsList` and `#pluginCatalogSettings` visible; ensure the panel state is reset when reopening.

## Earlier plugin catalog work
### PR #378 and follow-up history
- Requested removing the Google Cloud catalog entry and adding Google Meet, Google Keep, Google Search, and Google Maps.
- Catalog entries were placeholders / “Coming soon” unless provider APIs, OAuth, and tools were implemented. Do not represent catalog presence as a functioning integration.
- Product icon implementation used Simple Icons CDN URLs; do not call them verified official Google-approved assets without checking source and branding requirements.
- Google Keep API support and Google Search implementation approach require verification before promising functionality.

## Chat answer citations and follow-up forms
The user requested:
- Replies should include resources/citations, especially when data comes from the internet.
- Clarifying follow-up questions should be organized in bullet points like ChatGPT, while preserving free-text answers and letting users select suggested answers.
When implementing, preserve keyboard/mobile accessibility, source attribution, and user ability to type custom answers. Test both structured suggestions and free-text entry.

## Broader product constraints
- NasrinAI settings should consistently expose settings for catalog apps that are actually implemented, including account connection, reconnect/disconnect, configure access, requested read-only/read-write permissions, and app information.
- Avoid false “connected” state for unsupported integrations.
- Main buttons and critical flows must not regress; run the relevant regression suite.
- Keep all production environment values in Vercel; do not add hardcoded env defaults.
- Security and quality are more important than speed.

## Other tracked work (historical; re-check GitHub before acting)
- PR #363: performance optimization handoff document; prior context said open and documentation-only. Baseline audit and measured optimization were still required; no Lighthouse/performance results should be assumed.
- PR #365: documentation-only master summary; prior context said open and mergeability needed review.
- PR #366: production-quality upgrade documentation; prior context said open, required checks pending.
- PR #352: Vercel-only environment configuration and OCC AI voice front desk planning; prior context did not establish it was merged or deployed.
These statuses are historical snapshots and may have changed.

## Immediate next steps for Claude
1. Fetch current `main`, PR #383 diff/head, and current required-check results.
2. Confirm PR #383 CSS and test match the intended settings markup; run full CI and relevant tests.
3. Check mobile layout at narrow widths and desktop, including long account/provider names and action buttons.
4. Merge only if checks pass and diff is safe; otherwise fix the failing check without unrelated changes.
5. After merge, verify the actual deployment and mobile rendering. Do not claim visual verification unless it happened.
6. Update this file with final PR/merge/deployment/test status and the next concrete task.


## Update — plugin account entry and provider-family categorization (2026-10-18)
### Follow-up to PR #382
PR #382 is already merged into `main`; merged PRs cannot be edited. Follow-up changes are being prepared on branch `feat/plugin-family-categories-add-account` for a new PR.

Changes in this follow-up:
- Corrected plugin family classification explicitly: Google apps (including Gmail, Google Calendar, Drive, Meet, Keep, Search, Maps, and Google Team) map to Google; Outlook, OneDrive, Teams, Excel, and PowerPoint map to Microsoft; Canva is classified under Design; Facebook, Instagram, Threads, X, Messenger, and WhatsApp are Social & messaging; GitHub is Developer tools.
- Moved Canva out of the Microsoft catalog section and gave it a Design section.
- Added an Add account action to the plugin settings account area for supported integrations.
- Safety limitation: current Google connection handling stores one connected account for the integration. When that account is already connected, Add account explains that multi-account linking is not implemented and does not launch OAuth or replace the current account. True multi-account support requires backend token storage keyed by provider/account, account selection, isolated authorization state, disconnect-one-account behavior, and security tests.
- Added regression tests for provider-family classification, Add account markup, and the one-account guard.
- These changes are not yet merged. Run full CI and inspect the diff before merge. Do not claim multi-account support until the backend is implemented and verified.


### CI failure fix — PR #384 (2026-10-18)
- CI run #2730 failed in the Node test job; database tests and dependency audit passed, and Vercel status was successful.
- The single failing test was `plugins: catalog apps are grouped by provider family and add-account is guarded`. The implementation correctly uses the quoted object key `'Google Calendar': 'Google'`, but the test expected the invalid unquoted form `Google Calendar: 'Google'`.
- Corrected the test assertion to match the actual valid JavaScript key. No runtime application code was changed for this test-only fix.
- Commit: `d6a941a9f2b0e83026faf892250e3dbd813b387a`.
- Re-run CI and confirm all checks pass before merging; results for this new commit are pending.


## Update — plugin accordion, account actions, and catalog cleanup (2026-10-18)
- Removed the legacy Google Team pseudo-plugin from the Google catalog; Team remains a workspace Settings feature.
- Google plugin cards now enforce a single-open accordion: opening one collapses the others.
- Consolidated connect/disconnect into one state-aware action for supported Google integrations. Connected apps show a disconnect action; disconnected apps show connect.
- Improved small-screen plugin action wrapping and catalog row wrapping.
- Add-account limitation remains: the Google connection table/API is keyed to one row per tenant/user and the OAuth callback upserts on that key. The UI now explicitly avoids launching OAuth from Add account while multi-account storage is unsupported, preventing accidental replacement. True Add account requires a schema/API migration to provider/account-keyed rows and per-account token selection/disconnect before safely enabling it.
- PR #384 was already merged; these changes are being committed directly to main rather than creating another PR, per request. Tests and deployment status must be checked after these commits.

- Follow-up implementation note: removed the legacy extra click listener so the single state-aware connect/disconnect control cannot launch connect and disconnect handlers together. Latest direct-main commit: `705492d00ca5c9aebfc50e3878f819fc50327012`. At last check Vercel status was pending and no PR-triggered workflow runs were returned for this direct-main commit; do not claim deployment or tests passed until verified.


## Update — independent Google app connections and stale test (2026-10-18)
- Fixed `test/google-team-settings.test.js`: its Google catalog assertion still expected the removed `Google Team` pseudo-plugin.
- Changed Google connection storage to use a `service` key per user/tenant and added independent Gmail/Calendar status, OAuth callback upserts, token refresh updates, and service-scoped disconnects. Existing encrypted token payloads retain the existing AAD so the migration can duplicate the prior connection safely.
- Added migration `042_google_service_connections.sql` to split the legacy connection row into Gmail and Calendar rows according to existing granted scopes, and change the primary key to `(tenant_id,user_id,service)`. Apply this migration to Supabase before deploying the backend code; until it is applied, the new endpoints cannot work.
- Gmail and Calendar UI now load status independently and disconnect only the selected app. The legacy `both` OAuth choice maps to Calendar; new UI flows use the per-app service values.
- Migration 042 is live in production Supabase (checked read-only on 2026-10-18: `google_connections` primary key is `(tenant_id, user_id, service)`). CI and Vercel results for the code remain to be confirmed per PR.


- Final test correction commit: `8e1d11b397d0ab27c864e344020746f1b0224492`; the Google catalog regression now asserts Google Maps remains and Google Team is absent. Latest observed Vercel status is pending; no PR-triggered workflow runs were returned by the status wrapper. Full CI has not been confirmed.

## PR #385 conflict resolution handoff (2026-10-18)
- PR #385 branch diverged from `main` (8 commits ahead, 21 behind). The current `main` already contains the Google Team catalog removal and stale-test correction; preserve current main application code and tests.
- Reapply only the Team directory copy changes to `public/index.html` and record this conflict resolution. Do not overwrite newer `main` app code with stale PR snapshots.
- Team directory remains browser-local/account-scoped; it is not yet automatically consumed by every integration.
- Validation required after conflict resolution: run CI and verify the mergeability status before merging.


## Plugin settings layout cleanup (2026-10-18)
- Removed Google Meet, Google Keep and Google Maps from the lower generic catalog because their per-app connection cards already render in the upper plugin list. The independent connection cards and their status/actions remain intact.
- Kept Google Search in the Google catalog because it is a distinct entry and is not one of those existing connection cards.
- Added a separate **Developer tools** group with GitHub, Vercel, Render, Supabase and Cloudflare, each opening its official dashboard in a new tab.
- The separate GitHub coding connection card and its OAuth/account controls remain unchanged. The developer-catalog GitHub row links to GitHub; it does not claim Vercel, Render, Supabase or Cloudflare are connected to NasrinAI.
- Preserved Microsoft, Design, and Social & messaging catalog entries.
- Validation is pending: run the targeted and full tests in CI, then visually verify the layout in iPhone Safari before merging or deploying.

## Plugin read/write capabilities (PR #386, 2026-10-18)
- Added Gmail message reading, sending, and read/unread status updates, plus Google Calendar event updates and deletion.
- All external mutations use the existing server-side one-time confirmation flow; model output cannot approve its own action.
- Each operation checks the current user's actual Google OAuth scopes before calling the provider. Missing or insufficient scopes fail closed; tokens remain server-side.
- Added regression coverage for tool registration, Gmail send payloads, denied scopes, Calendar deletion, and incomplete event-time validation.
- Catalog-only providers remain clearly marked as unsupported/coming soon until provider-specific functionality is implemented.
- Local validation: `npm test` passed 687 tests with 1 skipped. CI must also pass before merge; production OAuth verification and configuration remain separate requirements.


## Production quality and anti-vibe-coding upgrade (PR #366)

- **Specification:** [NasrinAI Production Quality & Anti-Vibe-Coding Upgrade](nasrinai-production-quality-anti-vibe-coding-upgrade.md).
- **Goal:** make NasrinAI look intentionally designed and professionally engineered: routing, SEO, metadata, 404 handling, favicon and share images, performance, console and source-map hygiene, copy integrity.
- **Status (2026-10-19):** partly implemented. Done: 404 page, `robots.txt`, `sitemap.xml`, page descriptions, canonical and share tags (#405, see [seo.md](seo.md)); unstyled FAQ and registry pages fixed (#431); performance measured (#432, see [performance-baseline.md](performance-baseline.md)). Not done: route inventory, structured data, source-map and console review, live verification of the 404 page and the `www` redirect.
- **Constraints:** audit before changing architecture; preserve behaviour and security; no hardcoded production configuration; use Vercel environment variables.
- **Acceptance:** section 13 of the specification. Record evidence, tests, remaining risks and deployment verification before marking anything complete.


## Continuous Intelligence / Hourly Learning — 2026-10-29

- Detailed upgrade: [nasrinai-continuous-intelligence-upgrade.md](nasrinai-continuous-intelligence-upgrade.md).
- Branch: `feat/continuous-intelligence-hourly-learning`.
- Initial implementation adds a curated official programming documentation source registry and a protected hourly route using the existing crawler. Queue insertion is intended to be idempotent so hourly seeding does not reset crawl scheduling.
- Target behavior: retrieve trusted knowledge for relevant tasks, evaluate coding/reasoning outcomes, and promote only validated, privacy-safe improvements. Database ingestion alone is not model training; fine-tuning remains a separate later phase.
- Status: in progress. Run CI and inspect the final diff; confirm the deployed cron and live Supabase schema before production claims.


## Continuous Intelligence and hourly learning — deployed baseline; phase 2 open — 2026-10-29

- **Status:** PR #674 is merged and the Vercel production deployment is READY. CI #7706 passed 1,189 Node tests (1,188 passed, 0 failed, 1 skipped), database tests, dependency audit, OpenRouter activity-sync tests, JavaScript syntax checks, and secret scanning. Documentation Gate #1808 passed.
- **Runtime evidence:** Live Supabase contains 19 indexed `owner_seed` queue rows and 41 official-host pages; the latest official page fetch observed was 2026-10-28 22:35 UTC. This verifies that official crawl data exists, but does not by itself prove the exact hourly Cron invocation or a successful authenticated OCC request.
- **Security:** Live crawl tables exist; RLS is enabled and anonymous/authenticated policies deny access. The claim function has a fixed search_path and execution grants limited to service_role/postgres. Migration-history drift remains: objects exist but migration 044 is absent from the migration list. Do not blindly reapply migration 044.
- **Deployed behavior:** Curated official programming seeds, protected hourly queue seeding, idempotent queue insertion, same-host traversal for owner-seeded sources, bounded locally ranked keyword retrieval for platform coding questions, official HTTPS host allowlisting, secret-pattern exclusions, untrusted-context handling, source citations, and an owner-only OCC panel/API with bounded metadata samples.
- **Known gaps:** Current retrieval is keyword-based, not semantic/vector RAG, and does not train model weights. Production schema has no enabled `vector` extension; existing `knowledge_docs`/`knowledge_chunks` require tenant IDs, so global public docs must not be mixed into tenant-owned records. Semantic index requires a reviewed schema/permission boundary and embedding-provider cost controls. Direct cron-invocation/OCC runtime evidence, persistent per-run history, and a fixed coding/reasoning evaluation benchmark remain open.
- **Next:** Confirm a successful hourly route invocation and authenticated OCC response from production logs; reconcile migration history; design a separate RLS-protected public-doc index or explicit public scope; select an embedding provider and budget; implement semantic retrieval and fixed benchmark only after security review.


## Continuous Intelligence full-text indexing follow-up — in development — 2026-10-29

- **Scope:** Add idempotent, content-hash-aware ingestion of trusted crawler pages into the existing platform knowledge search, rather than relying only on the crawler keyword fallback.
- **Implementation:** Migration 076 adds managed-document content hashes and a service-role-only SECURITY DEFINER upsert RPC with fixed search_path, platform-tenant validation, HTTPS URL validation, chunk size/count limits, and a 200-document cap. The server indexer filters to the official host allowlist and processes up to five changed documents per hourly run.
- **Retrieval:** Uses existing knowledge_docs/knowledge_chunks and search_knowledge full-text ranking. Public docs are labelled untrusted reference data. This is full-text RAG, not vector embeddings or model-weight training.
- **OCC:** Extends owner-only telemetry with managed knowledge-document sample count and latest indexed timestamp, without returning page bodies or raw errors.
- **Validation:** Migration/database regression tests and unit tests have been added; CI and Documentation Gate are pending on the follow-up PR.
- **Rollout gate:** Do not merge or deploy until CI passes. Apply migration 076 to production only after CI; then verify RLS/grants, idempotent indexing, and actual search_knowledge retrieval. Existing migration-history mismatch for crawler migration 044 must not be “fixed” by blindly rerunning it.
- **Remaining:** Semantic embeddings/vector ranking, persistent per-run history, a measured coding/reasoning benchmark, and optional fine-tuning remain separate phases.


## Continuous Intelligence full-text indexing — deployed — 2026-10-29

- **Status:** PR #678 merged as `df7f9f1ecef8e2dc8409cadf22ff682cc737f723`; production Vercel deployment `dpl_2YBLzFCp62TnyxDqiHWq15g8a5Zy` is READY.
- **Migration 076:** Applied to production. Verified `source_content_hash`, the unique partial index, and the SECURITY DEFINER RPC with fixed search_path; execution is denied to anon/authenticated and granted to service_role.
- **Implementation:** Trusted HTTPS crawl pages are hashed, chunked, and upserted into the existing platform knowledge store; changed pages refresh their chunks; legacy illustrative examples can be upgraded in place. Up to five changed docs are indexed per hourly run.
- **Validation:** CI #7753 passed: 1,191 passed, 0 failed, 1 skipped out of 1,192 Node tests; database tests, dependency audit, OpenRouter activity-sync tests, syntax check, and secret scan passed. Documentation Gate #1818 passed.
- **Still to verify:** The first post-deployment hourly run, real indexed-doc counts, and retrieval impact in live platform answers. Semantic embeddings/vector ranking, persistent per-run history, and a measured coding/reasoning benchmark remain follow-up phases.


## Draft PR review — 2026-10-29

- Closed as outdated/duplicate: #543 (superseded by main), #631 and #635 (duplicate PR audits), #626 (dated audit snapshot).
- Kept as drafts: #409 (integration security; conflicts in `src/main.js`, `src/routes.js`, changelogs; decide whether its vault replaces the GitHub/connector encryption), #652 (video adapter; tests pass but nothing calls it yet), #673, #671, #651, #650, #599 (docs/plans; most conflict only in `docs/pr-change-log.md`).
- PR statuses for #352, #363, #365, #366 above are historical; recheck GitHub before relying on them.
- Docs aligned with code: `docs/community-learning.md` now matches migration 075 and the Privacy Notice (Guest notice grant, no routine expiry for screened examples); Privacy Notice header set to version 2026-10-28 to match `LEGAL_PRIVACY_VERSION`.
- Repository moved to `nasrinaiv0/nasrinAI` (old `primusco20/nasrinAI` URLs redirect; `gh api repos/...` fails on the redirect, use the GitHub MCP tools).


### Follow-up — owner dashboard SECURITY DEFINER search path (2026-10-30)

- Applied migration `084_harden_owner_dashboard_search_path` (registry version `20261029225731`) to set `public.owner_console_dashboard(integer)` to `search_path=pg_catalog, pg_temp`, replacing the riskier `public, pg_temp` setting.
- Source file: `db/migrations/084_harden_owner_dashboard_search_path.sql`; detailed record: `audits/PRODUCTION_SCHEMA_REPAIR_PROGRESS_2026-10-30.md`.
- Migration runner returned success. Read-only catalog verification confirmed `search_path=pg_catalog, pg_temp`. Owner dashboard auth, endpoint behavior and UI remain **Not verified**.


## OCC Recent Activity repair — 2026-10-30

- **Production repair implemented:** migration `085_restore_owner_console_automation_schema` restores the canonical server-only `automation_workflows` and `automation_runs` tables required by the existing owner dashboard function. Production registry version: `20261029230728`.
- **Root cause:** `owner_console_dashboard(7)` failed with PostgreSQL `42P01` because `public.automation_runs` was missing. The dashboard had existed; blindly replaying migration 080 was not the fix.
- **Verification:** dashboard SQL now executes and returns a JSON object with 7 daily series points and 12 recent-activity entries. Both automation tables have RLS enabled, explicit deny policies, and no `anon`/`authenticated` SELECT grants. Tables are empty; no fake activity was inserted.
- **Source and evidence:** `db/migrations/085_restore_owner_console_automation_schema.sql`; `docs/audits/OCC_AUTOMATION_SCHEMA_REPAIR_2026-10-30.md`.
- **Still not verified:** hosted owner-console browser/API smoke test and deployment. Migration history for 080–082 still needs exact source/live definition reconciliation. Do not fabricate registry records or blindly replay those migrations.


## OCC automation label correction — 2026-10-30

- Corrected the Owner Command Center automation navigation label from `Automation (NCC)` to `Automation & Jobs` and the Search/Traffic-adjacent automation mini-report label from `Automation (NCC)` to `Automation`.
- Scope is limited to OCC presentation labels in `src/owner-console.js` and `public/owner-console.js`. Actual NCC (Nasrin Client Connect) links, routes, API identifiers, and product features are intentionally unchanged.
- UI source correction committed on `fix/occ-automation-label-2026-10-30`. Production deployment and browser verification remain pending; do not claim the hosted screenshot is fixed until deployed and checked.


## Latest monitoring checkpoint — 2026-10-30 12:06 Asia/Manila

Current NasrinAI main remains `b39f4dcd62641d5f601e4e707cb46155ca8e135e`, and production deployment [EYBvVZe2o1qdMrUuXvGoXcqD4qkG](https://vercel.com/nasrin-ai/nasrinai/EYBvVZe2o1qdMrUuXvGoXcqD4qkG) remains READY at that SHA. No new in-scope application change was detected. PR #709 remains the latest verified app change; the OCC live browser/API path is still not independently smoke-tested.

PR #711's prior head `99d3458f2fb15feed4756aba8a1efc2e6473d8c0` passed CI #40992805066 and Documentation Gate #40992805056. This summary/ledger update creates a new docs head; rerun both gates on that exact head before merge.

Keep #702 (reply renderer) and #703 (agent tools/sandbox) out of the merge path until each is reconciled with current main and current-head CI/security review passes. Both are reported non-mergeable and have stale base SHAs. PR #705/#710 are stale duplicate documentation branches; do not merge them as-is. Migration 080–082 parity, leaked-password protection, SECURITY DEFINER review, OCC live smoke, and persistent attachment issue #486 remain open. MOVO PR #63/#64 belong to the MOVO repository and do not change NasrinAI status.




## Monitoring checkpoint — 2026-10-30 13:41 Asia/Manila (05:41 UTC)

### Verified progress: PR #702 merged and production assets smoke-checked

- **PR:** [#702 — Richer reply rendering](https://github.com/nasrinaiv0/nasrinAI/pull/702).
- **Merge timestamp:** 2026-10-30T05:40:15Z.
- **Merge commit / new main SHA:** [`1b9a8b0820565d71c63ab4818d377059a56a4a15`](https://github.com/nasrinaiv0/nasrinAI/commit/1b9a8b0820565d71c63ab4818d377059a56a4a15). Main advanced from `b39f4dcd62641d5f601e4e707cb46155ca8e135e`; the three-commit comparison shows only PR #702's eight changed paths.
- **Changed paths:** `docs/chat.md`, `docs/pr-change-log.md`, `public/app.css`, `public/app.js`, `public/format.js`, `public/index.html`, `src/ai/prompt.js`, `test/reply-rendering-rich.test.js`.
- **Before:** replies used the prior Markdown subset without the new language-aware highlighting, diff presentation, long-code folding, bounded math rendering, callouts, nested-list handling, or h5/h6 support.
- **After:** code blocks can use token spans for 13 language families; diff blocks style additions/removals/hunks; code blocks longer than 28 lines expose a Show all/Show less control; a bounded LaTeX subset renders as MathML with source fallback; callouts, multi-line quotes, nested lists, and h5/h6 are supported. Unknown languages and code over 30,000 characters remain plain. The implementation builds DOM nodes and uses text content rather than assigning `innerHTML`; the system prompt now describes the supported formats.
- **Rationale:** improve readability and presentation of coding, mathematical, and structured answers without broadening the HTML execution surface.
- **Dependencies/migrations:** no package manifest change or database migration was part of PR #702. No database schema, RLS, grants, Auth settings, provider credentials, or user data changed.
- **Exact-head CI:** [run #41009525627](https://github.com/nasrinaiv0/nasrinAI/actions/runs/41009525627) passed; Documentation Gate [#41009525595](https://github.com/nasrinaiv0/nasrinAI/actions/runs/41009525595) passed. CI log reports 1,265 tests total, 1,264 passed, 0 failed, 1 skipped. Database tests (`db/tests/run.sh`), dependency audit at `--audit-level=high`, package-lock check, JavaScript syntax, OpenRouter activity-sync Python tests, and secret scan passed.
- **Production deployment:** [Vercel deployment `dpl_CgPeJbNBMEVDCCZuaNCC2fQUx8hZ`](https://vercel.com/nasrin-ai/nasrinai/CgPeJbNBMEVDCCZuaNCC2fQUx8hZ) reached READY for main SHA `1b9a8b0820565d71c63ab4818d377059a56a4a15`; aliases include `nasrinai.com`.
- **Production smoke evidence:** `https://nasrinai.com/` returned HTTP 200 and references `/format.js?v=20261029-highlight-math`. The referenced script returned HTTP 200 (36,512 characters in the fetched response); string checks found the tokenizer, MathML, callout, and code-expansion implementation, and no `.innerHTML =` assignment. This confirms static delivery only—not a full browser, keyboard, screen-reader, or CSP-console walkthrough.
- **Rollback consideration:** if a rendering regression is found, revert the renderer change through a reviewed follow-up/rollback PR; do not hot-edit production assets.

### PR #703: agent tools reconciled onto new main; exact-head checks passed

- **PR:** [#703 — Agent tools](https://github.com/nasrinaiv0/nasrinAI/pull/703).
- **Current head:** `b9cfc6b0fc6b4fc15de51990d3b118b7226b6ed1`; current base/main: `1b9a8b0820565d71c63ab4818d377059a56a4a15`. GitHub compare reports 5 commits ahead, 0 behind. PR remains open and not draft; this monitoring run did not merge it.
- **Changed paths:** `.env.example`, `docs/pr-change-log.md`, `docs/tools.md`, `public/app.js`, `public/legal/privacy.md`, `src/auto-repair.js`, `src/chat.js`, `src/config.js`, `src/github/api.js`, `src/github/index.js`, `src/main.js`, `src/routes.js`, `src/tools/agent.js`, `test/agent-tools.test.js`, `test/legal.test.js`, `test/page.test.js`.
- **Behavior added:** `fetch_url` reads public pages through the SSRF-safe reader with paging; `web_search` offers configured Google Custom Search results; `run_code` runs signed-in users' JavaScript/Python in a fresh Vercel Sandbox; `github_find_files` searches the connected user's repository tree by glob. Intent detection offers tools when appropriate, and a failed `run_code` can enter the bounded automatic repair loop. Privacy version advances to `2026-10-29.2`.
- **Resource/security controls claimed in source:** code length capped at 20,000 characters; output capped at 2,800 characters; per-actor hourly limits; sandbox created with `networkPolicy: 'deny-all'`, no injected secrets, command timeout of 30 seconds, sandbox timeout of 50 seconds, and cleanup via `sandbox.stop()`. `RUN_CODE_ENABLED=false` disables the code tool. The tool is available to signed-in users only.
- **Exact-head CI:** [run #41009772034](https://github.com/nasrinaiv0/nasrinAI/actions/runs/41009772034) passed; Documentation Gate [#41009772089](https://github.com/nasrinaiv0/nasrinAI/actions/runs/41009772089) passed. CI log reports 1,277 tests total, 1,276 passed, 0 failed, 1 skipped. Database tests, `npm audit --audit-level=high`, lockfile check, JavaScript syntax, OpenRouter activity-sync Python tests, and secret scan passed.
- **Preview boundary:** the read-only Vercel listing filtered to `feat/agent-tools` since 05:40 UTC returned no deployment. Do not claim an exact-head preview or live sandbox run is verified yet. The sandbox tests use a fake sandbox factory; production execution, deny-all network enforcement, timeout, cleanup, and cost/limit behavior have not been independently smoke-tested.
- **Static hardening finding (not proven exploitable in current production):** `src/tools/agent.js` helper `limited()` returns `true` when `store.rateHit` is missing. That is fail-open for the advertised `fetch_url`, `web_search`, and `run_code` limits if a store adapter omits the method. The current memory and Supabase store implementations both implement `rateHit`, and errors from an implemented method return false, so no current production bypass is established. A review note was added to PR #703 [comment](https://github.com/nasrinaiv0/nasrinAI/pull/703#issuecomment-6515935485); recommend changing the missing-method path to fail closed and adding a regression test before final security approval.
- **Dependencies/migrations:** no new database migration or package-manifest change is in the PR diff. CI's database suite passed; this does not replace a live sandbox test.
- **Next actions:** verify a READY preview for the current head; run a controlled sandbox smoke test proving no network/secrets, enforced timeout/output caps, cleanup, and hourly rate limits; add missing-`rateHit` fail-closed coverage; test prompt-injection resistance for fetched/search content; review the privacy notice and repair-loop boundaries. Keep the PR unmerged until those checks are recorded.

### Documentation branch status and carried-forward risks

- PR #711 remains open/draft on head `183f0874267deba52089bea9de388d21588ed10c`. Compared with current main `1b9a8b0820565d71c63ab4818d377059a56a4a15`, its documentation branch is 14 commits ahead and 3 behind (diverged). It must be reconciled and exact-head CI plus Documentation Gate rerun before merge. This checkpoint is appended to the existing draft documentation branch; it does not merge or retarget the PR.
- Repository branch protection was previously reported disabled; not rechecked in this checkpoint. Supabase leaked-password protection was previously reported disabled; not rechecked. Migration registry/source parity for 080–082, targeted SECURITY DEFINER review, authenticated Owner Command Center smoke test, and persistent attachment issue #486 remain open.
- **Monitoring safety boundary:** PR #702 was merged by the repository workflow/maintainer before this audit; this automation did not merge it. No application code, database, migration, Auth setting, secret, or deployment was changed by this monitoring run. Only audit documentation and a PR review comment were written.




## Latest monitoring checkpoint — 2026-10-30 13:46 Asia/Manila

- **Current production main:** `771e1b6646e20f3ffb01285f50306ac953170d79`, merge of PR #703. Production deployment [dpl_FnsK2aWMg6UBzzwGtG5rEGHmTWM5](https://vercel.com/nasrin-ai/nasrinai/FnsK2aWMg6UBzzwGtG5rEGHmTWM5) is READY.
- **PR #702** (rich reply renderer) and **PR #703** (agent tools) are both merged. Exact-head CI and Documentation Gate passed before the #703 merge; test logs report 1,277 total / 1,276 passed / 0 failed / 1 skipped for #703. Production root, `app.js`, and canonical `/legal/privacy.md` returned HTTP 200; the notice contains Google Custom Search API and Vercel Sandbox disclosures.
- **Security follow-up:** the merged `src/tools/agent.js` `limited()` helper returns true if `store.rateHit` is absent. Supported memory/Supabase stores currently implement it, so no live bypass is established; still recommend fail-closed handling plus a missing-method regression test. No authenticated production sandbox smoke test was run.
- **Audit continuity:** PR #711 was closed unmerged at 05:43:38Z; its post-closure ledger commits were not attached to the closed PR head. A new draft documentation PR based on current main restores the central ledger and dated history. Exact-head documentation checks are pending.
- Carried-forward, not freshly rechecked: main branch protection, leaked-password protection, migration 080–082 parity, SECURITY DEFINER review, authenticated OCC smoke, and attachment issue #486. See [detailed 13:46 audit](engineering/updates/2026-10-30-1346-pr703-production-and-ledger-recovery.md).
- Monitoring changed documentation and posted a review note only; no application code, database, Auth setting, secret, merge, or deployment was changed by this audit.
