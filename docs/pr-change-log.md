# Pull request change log

This file records the intent and outcome of repository pull requests and is updated alongside code changes. Entries describe the work at PR level; the linked PR is the source of truth for the full diff and review history.

## Required documentation workflow

For every future NasrinAI PR:

1. Update the relevant feature, architecture, operations, security, or database Markdown document in the same PR.
2. Add or update an entry in this change log with the PR link, intent, key files/areas, validation status, and any known follow-up.
3. For UI work, record the intended interaction/layout and the regression test that protects it.
4. For API/backend work, document behavior, authorization, errors, limits, and compatibility.
5. For migrations, document the migration and audit RLS enabled/forced state as appropriate, policies, grants/revokes, tenant/owner isolation, and database tests.
6. State what was actually tested. Do not call a check passing unless its result was observed. Do not merge while required checks are failing or pending.

## Proposed PR — Feature audit (`fix/feature-audit`)

- **Intent:** backlog item 1 of the 2026-10-12 upgrade: record what works and what doesn't on the user side before fixing anything. Adds `docs/feature-audit.md`.
- **Findings:** F1 header overflows on phones ≤ 390 px in a signed-out chat (page 404 px wide); F2 tap targets under 44 pt; F3 the signed-out Billing page has no way forward. It also maps the owner's GPT-capability list to NasrinAI and sets the iOS design principles and work order.
- **Validation:** documentation only, no code change. Findings come from a local fake-provider run in headless Chromium (every control clicked, signed out and signed in, at 390 and 1280 px; header measured at 320–768 px). Local `npm test` (439 pass) and `npm run check:secrets` pass. CI and the Vercel preview must pass before merge.
## Proposed PR — Claude Code handoff (`docs/claude-code-upgrade-handoff`)

- **Intent:** move the 2026-10-12 upgrade into Claude Code sessions. Adds `docs/claude-code-handoff.md` with the owner's rules for the upgrade, what is done (#219, #220, #221), and a 10-item category-branch backlog mapped to the existing code.
- **`CLAUDE.md`:** adds a "Start here" pointer and records the owner's 2026-10-12 branch rule (one pushed branch per category, PR into `main`, owner merges, no failing checks).
- **Validation:** documentation only, with no code, schema or config change. Local `npm test` and `npm run check:secrets` pass. CI and the Vercel preview must pass before merge.

## [#220](https://github.com/primusco20/nasrinAI/pull/220) — Center the sign-in security check; smaller on phones (open)

- **Intent:** the Cloudflare Turnstile box was left-aligned under the email form. The owner asked for it lower-center and smaller on phones.
- **Change:** CSS only (`public/app.css`). `.signin-captcha` is a centered flex row. At ≤480 px it uses `transform: scale(0.8)` from the top center and reclaims the scaled space. There are no markup, script, CSP or Turnstile option changes.
- **Layout check (headless Chromium, local fake-provider run):** on a phone at 390 px the widget renders 240×52 centered (x 75–315); on desktop at 1280 px it renders 300×65 centered in the sheet.
- **Regression test:** `test/page.test.js` checks the centering rule, the phone scale rule, and that the widget sits between the email form and the status message. It fails without the CSS change.
- **Validation:** local `npm test` and `npm run check:secrets` pass. CI and the Vercel preview must pass before merge.

## [#219](https://github.com/primusco20/nasrinAI/pull/219) — Email sign-in CAPTCHA token field (merged)

- **Intent:** fix "Security check failed" on every email-code sign-in. Supabase Auth logs (2026-10-11, 12:33–13:28 UTC, including after PR #218) show each `/otp` rejected with `captcha protection: request disallowed (no captcha_token found)`. `src/auth/supabase-auth.js` sent the token as a top-level `captcha_token`. Supabase Auth reads it only from `gotrue_meta_security.captcha_token`.
- **Change:** `sendCode` now sends `gotrue_meta_security: { captcha_token }`. There is no change to the Google path (verified server-side via Siteverify), to cookies, tokens, logging, the CSP or the database.
- **Tests:** 3 regression tests in `test/signin.test.js`: the client body shape, route forwarding with Turnstile on (and refusal without a token), and safe mapping of a Supabase CAPTCHA rejection. The first two were confirmed to **fail on the old code** and pass with the fix. Locally `npm test` and `npm run check:secrets` pass. CI and the Vercel preview must pass before merge.
- **Docs:** `docs/security.md`, plus a troubleshooting note in `docs/operations.md`.
- **Follow-up:** after deploy, request one email code and confirm Supabase Auth logs show `/otp` 200. If the error changes to a secret mismatch, re-enter the Turnstile secret in Supabase → Authentication → Bot and Abuse Protection.

## Proposed PR — Media bucket size limit and Supabase security baseline (`security/media-bucket-size-limit`)

- **Intent:** record the 2026-10-12 read-only production audit and commit the one fix already applied there.
- **Migration 029:** sets `file_size_limit = 52428800` (50 MB) on the `media` bucket. It is repeatable, skips cleanly without Supabase Storage, and changes nothing else. It was applied to production on 2026-10-12 via the Supabase connector, where the history lists it as `026_media_bucket_size_limit`. The bucket was empty, and privacy and the MIME list were verified unchanged afterwards. Rollback is in the file header.
- **RLS/grants:** unchanged. The audit found RLS on all 34 tables with deny-all policies for `anon`/`authenticated`, no browser-role grants, and no browser-executable functions.
- **DB test:** `db/tests/029_media_bucket_size_limit.test.sql` checks the limit, privacy, MIME list, other buckets untouched, and repeatability. Locally `db/tests/run.sh` passes on Postgres 16, and the test was confirmed to fail when the migration sets the wrong limit.
- **Docs:** new `docs/supabase-security-baseline.md`; `docs/database.md`.
- **Owner follow-up:** S1, leaked-password protection, is a dashboard setting (Pro plan).

## Proposed PR — Turnstile sign-in protection

- Initial CI surfaced three compatibility failures: the Google PKCE test still expected a GET/302 flow, the strict-CSP test expected `script-src` to contain only `'self'`, and Vercel's CDN CSP did not yet match the server CSP. Updated the test to exercise the new POST/JSON start flow, retained the narrow Turnstile CSP policy in both server and Vercel headers, and aligned the regression assertion. Re-run all CI checks before merge.

| Pending | Add Cloudflare Turnstile to email OTP and Google OAuth initiation | Draft in progress | Adds paired environment configuration, explicit widget rendering, server-side verification for Google OAuth start, Supabase CAPTCHA token forwarding for email OTP, narrow CSP allowances, regression tests, and security/operations documentation. No production settings or deployment changed. CI must pass before merge. |

## Recent PR backfill

| [#210](https://github.com/primusco20/nasrinAI/pull/210) | Explicit server-only RLS deny policies | Open | Adds migration 028 for explicit deny policies and revokes browser-role table grants on server-only tables flagged by Supabase; handles optional feature tables that are absent in a clean migration replay. The first database CI run failed because `portfolio` is a production-only/optional table absent from the clean schema; migration and test now skip absent optional tables while validating all present tables. Recheck CI on the latest commit before merging. Production application remains separate and unconfirmed. |

| [#199](https://github.com/primusco20/nasrinAI/pull/199) | Atomic global spend reservations and daily realtime voice allowances | Open | Sets global estimated-spend defaults to $3 daily / $21 rolling 7 days / $90 rolling 30 days, retaining overall and per-tier request caps. Adds migration 026 for atomic account-scoped daily voice reservations (Quick 5m, Pro 15m, Max 20m, Ultra 30m; Manila midnight reset), conservative per-minute token-quota reservations shared with text, memory/Supabase adapters, fail-closed routing, and regression/database security tests. USD budgets may shorten or refuse voice sessions; exact browser-direct per-turn provider usage remains unavailable. Required CI checks must pass before merge; production Supabase migration/configuration remain unverified. |

| [#196](https://github.com/primusco20/nasrinAI/pull/196) | Harden ZIP central directory and entry bounds | Merged | Rejects inconsistent central-directory metadata, partial scans, unsupported ZIP64 sentinel values, local-header mismatches, and payloads crossing archive boundaries. Adds regression tests and updates `docs/chat.md`. Observed final PR-head checks: GitHub Actions test job passed (including `npm test` and secret scan), database tests passed, and Vercel preview passed. |

| [#198](https://github.com/primusco20/nasrinAI/pull/198) | Add cross-account Memory isolation regression coverage | Merged | Adds a negative test for another account in the same tenant and the same actor ID in a different tenant; updates `docs/security.md`. CI pending; live Supabase isolation remains unverified. No production authorization code changed. |

| [#197](https://github.com/primusco20/nasrinAI/pull/197) | Record merged ZIP checks and security/deployment audit findings | Merged | Corrects PR #196's recorded outcome, clarifies realtime token-accounting and distributed USD-budget limitations, and corrects the Supabase migration checklist. Documentation only; live production configuration remains unverified. GitHub Actions (`npm test`, secret scan, database tests) and Vercel preview passed on the audit revision. |

| [#195](https://github.com/primusco20/nasrinAI/pull/195) | Reject truncated ZIP archives safely | Merged | Rejects buffers shorter than the ZIP end-of-central-directory minimum, adds truncated-header regression coverage, and documents safe handling. |
| [#194](https://github.com/primusco20/nasrinAI/pull/194) | Handle malformed EPUB manifest paths safely | Merged | Skips malformed percent-encoded EPUB manifest paths, adds a regression test, and documents malformed archive handling. CI passed before merge. |
| [#192](https://github.com/primusco20/nasrinAI/pull/192) | Scope coding and file analysis without artifact generation | Merged | Documentation-only scope correction. Existing code/file analysis remains non-executing; no new runner, OCR, artifact-generation, publishing, schema, or RLS behavior was introduced. |

Status reflects the repository state at the latest documentation update.

| PR | Change | Status | Documentation note |
| --- | --- | --- | --- |
| [#191](https://github.com/primusco20/nasrinAI/pull/191) | Show current plan beside Billing in Settings | Merged | Displays the signed-in user's current plan from existing `/v1/plans` data in the Billing navigation row; no new request or billing logic. Regression assertions added. |
| [#190](https://github.com/primusco20/nasrinAI/pull/190) | Separate Usage and Billing settings pages; inline Usage spinner and independent loading | Merged | Adds dedicated Usage/Billing navigation, direct string/page-boundary regression assertions, and documentation workflow. Latest observed CI: test job passed (including npm test and secret scan); database job's test step passed and the job was still finishing cleanup when checked. Vercel passed on the latest commit checked. The test job passed on the previously checked commit; the latest commit's required checks must be rechecked before merging. |
| [#189](https://github.com/primusco20/nasrinAI/pull/189) | Secure coding and file workspace architecture | Open (superseded) | Original scope included artifact generation and isolated execution. Superseded by the analysis-only scope in [the replacement PR](https://github.com/primusco20/nasrinAI/pull/192); artifact generation, OCR, publishing, and code execution are excluded from this plan.
| [#188](https://github.com/primusco20/nasrinAI/pull/188) | Usage refresh indicator and Billing section | Merged | Initial UI attempt did not fully separate the destinations; follow-up is PR #190. |
| [#187](https://github.com/primusco20/nasrinAI/pull/187) | Revert PR #186 Settings UI changes | Merged | Restored the prior Settings UI files; see the PR diff for exact scope. |
| [#186](https://github.com/primusco20/nasrinAI/pull/186) | Restyle Settings and hide token caps | Merged | Followed by the rollback in PR #187 after the resulting UI was not wanted. |
| [#185](https://github.com/primusco20/nasrinAI/pull/185) | Marketing-aware cache for briefs and creative assets | Merged | Cache safety, ownership, expiration, size limits, and provider behavior must be verified against the implementation before production readiness is claimed. |
| [#184](https://github.com/primusco20/nasrinAI/pull/184) | Usage meters without consumption disclaimers | Merged | Usage presentation change. |
| [#183](https://github.com/primusco20/nasrinAI/pull/183) | Usage and image consumption status bars | Closed, not merged | Not part of the merged implementation unless included by a later PR. |
| [#182](https://github.com/primusco20/nasrinAI/pull/182) | Desktop workspace navigation | Merged | Responsive navigation change. |
| [#181](https://github.com/primusco20/nasrinAI/pull/181) | Home Screen Settings section spacing | Merged | Settings layout refinement. |
| [#180](https://github.com/primusco20/nasrinAI/pull/180) | Desktop workspace navigation | Closed, not merged | Superseded/duplicated by later work; consult PR history for exact disposition. |
| [#179](https://github.com/primusco20/nasrinAI/pull/179) | Tablet workspace sizing | Merged | Responsive layout change. |
| [#178](https://github.com/primusco20/nasrinAI/pull/178) | Settings spacing in iOS Home Screen mode | Merged | Mobile layout refinement. |
| [#177](https://github.com/primusco20/nasrinAI/pull/177) | Desktop workspace navigation | Closed, not merged | Superseded/duplicated by later work; consult PR history for exact disposition. |
| [#176](https://github.com/primusco20/nasrinAI/pull/176) | Tablet workspace sizing | Closed, not merged | Superseded/duplicated by later work; consult PR history for exact disposition. |
| [#175](https://github.com/primusco20/nasrinAI/pull/175) | Mobile safe areas and landscape adaptation | Merged | Responsive layout change. |
| [#174](https://github.com/primusco20/nasrinAI/pull/174) | Adaptive desktop, tablet, and mobile layouts | Closed, not merged | Consult PR history for exact disposition. |
| [#173](https://github.com/primusco20/nasrinAI/pull/173) | Weekly token allowances and live usage UI | Merged | Usage and plan-limit behavior; API/security details belong in the relevant feature docs. |
| [#172](https://github.com/primusco20/nasrinAI/pull/172) | Saved-chat Memory recall and routing | Merged | Memory retrieval behavior; preserve permission and ownership checks. |
| [#171](https://github.com/primusco20/nasrinAI/pull/171) | Remove Appearance subtitle and tighten spacing | Merged | Settings presentation change. |
| [#170](https://github.com/primusco20/nasrinAI/pull/170) | Cross-chat memory recall and four-day summaries | Merged | Memory retrieval behavior; preserve user permissions and scope. |
| [#169](https://github.com/primusco20/nasrinAI/pull/169) | Generic cross-chat memory recall | Merged | Memory retrieval behavior; preserve user permissions and scope. |
| [#168](https://github.com/primusco20/nasrinAI/pull/168) | Permission-aware memory acknowledgements | Merged | Memory behavior and permission handling. |
| [#167](https://github.com/primusco20/nasrinAI/pull/167) | Recall saved chats and generated images | Merged | Recall behavior; verify ownership and Memory preferences. |
| [#166](https://github.com/primusco20/nasrinAI/pull/166) | Restore Billing settings, spacing, and account switching | Merged | Settings/account behavior; see PR for exact implementation scope. |
| [#165](https://github.com/primusco20/nasrinAI/pull/165) | Respect Memory setting in saved-chat recall | Merged | Memory preference must gate retrieval. |
| [#164](https://github.com/primusco20/nasrinAI/pull/164) | Saved conversation recall and proactive Library inventory | Merged | Recall and Library behavior; preserve ownership and permissions. |
| [#163](https://github.com/primusco20/nasrinAI/pull/163) | Memory settings authentication and Library context | Merged | Authentication and Library context behavior. |
| [#162](https://github.com/primusco20/nasrinAI/pull/162) | Cache, SSRF, definer, and video ownership hardening | Merged | Security-sensitive change; keep security/database documentation aligned with implementation. |
| [#161](https://github.com/primusco20/nasrinAI/pull/161) | Harden SECURITY DEFINER search paths | Merged | Database security hardening; review function privileges and search paths for future migrations. |


## Earlier PR index (#91–#160)

The following older PRs are backfilled by title and outcome. Each link opens the full diff, review, and any original test evidence. The short labels below are summaries of the PR titles, not a substitute for reviewing the implementation.

| PR | Change | Status |
| --- | --- | --- |
| [#160](https://github.com/primusco20/nasrinAI/pull/160) | Creative intent routing and generation consent | Merged |
| [#159](https://github.com/primusco20/nasrinAI/pull/159) | Video conversation ownership validation | Merged |
| [#158](https://github.com/primusco20/nasrinAI/pull/158) | Special-use IPv4 filtering and semantic cache security | Merged |
| [#157](https://github.com/primusco20/nasrinAI/pull/157) | SSRF destination filtering | Merged |
| [#156](https://github.com/primusco20/nasrinAI/pull/156) | Semantic cache function search paths | Merged |
| [#155](https://github.com/primusco20/nasrinAI/pull/155) | Server-only RLS boundary | Merged |
| [#154](https://github.com/primusco20/nasrinAI/pull/154) | AI disclaimer under each reply | Merged |
| [#153](https://github.com/primusco20/nasrinAI/pull/153) | Per-reply accuracy reminder and FAQ label | Merged |
| [#152](https://github.com/primusco20/nasrinAI/pull/152) | Chat AI accuracy reminder | Merged |
| [#151](https://github.com/primusco20/nasrinAI/pull/151) | Privacy settings after expired sign-in; role answers | Merged |
| [#150](https://github.com/primusco20/nasrinAI/pull/150) | Improvement-example deletion and consent withdrawal | Merged |
| [#149](https://github.com/primusco20/nasrinAI/pull/149) | Improvement review and deletion safeguards | Merged |
| [#148](https://github.com/primusco20/nasrinAI/pull/148) | Support email and creator attribution | Merged |
| [#147](https://github.com/primusco20/nasrinAI/pull/147) | FAQ links to in-app Help & Support | Merged |
| [#146](https://github.com/primusco20/nasrinAI/pull/146) | Isolated improvement review and deletion lineage | Merged |
| [#145](https://github.com/primusco20/nasrinAI/pull/145) | Fail-closed improvement-example redaction and eligibility | Merged |
| [#144](https://github.com/primusco20/nasrinAI/pull/144) | Responsive standalone HTML FAQ | Merged |
| [#143](https://github.com/primusco20/nasrinAI/pull/143) | Private improvement-example storage and expiry | Merged |
| [#142](https://github.com/primusco20/nasrinAI/pull/142) | Improvement consent safeguards and support contacts | Merged |
| [#141](https://github.com/primusco20/nasrinAI/pull/141) | Markdown-to-HTML downloads and support contact | Merged |
| [#140](https://github.com/primusco20/nasrinAI/pull/140) | Legal links in assistant replies | Merged |
| [#139](https://github.com/primusco20/nasrinAI/pull/139) | Consented improvement-cache safeguards documentation | Merged |
| [#138](https://github.com/primusco20/nasrinAI/pull/138) | Retention cleanup retry | Merged |
| [#137](https://github.com/primusco20/nasrinAI/pull/137) | Retention cleanup documentation | Merged |
| [#136](https://github.com/primusco20/nasrinAI/pull/136) | Configured image expiry | Merged |
| [#135](https://github.com/primusco20/nasrinAI/pull/135) | Link-reader SSRF checks | Merged |
| [#134](https://github.com/primusco20/nasrinAI/pull/134) | Switch-account chevron alignment | Merged |
| [#133](https://github.com/primusco20/nasrinAI/pull/133) | Remove legacy demo-auth server entry point | Merged |
| [#132](https://github.com/primusco20/nasrinAI/pull/132) | Composer gradients and opacity | Merged |
| [#131](https://github.com/primusco20/nasrinAI/pull/131) | Composer background colors | Merged |
| [#130](https://github.com/primusco20/nasrinAI/pull/130) | Reveal composer controls together | Merged |
| [#129](https://github.com/primusco20/nasrinAI/pull/129) | Animate composer controls together | Merged |
| [#128](https://github.com/primusco20/nasrinAI/pull/128) | Voice mute-button animation | Merged |
| [#127](https://github.com/primusco20/nasrinAI/pull/127) | NasrinAI Space galaxy logo animation | Merged |
| [#126](https://github.com/primusco20/nasrinAI/pull/126) | Welcome action buttons timing | Merged |
| [#125](https://github.com/primusco20/nasrinAI/pull/125) | Composer border consistency | Merged |
| [#124](https://github.com/primusco20/nasrinAI/pull/124) | Cloud logo tile background and centering | Merged |
| [#123](https://github.com/primusco20/nasrinAI/pull/123) | Matte-glass composer and dark theme | Merged |
| [#122](https://github.com/primusco20/nasrinAI/pull/122) | Revert PR #120 chat UI | Merged |
| [#121](https://github.com/primusco20/nasrinAI/pull/121) | Cloud logo reference and adaptive tile | Merged |
| [#120](https://github.com/primusco20/nasrinAI/pull/120) | Chat welcome screen and composer borders | Merged |
| [#119](https://github.com/primusco20/nasrinAI/pull/119) | Cloud app logo centering | Merged |
| [#118](https://github.com/primusco20/nasrinAI/pull/118) | Composer glass borders and corner gradients | Merged |
| [#117](https://github.com/primusco20/nasrinAI/pull/117) | Cloud logo in NasrinAI Space | Merged |
| [#116](https://github.com/primusco20/nasrinAI/pull/116) | Remove composer top-edge highlight | Merged |
| [#115](https://github.com/primusco20/nasrinAI/pull/115) | Crisp vector Cloud logo | Merged |
| [#114](https://github.com/primusco20/nasrinAI/pull/114) | NasrinAI Space branding and adaptive Cloud logos | Merged |
| [#113](https://github.com/primusco20/nasrinAI/pull/113) | Add files via upload | Merged |
| [#112](https://github.com/primusco20/nasrinAI/pull/112) | Library sheet layout UX | Merged |
| [#111](https://github.com/primusco20/nasrinAI/pull/111) | Library production layout | Merged |
| [#110](https://github.com/primusco20/nasrinAI/pull/110) | Library padding, copy, and categories | Merged |
| [#109](https://github.com/primusco20/nasrinAI/pull/109) | Library sheet layout and filtering | Merged |
| [#108](https://github.com/primusco20/nasrinAI/pull/108) | Connect logo and adaptive Space icon backgrounds | Merged |
| [#107](https://github.com/primusco20/nasrinAI/pull/107) | Confirm before logging out | Merged |
| [#106](https://github.com/primusco20/nasrinAI/pull/106) | Adaptive Connect logo for light/dark UI | Merged |
| [#105](https://github.com/primusco20/nasrinAI/pull/105) | Startup crash, tier picker, and sign-in | Merged |
| [#104](https://github.com/primusco20/nasrinAI/pull/104) | Keep tier picker visible on model-catalog failure | Merged |
| [#103](https://github.com/primusco20/nasrinAI/pull/103) | Revert tier-picker/sign-in fallback | Closed, not merged |
| [#102](https://github.com/primusco20/nasrinAI/pull/102) | Revert stale-session tier-picker fix | Closed, not merged |
| [#101](https://github.com/primusco20/nasrinAI/pull/101) | Revert UI/account/Space cleanup | Closed, not merged |
| [#100](https://github.com/primusco20/nasrinAI/pull/100) | Keep tier picker visible during provider outages | Merged |
| [#99](https://github.com/primusco20/nasrinAI/pull/99) | Safari OAuth PKCE cookie and independent tier loading | Merged |
| [#98](https://github.com/primusco20/nasrinAI/pull/98) | iPhone Safari Google sign-in and AI tiers | Merged |
| [#97](https://github.com/primusco20/nasrinAI/pull/97) | Recover tier picker after stale session | Merged |
| [#96](https://github.com/primusco20/nasrinAI/pull/96) | Tier picker and resilient sign-in fallback | Merged |
| [#95](https://github.com/primusco20/nasrinAI/pull/95) | UI, account, and Space cleanup | Merged |
| [#94](https://github.com/primusco20/nasrinAI/pull/94) | Monochrome app grid in NasrinAI Space | Merged |
| [#93](https://github.com/primusco20/nasrinAI/pull/93) | Photo attachments and multi-format file creation | Merged |
| [#92](https://github.com/primusco20/nasrinAI/pull/92) | Account and NasrinAI Space settings | Merged |
| [#91](https://github.com/primusco20/nasrinAI/pull/91) | Secure product knowledge | Merged |


## PR #190 — Usage and Billing separation

### Intended behavior

- Settings presents **Usage** and **Billing** as separate navigation destinations.
- The Billing navigation row displays the signed-in user's current plan (Free, Pro, Max, or Ultra) on the right, before the chevron. It uses the plan returned by the existing `/v1/plans` request, hides the value when no signed-in account or known plan is available, and does not introduce a new request or change billing rules.
- Usage contains usage meters and its inline loading indicator.
- Billing contains the current plan, upgrade/renew action, payment history, and billing disclosures.
- Opening Usage loads usage data; opening Billing loads billing data.
- Periodic usage refresh runs only while the Usage page is visible.

### Scope

The UI change is limited to `public/index.html`, `public/app.js`, and `public/app.css`, with focused regression coverage at `test/settings-usage-billing-separation.test.js`. The current-plan label is populated from the existing signed-in plan data. No backend endpoint, billing rule, schema, or RLS policy is intended to change.

### Validation

The original test used over-escaped regular expressions. The test is being simplified to explicit string and page-boundary assertions to avoid fragile regex escaping. Verify the repository's test command and all required CI checks after the correction; do not treat the fix as verified until those checks return results.


## Voice-model catalog visibility audit

- Keep OpenAI and Gemini voice choices in Settings whenever the server knows the catalog, even if a provider is not configured; unavailable choices must be visibly disabled and must not trigger provider requests.
- Do not gate provider-catalog rendering on browser `AudioContext` support. Browser audio support affects playback, not whether configuration choices can be displayed.
- The public `/v1/status` response returns the known voice catalog and a separate availability flag. It exposes no provider credentials or secret configuration.
- Regression tests cover the rendering gate and status response shape. Verify all CI checks before merge; no production settings or secrets are changed by this UI fix.


### CI correction — voice catalog status contract

- The first CI run exposed one outdated assertion in the existing /v1/status test: it expected an empty voice catalog and default null, although the intended fix now publishes known voice IDs and the coral default while correctly marking provider voices unavailable.
- Updated that test to normalize only the voice-catalog fields before checking the unrelated status contract. Dedicated regression tests continue to check catalog visibility and response structure.
- Re-run the full test suite and required CI checks before merge; this is a test expectation correction, not a rollback of the voice catalog behavior.


## Turnstile sign-in initialization regression

- Cache the public Turnstile site key when the app's initial `/v1/status` request completes.
- Keep Turnstile widget rendering deferred until the sign-in sheet opens, so the widget is initialized inside its visible container.
- Allow `loadAuthMethods()` to finish Turnstile setup even when sign-in methods were already cached by the initial status request. This prevents Google/email sign-in from submitting without the required CAPTCHA token.
- No secrets, server-side verification rules, OAuth redirect URLs, database schema, or unrelated UI behavior are changed.
- Validate with the focused regression checks and full CI before merge; production behavior is not considered fixed until a deployment is tested.


## Google CAPTCHA failure diagnostics

- Add server-side warning categories for the Google OAuth start route when the CAPTCHA token is missing/invalid or Cloudflare verification fails.
- Logs contain only a fixed reason category; CAPTCHA tokens, Turnstile secrets, and provider response payloads are never logged.
- This is diagnostic instrumentation only. It does not bypass CAPTCHA verification or change DNS, OAuth redirects, production secrets, or database state.
- Validation required: run the focused auth tests and full CI, then test the deployed sign-in flow and inspect the corresponding Vercel function logs before treating the issue as resolved.


## Sign-in CAPTCHA placement

- Move the existing Turnstile widget container from between Google sign-in and the email form to immediately below the email sign-in form, so the verification UI sits beneath the email action on mobile.
- Keep the same widget element and ID; client initialization, callbacks, token submission, and server-side verification remain unchanged.
- No DNS, authentication configuration, or unrelated layout changes.
- Validate with CI and test both Google and email sign-in on a narrow mobile viewport before considering the change complete.


## Google OAuth callback failure diagnostics

- Log a fixed reason category when the Google callback has no authorization code, no PKCE verifier cookie, or an invalid-length authorization code.
- Never log the authorization code, PKCE verifier, cookies, or provider secrets.
- This makes the existing callback early-return path observable without changing OAuth validation, cookie policy, CAPTCHA verification, or redirect behavior.
- Validate with focused auth tests and full CI before merge; then inspect the production callback log to select any further fix based on evidence.


## Email sign-in CAPTCHA/upstream error handling

- Preserve a constrained upstream status and error-code category for email OTP rejection so production logs can distinguish a CAPTCHA rejection from other email-send failures.
- Map upstream errors explicitly mentioning CAPTCHA/Turnstile to a safe security-check message rather than the generic email-delivery message.
- Logs never include the email address, CAPTCHA token, CAPTCHA secret, raw upstream response, or provider message text.
- This does not bypass CAPTCHA or change production configuration. Validate with focused auth tests and full CI before merge; if Supabase rejects the token, verify its CAPTCHA provider configuration against the Cloudflare Turnstile secret.
