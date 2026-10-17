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


## Permanent progress-documentation policy (added 2026-10-18)
**Every meaningful change must update project documentation before the work is considered handed off.** This applies to feature work, bug fixes, refactors, security changes, configuration changes, test fixes, and PR merges.

For each work session, record:
- Goal / user request and scope.
- Files or components changed and a concise description of the implementation.
- PR number and URL, branch, latest commit SHA, and merge state.
- Tests actually run and their results; distinguish local tests, CI, deployment checks, and manual/device verification.
- Security implications, permission/scope changes, migrations, environment-variable changes, and rollback considerations.
- Known limitations, deferred items, and the next concrete steps.

Rules:
1. Update the relevant feature/technical document and this master handoff when a change affects project direction, shared architecture, security, deployment, or ongoing work.
2. Do not update docs with guessed results. Check the actual workflow/deployment status first and label anything not verified as pending or unverified.
3. Include the handoff/document update in the same PR as the implementation whenever practical, so code and progress notes are reviewed together.
4. After a PR merges, update the canonical documentation with the merge commit, final checks, deployment status, and remaining follow-up work.
5. Keep a short “Current checkpoint” and “Next actions” section current; archive stale notes instead of silently treating old statuses as current.
6. Claude must read this file and the relevant feature documents before continuing a task, inspect the current repository state, and update the docs again before handing work back.
7. Never treat conversational memory as the sole record of project state. GitHub docs, PRs, commits, CI, and deployment evidence are the durable source of truth.

## Current checkpoint — documentation policy
- The user explicitly requested on 2026-10-18 that project documentation always be updated to save progress.
- This policy is now recorded in this file.
- PR #383 remains the active context in this handoff. Recheck its current head, required CI checks, merge state, and deployment before acting; statuses above are snapshots, not guarantees.

## Next actions
1. Apply this documentation policy to every future NasrinAI task.
2. Before coding, inspect current GitHub state and relevant docs.
3. Include progress-document updates in the same PR as the code change where practical.
4. Before handoff, summarize verified changes, test results, open risks, and next steps in both the response and the relevant docs.
