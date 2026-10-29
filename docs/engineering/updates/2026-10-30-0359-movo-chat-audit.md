# Incremental Audit — MOVO Embedded NasrinAI Chat

**Review timestamp:** 2026-10-30 03:59:26 Asia/Manila (2026-10-29 19:59:26 UTC)  
**Scope:** Changes visible after the prior ledger baseline; read-only repository, CI, and Vercel review.  
**Repository permissions:** GitHub read/write access was available for the documentation branch. No application code, production configuration, database, PR state, or deployment was changed by this audit.

## Executive result

New verified progress: MOVO's rich reply renderer (PR #50) and the prompt-level MOVO scope guard are now present on the production deployment history. A follow-up disclaimer-suppression change has a successful CI run and a READY Vercel preview, but it is **not shown as a production-target deployment**. The underlying unrelated-context incident remains an open security/reliability concern. Presentation cleanup and prompt instructions do not establish server-enforced context isolation.

## Change record MOVO-2026-10-30-08 — PR #50 rich reply and chart rendering

- **Status:** Merged to `main`; production deployment observed READY.
- **PR:** https://github.com/nasrinaiv0/movo/pull/50
- **Merge commit:** [94d089d35483558b320f751cf122aa68755ef0eb](https://github.com/nasrinaiv0/movo/commit/94d089d35483558b320f751cf122aa68755ef0eb)
- **Production deployment:** [Vercel deployment dpl_Fzz9GynMgqNiY36Dq27r1T1uXxX2](https://vercel.com/nasrin-ai/movo/Fzz9GynMgqNiY36Dq27r1T1uXxX2), state READY, target production, observed creation time 2026-10-30 03:14:43 Manila.
- **Files confirmed by commit diff:** `api/nasrinai/chat.js`, `src/components/NasrinAIChat.css`, `src/components/NasrinAIChat.js`, `src/components/NasrinAIMessage.js`.
- **Before:** Embedded chat rendered the response body as a plain paragraph; the model prompt did not specify the structured chart block contract described in this change.
- **After (verified from diff):** Prompt requests readable Markdown and, when supported by supplied MOVO records, a fenced `chart` JSON block with bar/line/pie chart types, metadata, axis key, series and data. The chat now delegates rendering to `NasrinAIMessage`. New styling covers headings, paragraphs, lists, links, code, quotes, tables, chart cards, legends, pie layout and narrow mobile widths.
- **Rationale:** Make financial explanations and supported numeric trends readable and actionable without inventing missing data.
- **Dependencies / migrations:** No migration or schema change appears in this commit diff.
- **Validation:** Vercel reports a READY production deployment for the merge SHA. The workflow-run connector returned no PR-triggered run associated with the merge commit; this is **not** evidence that no CI ran, only that this query returned none. Do not attribute a test count to this merge without the exact PR workflow record.
- **Security/privacy implications:** The prompt explicitly says to use only supplied MOVO context and not invent financial values, but prompt text is not an authorization boundary. Audit the Markdown renderer for unsafe HTML, unsafe link protocols, malformed chart JSON, numeric coercion/overflow, misleading chart scales, and accessibility of SVG/legend text.
- **Next actions:** Test valid/invalid Markdown and chart payloads; confirm external links are safely constrained; test XSS-like text as literal content; verify malformed chart blocks fall back safely; test mobile overflow and screen-reader output; compare chart values with source financial rows in a controlled test account.

## Change record MOVO-2026-10-30-09 — Production prompt-level scope guard

- **Status:** Production deployment observed READY.
- **Commit:** [a60c6b24935c55a80c681bc055aaf6f8922f236e](https://github.com/nasrinaiv0/movo/commit/a60c6b24935c55a80c681bc055aaf6f8922f236e)
- **Production deployment:** [Vercel deployment dpl_CZBT5UyH8bEH9pY6NB155mxj8iHu](https://vercel.com/nasrin-ai/movo/CZBT5UyH8bEH9pY6NB155mxj8iHu), state READY, target production, observed creation time 2026-10-30 02:40:58 Manila.
- **Files confirmed by commit diff:** `api/nasrinai/chat.js`, `src/lib/nasrinaiChat.test.js`.
- **Before:** Prompt identified the assistant as a private finance copilot and said to use supplied MOVO data for financial claims, but did not explicitly reject unrelated-topic requests or fully state the in-app scope.
- **After (verified from diff):** Prompt defines NasrinAI as the dedicated in-app assistant for MOVO, limits answers to MOVO usage/current-user records/relevant finance concepts, instructs refusal of unrelated topics, says missing context must not be guessed, marks messages/financial records as untrusted, declares chat read-only, and forbids disclosure/speculation about other MOVO users. Unit assertions were added for several of these clauses.
- **Dependencies / migrations:** None visible in this commit diff.
- **Validation:** The production deployment is READY. The diff shows test assertions, but this audit did not independently execute the tests.
- **Security assessment:** This is a useful product-scope guardrail, but remains prompt-level. It does not prove retrieval, cache, transcript, provider fallback, or database paths are scoped to the authenticated user/project. The observed unrelated-document incident must not be marked resolved based on these prompt changes alone.
- **Next actions:** Verify server-derived user identity and owner-scoped queries/RLS; trace every context source before prompt inclusion; test new sessions, sign-out/sign-in, account switching, retries/fallbacks and caches; add a harmless unrelated-project canary and verify it never enters the prompt or output.

## Change record MOVO-2026-10-30-10 — Suppress unrelated-document disclaimer in the chat renderer

- **Status:** Commit exists on preview branch; preview READY; **not confirmed deployed to production**.
- **Commit:** [532beda71a2590ebb6a3e3428e4eff8122861551](https://github.com/nasrinaiv0/movo/commit/532beda71a2590ebb6a3e3428e4eff8122861551)
- **Branch:** `fix/filter-unrelated-document-notes`.
- **File confirmed by diff:** `src/components/NasrinAIMessage.js`.
- **Preview deployment:** [Vercel deployment dpl_FHXf5LFxQu6UbVa1mtdJYTLZpB5w](https://vercel.com/nasrin-ai/movo/FHXf5LFxQu6UbVa1mtdJYTLZpB5w), state READY; Vercel metadata shows branch `fix/filter-unrelated-document-notes`, commit SHA above, and no production target.
- **Before:** The renderer could display a generated note of the form “Note: The document … does not contain information about your personal finances and was not used to generate this summary.”
- **After (verified from diff):** A regular-expression helper removes matching disclaimer text before splitting the response into renderable lines. The source comment explicitly says this is a presentation guard and does not replace server-side context isolation.
- **Rationale:** Avoid showing an irrelevant document-retrieval disclaimer in a finance-chat response.
- **Validation:** GitHub Actions run [40939920136 — MOVO Phase 1 CI](https://github.com/nasrinaiv0/movo/actions/runs/40939920136) completed successfully for the exact commit. The only returned job, `verify`, passed its “Run tests” and “Build production bundle” steps. No test count was returned in the workflow-job summary.
- **Security/privacy implications:** This change masks a visible symptom; it does not stop unrelated content from being retrieved or included in model context. The regex should be tested against multiline and adversarial response text so it cannot remove unrelated legitimate content. Do not treat the issue as fixed or the change as a security boundary.
- **Next actions:** Add focused tests for exact-match removal, quoted/near-match text, multiple notes, malformed/truncated notes, and ordinary financial prose; confirm only the intended note is removed. Keep the server-side isolation work as the P0 remediation.

## Open issue MOVO-47 — Unrelated context appearing in embedded chat

- **Status:** Still returned by the connected GitHub issue search for open MOVO issues during this review.
- **Issue:** https://github.com/nasrinaiv0/movo/issues/47
- **Observed symptom:** The reported screenshot shows the finance chat referencing an unrelated document titled “Nasrin's portfolio,” then returning to a finance-copilot identity.
- **Evidence boundary:** The screenshot supports an unrelated-context/output defect. It does **not by itself prove cross-user financial-data disclosure**. A redacted request trace and context provenance are needed to determine whether the source is global retrieval, stale client state, cache, transcript mixing, or another path.
- **Required P0 remediation:** Reproduce with a clean session; capture a sanitized trace; enumerate every context source; enforce project/tenant/user/conversation authorization before retrieval and prompt inclusion; ensure fail-closed behavior when ownership/provenance cannot be proven; add cross-project and cross-user canary tests; verify no sensitive prompt/context data is logged.
- **Upstream dependency:** Prior ledger entry NASRINAI-2026-10-30-01 describes NasrinAI PR #699 as the proposed server-enforced MOVO scope boundary and MOVO PR #48 as the client integration. This run did not obtain fresh authoritative PR metadata for #699/#48 from the GitHub issue-search endpoint, so their current states are **not re-certified here**. Recheck both PR pages/heads before relying on that earlier state.

## Documentation drift and release status

- MOVO `docs/PR_PROGRESS.md` on `main` still says “Last reconciled: 2026-10-29 13:02 UTC” and contains historical open-state entries for PR #42. Current production deployment metadata shows later merged main commits for PRs #42/#44/#45/#50. Treat the register as stale until reconciled against current PR metadata, merge SHAs, CI and production deployment records.
- NasrinAI production deployment [dpl_GkNLFAzWEnU2Sb8okP4X5an1iJSE](https://vercel.com/nasrin-ai/nasrinai/GkNLFAzWEnU2Sb8okP4X5an1iJSE) was observed READY on commit `3a2c705461ac5b9920191ef67e5b25213dff0222`, the same PR #692 merge commit already documented in the baseline. This is a deployment-state recheck, not a newly verified application-code change.
- No production database catalog, Supabase migration state, RLS/grants, or leaked-password-protection setting was queried in this run. Those earlier P0 items remain unverified.

## Priority-ordered follow-up

1. **P0 — Isolation:** Reconcile current PR #699 and #48 heads/states, then finish the server-enforced scope path and end-to-end integration. Do not close MOVO-47 based only on prompt text or disclaimer suppression.
2. **P0 — Production proof:** Test an authenticated clean MOVO session with a harmless portfolio canary and verify absence from retrieval, model request, response, transcript, cache and logs; verify cross-user attempts fail closed.
3. **P1 — Renderer safety:** Audit `NasrinAIMessage` for unsafe HTML/link protocols and malformed chart parsing; add regression tests and accessible mobile/chart checks.
4. **P1 — Docs:** Reconcile MOVO `docs/PR_PROGRESS.md` on a documentation branch, preserving history and linking exact evidence rather than rewriting old outcomes.
5. **P0 — Database/security baseline:** Separately verify migrations 080/081, RPC grants, RLS/client privileges and Supabase Auth leaked-password protection through authorized read-only checks.
6. **Evidence discipline:** Distinguish PR merge, CI success, Vercel READY, production target, live behavior and database migration application as separate facts. Never infer one from another.

## Source references

- PR #50: https://github.com/nasrinaiv0/movo/pull/50
- Rich reply merge commit: https://github.com/nasrinaiv0/movo/commit/94d089d35483558b320f751cf122aa68755ef0eb
- Production scope-guard commit: https://github.com/nasrinaiv0/movo/commit/a60c6b24935c55a80c681bc055aaf6f8922f236e
- Preview disclaimer-filter commit: https://github.com/nasrinaiv0/movo/commit/532beda71a2590ebb6a3e3428e4eff8122861551
- CI run: https://github.com/nasrinaiv0/movo/actions/runs/40939920136
- Open issue: https://github.com/nasrinaiv0/movo/issues/47
- MOVO progress register: https://github.com/nasrinaiv0/movo/blob/main/docs/PR_PROGRESS.md
