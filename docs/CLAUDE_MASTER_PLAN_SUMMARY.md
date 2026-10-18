# NasrinAI — Claude Handoff & Progress Snapshot

Last updated: 2026-10-18
Repository: https://github.com/primusco20/nasrinAI

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

## Current task — plugin settings mobile layout
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
- PR #352: Vercel-only environment configuration and NCC AI voice front desk planning; prior context did not establish it was merged or deployed.
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
- Validation pending: required tests, CI and Vercel must pass before considering this complete.


## Update — independent Google app connections and stale test (2026-10-18)
- Fixed the stale assertion in `test/google-team-settings.test.js`: Google Team was removed from the Google catalog and must not be expected there.
- Google backend connections now use a per-service key; status, OAuth callback upsert, token refresh and disconnect are scoped to Gmail or Calendar.
- Gmail and Calendar cards now request separate status and disconnect only their own service. Catalog settings derive granted scopes from the selected app's status.
- Added `db/migrations/042_google_service_connections.sql` to split existing rows based on scopes and change the primary key to `(tenant_id,user_id,service)`. Apply it in Supabase before deploying code. The migration preserves existing encrypted tokens and only creates a Gmail row if Gmail scopes were granted.
- CI and Vercel validation pending; do not treat the feature as production-ready until migration and checks are verified.

- Final test correction commit: `8e1d11b397d0ab27c864e344020746f1b0224492`; the Google catalog regression now asserts Google Maps remains and Google Team is absent. Latest observed Vercel status is pending; no PR-triggered workflow runs were returned by the status wrapper. Full CI has not been confirmed.


## PR #385 conflict resolution handoff (2026-10-18)
- PR #385 branch diverged from `main` (8 commits ahead, 21 behind). The current `main` already contains the Google Team catalog removal and stale-test correction; preserve current main application code and tests.
- Reapply only the Team directory copy changes to `public/index.html` and record this conflict resolution. Do not overwrite newer `main` app code with stale PR snapshots.
- Team directory remains browser-local/account-scoped; it is not yet automatically consumed by every integration.
- Validation required after conflict resolution: run CI and verify the mergeability status before merging.


## Plugin settings layout cleanup (2026-10-18)
- Removed Google Meet, Google Keep and Google Maps from the lower generic catalog because their per-app connection cards already render in the upper plugin list. The independent connection cards and their status/actions remain intact.
- Removed Google Search from the generic catalog, as requested, and kept Google integrations in their dedicated connection cards.
- Added a separate **Developer tools** group with GitHub, Vercel, Render, Supabase and Cloudflare, each opening its official dashboard in a new tab.
- The separate GitHub coding connection card and its OAuth/account controls remain unchanged. The developer-catalog GitHub row links to GitHub; it does not claim Vercel, Render, Supabase or Cloudflare are connected to NasrinAI.
- Grouped the remaining catalog entries under Microsoft 365, Design & creativity, and Social & messaging.
- Validation is pending: run the targeted and full tests in CI, then visually verify the layout in iPhone Safari before merging or deploying.


## Plugin read/write capabilities (PR #386, 2026-10-18)
- Added Gmail message reading, sending, and read/unread status updates, plus Google Calendar event updates and deletion.
- All external mutations use the existing server-side one-time confirmation flow; model output cannot approve its own action.
- Each operation checks the current user's actual Google OAuth scopes before calling the provider. Missing or insufficient scopes fail closed; tokens remain server-side.
- Added regression coverage for tool registration, Gmail send payloads, denied scopes, Calendar deletion, and incomplete event-time validation.
- Catalog-only providers remain clearly marked as unsupported/coming soon until provider-specific functionality is implemented.
- Local validation: `npm test` passed 687 tests with 1 skipped. CI must also pass before merge; production OAuth verification and configuration remain separate requirements.
