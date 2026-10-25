# Merged Pull Request Reliability Audit (#1–#630)

**Audit started:** 2026-10-26  
**Repository:** `nasrinaiv0/nasrinAI`  
**Baseline observed:** `main` at `8a8cd18227b4bbc040c9a6534cd834e5f16777b8` during this audit.  
**Status:** In progress — preliminary findings documented; full PR-by-PR and functional verification is not yet complete.

## Purpose and scope

Review merged pull requests numbered #1 through #630 for failed CI checks, corrective follow-up PRs, regressions, and functionality that may have been merged without adequate validation. The audit covers the whole product: authentication, chat, provider/model orchestration, image generation, Video Studio, Owner Command Center, telemetry/billing, database migrations/RLS, and shared UI.

This report distinguishes:
- **Historical CI failure:** a failed check was observed on a PR's recorded head.
- **Follow-up merged:** a later corrective PR was merged; this alone does not prove the original defect is resolved.
- **Current behavior verified:** a defect was reproduced or an acceptance test passed against the current target revision.
- **Unverified:** available evidence does not establish current functional behavior.

No conclusion that all PRs #1–#630 have been audited should be drawn from this initial report. A red historical check is not automatically a current production defect; a green check is not proof of end-to-end functionality.

## Baseline observations

The latest main-branch workflow run inspected during this audit reported successful `test`, `database`, and `dependency-audit` jobs. This is a useful baseline but does not replace a historical PR audit or functional smoke testing.

The GitHub search for merged PRs with a failure status returned 58 candidates at the time of the search. This is a candidate set, not a count of confirmed defects. Each candidate must be checked for the exact failed job, commit SHA, subsequent fix, and current behavior.

## Priority findings and verification plan

| Priority | PR(s) | Area | Evidence observed | Required verification / acceptance criteria | Status |
|---|---|---|---|---|---|
| P0 | #620, #622 | OpenRouter session validation/routing | PR #620's CI test job failed; #622 is a merged follow-up whose CI passed. | Invalid session IDs are rejected; valid sessions route correctly; user/session isolation is enforced; malformed inputs return safe errors. Test current main. | Follow-up merged; current behavior unverified |
| P1 | #584, #585 | Structured UI/chat rendering | PR #584's CI failed; #585 is a merged follow-up whose CI passed. | Malformed or raw `[[ui]]` markers do not leak; valid structured payloads render safely; unknown payloads degrade to readable text; streaming and mobile rendering remain stable. | Follow-up merged; current behavior unverified |
| P1 | #559, #560 | Image provider routing | PR #559's CI and documentation gate failed; #560 is a merged follow-up with successful CI and documentation gate. | Correct plan eligibility, provider capability checks, fallback behavior, and error messages; no accidental local-pricing gate blocks valid generation. Test failure and timeout paths. | Follow-up merged; current behavior unverified |
| P1 | #570 | OpenRouter live model discovery/capability routing | Historical failed-check candidate. | Catalog status, discovered IDs, capability metadata, alias handling, and routing decisions are consistent; unavailable models fail over safely. | Needs detailed check-log and current-code review |
| P1 | #563 | Owner Console community-learning review queue | Historical failed-check candidate. | Queue loads, filters, paginates, and handles approve/reject/retry safely; authorization is owner-only; errors are visible without exposing private content. | Needs detailed check-log and current-code review |
| P1 | #468 | Video Studio multitrack editor/ElevenLabs audio | Historical failed-check candidate. | Track edits persist; audio/video timing is preserved; render worker reports failures accurately; export and mobile UI paths work. | Needs functional verification |
| P1 | #379 | Chat sources and follow-ups | Historical failed-check candidate. | Sources render with correct destinations; follow-up actions preserve relevant context and remain usable on mobile. | Needs functional verification |
| P1 | #375 | Site-wide button functionality | Historical failed-check candidate; PR title indicates a rollback intended to restore functionality. | Smoke-test navigation, primary actions, dialogs, menus, and disabled/loading/error states across core screens. | Needs functional verification |
| P1 | #627 | OpenRouter generation-log reconciliation | Merged PR. | Provider-reported usage/cost is reconciled accurately; unknown cost stays unknown; concurrent verified values are not overwritten; owner UI reflects stored data. | Needs reconciliation tests and current UI/data verification |
| P1 | #629 | Quick free-provider fallback | Merged PR; its merge-commit CI was observed passing. | Guest/Quick free-model policy, safe fallback, heavy-task GPT Luna routing, paid Quick cheapest eligible non-free model, and provider-unavailable cases match product requirements. | CI baseline observed; functional behavior unverified |
| P1 | #630 | Auto provider strategy | Merged PR. | Auto selection respects task capability, plan, provider availability, and cost/latency constraints; fallback does not bypass plan policy. | Needs CI and functional verification |

### Historical PR/follow-up pairs already checked

- **#620 → #622:** #620's CI test job failed; #622 merged and its recorded CI passed. This is not proof the current implementation is correct.
- **#584 → #585:** #584's CI failed; #585 merged and its recorded CI passed. Current rendering behavior still needs verification.
- **#559 → #560:** #559's CI and documentation gate failed; #560 merged and its recorded CI/documentation gate passed. Current image-routing behavior still needs verification.
- **#627, #629, #630:** confirmed merged. Their merge status alone does not prove all product acceptance criteria are met.

## Required provider-routing acceptance matrix

Test the actual orchestrator and provider adapters, not only helper functions:

1. Guest and Quick requests use only the intended eligible free-model pool and approved fallback behavior.
2. Heavy Quick tasks use the designated GPT Luna route when appropriate, as specified by product requirements.
3. Paid Quick uses eligible non-free OpenRouter models with cost-aware selection.
4. Pro, Max, and Ultra retain their intended model pools, limits, and feature entitlements.
5. Auto selects a model compatible with task type and capabilities (text, coding, image, audio/video where supported).
6. Provider timeout, 429/rate limit, 5xx, invalid model, malformed response, and unavailable credentials produce safe, useful failures or approved fallback.
7. No fallback silently crosses plan restrictions or reports a model/provider that was not actually called.
8. Usage accounting distinguishes provider-reported cost from estimates and keeps unknown costs unknown.
9. Tests cover both authenticated and guest flows and ensure the separate OpenRouter credentials used by NasrinAI and GitHub are not mixed.

## Functional smoke-test matrix

| Domain | Minimum end-to-end checks |
|---|---|
| Authentication/session | Sign in/out, expired/invalid sessions, session isolation, guest-to-signed-in transition, Safari/mobile behavior |
| Chat | Plain text, streaming, code, tables, citations, structured UI, attachments, errors, retry, conversation persistence |
| Provider orchestration | All plan tiers, free/paid routing, capability checks, fallbacks, provider errors, truthful model attribution |
| Image generation | Tier entitlements, supported model selection, successful generation, timeout/error fallback, usage recording |
| Video Studio | Project save/load, multitrack edits, audio alignment, render queue, export failure/retry |
| Owner Command Center | Owner-only authorization, user/region analytics, provider logs/cost, alerts, review queue, filters/date ranges |
| Supabase/database | Migration history, schema consistency, RLS and grants, safe query behavior, telemetry persistence |
| UI/mobile | Navigation, buttons, dialogs, responsive layout, accessible controls, loading/empty/error states |
| Deployment | Preview build and smoke tests; distinguish CI failures from deployment-policy blocks; do not claim production deployment without evidence |

## Audit workflow

For every merged PR #1–#630, record:
- PR number/title and merge commit SHA;
- CI checks and their conclusions at the relevant commit;
- whether the failure is reproducible or historical/transient;
- relevant corrective PR(s) and whether they are merged;
- affected code paths and acceptance criteria;
- current-main test results and functional reproduction results;
- disposition: **confirmed defect**, **verified fixed**, **historical/transient**, or **unverified**;
- corrective PR, regression tests, and final CI evidence where applicable.

## Safety and change controls

- Do not push unreviewed code directly to `main`, rewrite history, or merge corrective PRs automatically.
- Do not run production migrations, alter production settings, or trigger a production deployment without explicit authorization.
- Use isolated corrective branches and focused PRs with regression tests.
- Document every correction in `docs/pr-change-log.md` and link the relevant PR.
- Do not expose API keys, raw prompts/completions, private user data, or secrets in logs or audit artifacts.
- A test suite passing is necessary but not sufficient: validate important user-facing behavior and database invariants.

## Current audit completion status

**Not complete.** This document captures the baseline and the first set of evidence-backed investigation targets. The full enumeration of merged PRs #1–#630, their check logs, corrective chains, and current functionality remains outstanding. Do not mark the audit complete until every PR in scope has a recorded disposition and all confirmed defects have been fixed or explicitly tracked with a reason and owner.
