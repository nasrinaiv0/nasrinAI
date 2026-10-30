# NasrinAI monitoring delta — 2026-10-30 13:46 Asia/Manila (05:46 UTC)

## Executive result

**New production release verified:** PR #703 (agent tools) merged after PR #702 (rich reply rendering), and the latest NasrinAI production deployment is READY at merge commit `771e1b6646e20f3ffb01285f50306ac953170d79`. Static production smoke checks passed. A static defense-in-depth concern in the new rate-limit helper remains unresolved and has been recorded on the merged PR; it is not a proven production exploit because both supported store implementations currently implement the required method.

## 1. PR #703 merged and deployed

- **PR:** [#703 — Agent tools: fetch_url, web_search, run_code, github_find_files](https://github.com/nasrinaiv0/nasrinAI/pull/703).
- **Merged at:** 2026-10-30T05:41:57Z.
- **Merge commit / current production SHA:** [`771e1b6646e20f3ffb01285f50306ac953170d79`](https://github.com/nasrinaiv0/nasrinAI/commit/771e1b6646e20f3ffb01285f50306ac953170d79).
- **Production deployment:** [`dpl_FnsK2aWMg6UBzzwGtG5rEGHmTWM5`](https://vercel.com/nasrin-ai/nasrinai/FnsK2aWMg6UBzzwGtG5rEGHmTWM5), READY, target `production`, alias `nasrinai.com`. Vercel reports READY at this SHA. PR #702's deployment `dpl_CgPeJbNBMEVDCCZuaNCC2fQUx8hZ` is the preceding production deployment at `1b9a8b0820565d71c63ab4818d377059a56a4a15`.
- **Files changed by #703:** `.env.example`, `docs/pr-change-log.md`, `docs/tools.md`, `public/app.js`, `public/legal/privacy.md`, `src/auto-repair.js`, `src/chat.js`, `src/config.js`, `src/github/api.js`, `src/github/index.js`, `src/main.js`, `src/routes.js`, `src/tools/agent.js`, `test/agent-tools.test.js`, `test/legal.test.js`, `test/page.test.js`.
- **Behavior before:** the chat did not have this new general-purpose agent-tool set for public-page retrieval, configured Google Custom Search, short isolated code execution, and GitHub repository file-pattern search.
- **Behavior after:** the assistant can offer `fetch_url`, `web_search`, `run_code`, and `github_find_files` when the request needs them. Failed `run_code` checks can enter the bounded auto-repair loop. The live status labels include “Running the code” and “Reading the repository.” The privacy notice version advances to `2026-10-29.2`.
- **Declared guardrails in source:** public-page reading uses the existing SSRF-safe link reader; fetched/search results are marked as outside data rather than instructions; code execution is signed-in-only; code input is capped at 20,000 characters; output at 2,800 characters; the code sandbox is created with `networkPolicy: 'deny-all'`, no secrets are injected, the command is run with a 30-second timeout, the sandbox timeout is 50 seconds, and cleanup calls `sandbox.stop()`. The hourly limits are per tenant/actor. `RUN_CODE_ENABLED=false` disables the code tool.
- **CI evidence:** [run #41009772034](https://github.com/nasrinaiv0/nasrinAI/actions/runs/41009772034) passed on exact pre-merge head `b9cfc6b0fc6b4fc15de51990d3b118b7226b6ed1); [Documentation Gate #41009772089](https://github.com/nasrinaiv0/nasrinAI/actions/runs/41009772089) passed. The CI test log reports 1,277 tests total, 1,276 passed, 0 failed, 1 skipped. Database tests (`db/tests/run.sh`), dependency audit at `--audit-level=high`, lockfile check, JavaScript syntax, OpenRouter activity-sync Python tests, and secret scan passed. The single skipped test's reason was not independently confirmed here.
- **Production smoke checks:** `https://nasrinai.com/` returned HTTP 200; `https://nasrinai.com/app.js` returned HTTP 200 and contains the new “Running the code” and “Reading the repository” stage labels. `https://nasrinai.com/legal/privacy.md` returned HTTP 200, contains version `2026-10-29.2`, and discloses both “Google's Custom Search API” and “Vercel Sandbox.” The noncanonical path `/legal/privacy` returned 404 while the canonical static `.md` path returned 200; this alone is not treated as a defect. These checks confirm static delivery only.
- **Dependencies/migrations:** no package manifest change or database migration was included in #703. CI's database suite passed, but that is not a live sandbox proof. No production schema, RLS/grants, Auth configuration, or user data was changed by this PR.
- **Runtime flag boundary:** the code default enables `run_code` unless `RUN_CODE_ENABLED=false`, subject to the overall tools switch and sandbox availability. Production environment-variable values were not inspected; actual availability of code execution under production configuration remains unverified.

## 2. Security follow-up: rate-limit helper has a fail-open missing-method branch

- **Finding:** `src/tools/agent.js`, helper `limited()`, returns `true` when `store.rateHit` is absent. In that configuration, the advertised hourly limits for `fetch_url`, `web_search`, and `run_code` would be bypassed.
- **Scope/evidence:** static source inspection on the merged PR. The current `src/store/memory-store.js` and `src/store/supabase-store.js` implementations both expose `rateHit`; errors thrown by an implemented method return false. Therefore, a current production bypass is **not established**; this is a defense-in-depth/configuration-hardening concern.
- **Recorded on PR:** [review comment #6515935485](https://github.com/nasrinaiv0/nasrinAI/pull/703#issuecomment-6515935485).
- **Recommended remediation:** change the missing-method branch to fail closed and return a safe unavailable/rate-limit error; add a regression test for a missing `rateHit` method and for a thrown rate-limit store error. Revalidate per-actor isolation and fixed-window behavior.
- **Live verification not done:** no authenticated production request invoked `run_code`; no live Vercel Sandbox run verified network denial, secret absence, timeout enforcement, output cap, cleanup, or actual hourly limits. The unit tests use a fake sandbox. Do not mark those runtime controls as independently production-verified.

## 3. PR #702 remains deployed

- PR #702 merged at 2026-10-30T05:40:15Z as [`1b9a8b0820565d71c63ab4818d377059a56a4a15`](https://github.com/nasrinaiv0/nasrinAI/commit/1b9a8b0820565d71c63ab4818d377059a56a4a15); the deployment reached READY before PR #703 became the current production SHA.
- The root HTML references `/format.js?v=20261029-highlight-math`; that asset returned HTTP 200. The fetched bundle contains tokenizer, MathML, callout, and code-expand code, and a static scan found no `.innerHTML =` assignment.
- This is a static smoke check, not a full visual, keyboard, screen-reader, or browser-console/CSP walkthrough.

## 4. Audit PR #711 was closed unmerged; ledger recovery

- **PR:** [#711 — Reconcile NasrinAI audit ledger with current main](https://github.com/nasrinaiv0/nasrinAI/pull/711) was closed unmerged at 2026-10-30T05:43:38Z. Its PR metadata still reports the older head `183f0874267deba52089bea9de388d21588ed10c`; the subsequent audit-file commits on its branch are not represented by that closed PR head.
- The new central ledger and detailed dated records therefore were not on current main. This replacement documentation branch starts from current main `771e1b6646e20f3ffb01285f50306ac953170d79` and restores the detailed history from the closed audit branch, then adds this current production checkpoint.
- The replacement is **documentation-only and draft**. Its exact-head CI and Documentation Gate must pass before merge; no merge is performed by monitoring.

## 5. Carried-forward risks (not freshly rechecked)

- Main-branch protection was previously reported disabled; not rechecked in this checkpoint.
- Supabase leaked-password protection was previously reported disabled; not rechecked.
- Migration registry/source parity for 080–082, targeted SECURITY DEFINER review, authenticated Owner Command Center browser/API smoke, and persistent attachment issue #486 remain open.
- Do not treat Vercel READY, static HTTP 200 checks, or unit tests with fake sandbox implementations as proof of authenticated production tool behavior.

## Monitoring safety boundary

PR #703 was merged by the repository workflow/maintainer before this checkpoint; this monitoring run did not merge it. This audit recovery changes documentation only and opens a draft documentation PR. No application code, database, migration, Auth setting, provider secret, production configuration, or deployment was changed by monitoring.
