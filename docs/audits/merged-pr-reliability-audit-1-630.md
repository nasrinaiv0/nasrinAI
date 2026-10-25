# Merged PR Reliability Audit: #1–#630

**Audit started:** 2026-10-26  
**Repository:** `nasrinaiv0/nasrinAI`  
**Baseline main SHA:** `8a8cd18227b4bbc040c9a6534cd834e5f16777b8`  
**Status:** In progress — inventory and first failure triage completed; full code-level review and corrective PRs remain open.

**Current-main baseline verification:** Commit `8a8cd18227b4bbc040c9a6534cd834e5f16777b8` has completed `test`, `database`, and `dependency-audit` checks all green (completed 2026-10-25 19:13 UTC). The current-main test check is green; historical red checks must be treated as historical evidence until a defect is reproduced on current main.

## Scope and method

The request is to audit pull requests numbered #1 through #630 and correct defects that reached `main`. The initial GitHub REST inventory retrieved 625 closed PR records in the range and identified 583 merged PRs. This is not yet a complete inventory of every PR number because open PRs are not part of the closed-PR pages.

A GitHub search for `is:merged status:failure` returned 58 matching PRs. This is a **triage queue**, not a count of confirmed production defects: check statuses can be historical, rerun, stale, or unrelated to required tests. For each candidate, inspect the merge commit's checks and logs, separate test failures from dependency/security failures and deployment-policy blocks, then verify whether the relevant defect still exists on current `main`.

## Confirmed first-pass findings

| PR | Merge commit | Failed check observed | Evidence / interpretation | Next action |
|---|---|---|---|---|
| [#620 Add OpenRouter session routing](https://github.com/nasrinaiv0/nasrinAI/pull/620) | `309837721b76e8cde393623a3f0822fd56d896f1` | `test` failed | Run summary: 1,104 tests, 1,102 passed, 1 failed, 1 skipped. Failure name was not present in the retained tail of the job log; retrieve the full failure block before changing code. | Identify exact failed assertion, reproduce against current main, add regression test and fix if still present. |
| [#584 Fix raw structured UI payloads in chat](https://github.com/nasrinaiv0/nasrinAI/pull/584) | `66c200f11c54366d5d291eb069ed049fd1fa61d2` | `test` failed | Run summary: 1,004 tests, 1,001 passed, 2 failed, 1 skipped. Need exact failure names and current-main reproduction. | Identify both failures, determine whether one is a shared root cause, fix with regression tests. |
| [#559 Fix image routing without local pricing gates](https://github.com/nasrinaiv0/nasrinAI/pull/559) | `bb0786a7c219e211d76af1a2ea4da6d8af1a8efb` | `test` failed | Run summary: 979 tests, 977 passed, 1 failed, 1 skipped. Need exact failure name and current-main reproduction. | Identify and reproduce; fix only if still present. |
| [#570 Add live OpenRouter model discovery and capability-aware routing](https://github.com/nasrinaiv0/nasrinAI/pull/570) | `d8fb4bff58f1489346df8509545559154eef7f0f` | `dependency-audit` failed | `npm audit --audit-level=high` reported 4 high findings involving `zod <4.6.6` transitively under `@vercel/cli-config` → `@vercel/oidc` → `@vercel/sandbox`. The suggested `npm audit fix --force` was breaking and must not be applied blindly. | Check whether current lockfile still contains the vulnerable dependency path; choose a compatible upgrade/override and validate Vercel sandbox behavior. |

### False-positive / stale-status example

PR #563 appears in the search result, but its merge-commit check-runs currently show test, dependency audit, and database checks all succeeded. This demonstrates why the search result must be validated rather than treating every hit as an unresolved defect.

## Search result triage queue

The initial `is:merged status:failure` query returned these PRs for individual validation:

#620, #584, #570, #563, #559, #468, #379, #375, #354, #351, #350, #349, #348, #347, #346, #345, #344, #343, #342, #341, #340, #339, #338, #337, #336, #334, #86, #85, #84, #83, #82, #81, #80, #79, #78, #77, #76, #75, #74, #73, #72, #71, #70, #69, #67, #66, #65, #64, #63, #62, #61, #60, #59, #56, #40, #22, #20, #9.

This list is based on GitHub's status search and is not itself a verdict. Some hits may have later successful reruns, while other merged PRs may have passed their historical checks but still contain a latent runtime defect.

## Required audit workflow for every merged PR #1–#630

1. Build the complete PR inventory, including open, closed-unmerged, and merged PRs.
2. For each merged PR, capture merge SHA, head SHA, merge time, check conclusions, and failed job logs where available.
3. Classify failures as: test, database/migration, dependency/security, build, preview/production deployment, or external policy/infrastructure.
4. Reproduce any failure on current `main`; do not assume a historical failure is still present.
5. Review the PR diff for latent correctness, authorization/RLS, secrets, provider routing, guest/Quick entitlements, telemetry/billing integrity, and user-facing regressions.
6. Fix confirmed current defects on a dedicated branch, add regression coverage, and open a corrective PR. Do not rewrite merged PR history or push directly to `main`.
7. Record remediation PR, tests, and deployment verification below. Do not mark a finding resolved until evidence is available.

## Remediation log

| Finding | Corrective branch / PR | Verification | Status |
|---|---|---|---|
| Initial inventory and triage | `audit/merged-pr-reliability-1-630` | GitHub API inventory and merge-commit check-runs | In progress |
| #620 test failure | Later fix candidate: #622 (session ID validation) | Historical failure: optional `session_id` test expected rejection but got fulfillment. Current-main test suite is green; confirm regression test now passes before closing. | Triage |
| #584 test failures | Later fix candidate: #585 (UI payload tests) | Two failures: raw structured search payload did not degrade to readable text; malformed `[[ui]]` payload leaked protocol markers. Current-main test suite is green; verify these exact regressions on current main. | Triage |
| #559 test failure | Later fix candidate: #560 (image routing CI) | Historical failure: image-tier test expected only IDs `1`,`2` but observed `1`,`2`,`3`,`4`. Current-main test suite is green; verify behavior against intended tier policy. | Triage |
| #570 dependency audit | Pending | Historical audit found four high-severity transitive Zod findings under Vercel sandbox dependencies. Current-main dependency-audit is green; compare current lockfile and audit evidence before closing. | Triage |
