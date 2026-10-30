# NasrinAI Master Change Ledger

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

## Audit delta — 2026-10-30 15:08 Asia/Manila (07:08 UTC)

### PR #713 — Coding workspace, automatic web-search fallback, and time guard
- Repository: nasrinaiv0/nasrinAI. Merge commit: 7afe7fab8aa7789ce71b14de6c2e6c465ea31661. PR head: fc739ed1dbac5db60694fcacecf42b94b74101af. Merged 2026-10-30 05:56:44 UTC.
- Key paths: src/github/workspace.js, src/github/index.js, src/github/runner.js, src/chat.js, src/tools/agent.js, src/auto-repair.js, src/config.js, public/legal/privacy.md, docs/coding-chat.md, docs/tools.md, and tests including test/code-workspace.test.js, test/agent-tools.test.js, test/auto-repair.test.js, test/github.test.js, test/legal.test.js and test/page.test.js.
- Before: coding chat primarily proposed patch-style edits; the model had less structured support for editing and re-reading working files, and failure detection depended more heavily on model behavior.
- After: code_edit, code_write, code_changes and code_revert maintain a bounded per-tenant/person/chat workspace. Edits are exact find-and-replace or whole-file writes; GitHub reads return edited content; unsafe paths such as .git, node_modules, .env and generated framework directories are rejected. Nothing is written to GitHub by these workspace tools. Changes are returned as file blocks so the existing Confirm/Open PR path remains the write boundary.
- Bounds observed in source: 20 changed files, 200 KB per file, 500 KB total changed content, and a 15-minute in-memory workspace TTL. Stale edits are dropped with a note rather than silently applied.
- Automatic repair expands to up to 3 repair rounds and 12 coding-tool rounds per message. The time guard refuses to start work that cannot fit the 120-second server limit and returns an explicit out_of_time state.
- Web search can fall back to NasrinAI's own search path when Google keys are absent, using the default model only. The public Privacy Notice was updated to version 2026-10-30 and describes the web-search/provider and temporary-workspace behavior.
- Dependencies/migrations: no database schema migration or RLS/grant change in this PR. CI ran db/tests/run.sh, npm audit --audit-level=high, package-lock consistency, Python OpenRouter activity-sync tests (2 passed), JS syntax and npm run check:secrets.
- Exact-head CI #41011007035: 1,287 tests, 1,286 pass, 0 fail, 1 skipped; Documentation Gate #41011006873 passed. CI rebuilt ffmpeg-static before npm test; the PR description's local-only missing-FFmpeg failure was not reproduced in CI.
- Security/privacy: workspace state is keyed by tenant, actor and conversation; path and size checks constrain edits; changes stay local until explicit PR confirmation. Remaining risk: source review and tests do not prove every provider/search privacy disclosure is complete, nor do they prove multi-instance sandbox reuse behavior.

### PR #714 — Batched coding commands, sandbox reuse, and deadline-aware execution
- Merge commit: 2fbf914a9190497d4b06af5a93957efc7b9e88f8. PR head: 9883a6e58162d70c1b852d77300117a672efc5ec. Merged 2026-10-30 06:01:46 UTC.
- Key paths: src/github/runner.js, src/github/workspace.js, src/github/index.js, src/chat.js, src/config.js, src/tools/registry.js, .env.example, docs/coding-chat.md and test/batch-commands.test.js.
- Before: one command per runner call; repeated calls could repeat source download and dependency setup; tool timeouts did not make the whole reply's remaining deadline explicit.
- After: github_run_command accepts up to 10 newline-separated commands, validates each with the same parser, enforces one runtime per batch, stops at first failure unless keep_going=true, preserves output head/tail, and reports out_of_time when too little time remains. The runner can reuse one sandbox within a chat reply; changed files are synchronized, reverted files are restored, dependency-file changes or patches start a fresh sandbox, overlapping runs get separate sandboxes, and the sandbox is released at reply end.
- Command guardrails observed in source: no shell operators, substitutions, pipes, redirects, wildcards or command chaining; npm install/ci/add/remove/publish and similar commands are blocked; git push/pull/fetch/clone/remote/submodule are blocked; npx is invoked with --no; pip is limited to inspection commands. Archive and patch sizes, file count, file sizes, output length and sandbox lifetime are bounded.
- Network policy is allowlisted to package registries only while dependencies install, then changed to allow=[] before test/command execution. If the policy update fails, the runner reports a failure instead of intentionally continuing as if restriction succeeded.
- Exact-head CI #41011532839: 1,294 tests, 1,293 pass, 0 fail, 1 skipped; Documentation Gate #41011532965 passed. Database tests, dependency audit, OpenRouter activity-sync tests, syntax and secret scan passed.
- Dependencies/migrations: no database migration or client grant changes. npm audit --audit-level=high passing means no high-level audit blocker under that command; it is not a claim that every low/moderate full-tree advisory is absent.
- Security follow-up: test path traversal/symlink/archive edge cases and ensure cleanup after timeout, cancellation, policy-update failure and concurrent requests. The source includes archive path/type/size checks and sandbox cleanup, but live adversarial sandbox testing was not performed in this audit.

### PR #715 — Parallel read-only tools, multiple image generations, and up to 10 files per reply
- Merge commit/current main: 85db3be07e8fa895a835fa7736e2de8ea07b9ed5. PR head: bfe9139e5855c49bdaceb98cdc93202d405a31e9. Merged 2026-10-30 06:06:37 UTC.
- Key paths: src/chat.js, src/images.js, public/app.js, public/creative-intent.js, public/files.js, src/ai/prompt.js, CLAUDE.md, docs/chat.md, docs/features/image-creation.md, test/multitask.test.js and test/images.test.js.
- Before: tool calls were processed serially; image requests produced one picture per request; replies were limited to 3 file blocks.
- After: independent tools marked risk=read run in groups of up to 4. Workspace edits, remember and tools requiring Confirm remain sequential and ordered. Results are placed back in the model's requested order, and failed checks take precedence for the repair loop. Up to 4 pictures can be requested at once, each as a separate single-image provider request with a distinct-composition instruction; the entire count must fit the daily allowance, each successful image is owner-bound and usage-logged, and partial failures preserve successful images. Replies can contain up to 10 file blocks.
- Image route validates count 1–4, checks the caller's daily allowance for the whole requested count, uses Promise.allSettled, logs each successful image and failed provider attempt, and only uses the image cache for count=1. A per-tenant/actor busy guard prevents overlapping image-generation requests for the same caller.
- Exact-head CI #41012048749: 1,297 tests, 1,296 pass, 0 fail, 1 skipped; Documentation Gate #41012048771 passed. Database tests, npm audit --audit-level=high, package-lock check, Python OpenRouter activity-sync tests, syntax and secret scan passed. Main push CI #41012161842 passed.
- Production deployment dpl_HiEJFRKoymqDcVX2PMN88GmCtBqY is READY for main SHA 85db3be07e8fa895a835fa7736e2de8ea07b9ed5. Root and app.js returned HTTP 200. The client asset contains pictureCount/count request flow and creative-intent.js contains MAX_PICTURES; no authenticated provider request or quota-spend reconciliation was performed.
- Security/privacy: images remain owner-scoped by tenant, actor type and actor ID. Multi-image requests intentionally incur one provider request and usage event per image; monitor provider spend, reservation/usage consistency, partial failures and retries to avoid duplicate charging.

### PR #716 — Video Studio feature adoption specification (planning only)
- PR head at initial audit: 2fc7add005d6be20ed25fd9d223cc8048e1fd591; one file added: docs/video-studio-drama-studio-feature-adoption.md (85 lines). Current main base was 85db3be07e8fa895a835fa7736e2de8ea07b9ed5.
- Behavior change: documentation only. It establishes a prioritized backlog for versioned timeline editing, undo/redo, Director/creator workflows, workflow and prompt libraries, asset provenance, and production-safe full-timeline export. It explicitly states that arbitrary multi-clip composition is not yet proven by the server render path.
- Security acceptance criteria include server-side media validation, private storage and short-lived URLs, existing auth/tenant ownership/entitlement/rate limits/usage reservations/spend controls, and tests preventing unrelated project/chat context and secrets from entering prompts, logs or client bundles.
- Licensing risk: the reference project identifies as GPL-3.0-only. The plan prohibits copying source, assets, branding, artwork or workflows without explicit licensing review; independent implementation is the default.
- Initial Documentation Gate #41015502425 failed because docs/pr-change-log.md was not updated. I added a plan entry in commit bfc83e87e47e142c5d93096013ade2d4e635958d. Corrected-head CI #41018566624 and Documentation Gate #41018566645 passed. No application tests or runtime behavior changed.
- Next: keep PR #716 as a planning PR; do not mark any backlog item implemented until source, tests, rendered output and isolation evidence exist.

### Ledger integrity and unresolved controls
- PR #712's earlier documentation head 21e04a47ec287607ecc11315191b90d8c8946990 compared 9 commits ahead and 6 behind current main. This commit brings current main into the ledger branch while preserving the existing audit history. The PR itself remains open/draft; this is not a PR merge.
- Known post-merge security hardening: src/tools/agent.js limited() returns true if store.rateHit is absent. The supported memory and Supabase stores currently implement rateHit, and errors from an existing method fail closed, so no exploit is demonstrated. Still change the missing-method path to fail closed and add tests for absent method, thrown error and rejected rateHit result.
- Not proven by CI or HTTP 200: authenticated run_code execution, live Vercel Sandbox network denial/cleanup/time/output bounds, real multi-image provider generation and billing, and full interactive renderer/accessibility QA.
- Carried forward and not freshly rechecked: main-branch protection, Supabase leaked-password protection, migration 080–082 source/catalog parity, targeted SECURITY DEFINER review, authenticated Owner Command Center smoke and persistent attachment issue #486.

--- Historical material retained below ---

## Latest verified snapshot — 2026-10-30 09:20 Asia/Manila

- Main/production source: `b39f4dcd62641d5f601e4e707cb46155ca8e135e`; Vercel deployment [dpl_EYBvVZe2o1qdMrUuXvGoXcqD4qkG](https://vercel.com/nasrin-ai/nasrinai/EYBvVZe2o1qdMrUuXvGoXcqD4qkG) is READY at the same SHA.
- Latest in-scope application change: PR #709 merged; OCC labels now read “Automation & Jobs” and “Automation”. CI #40972509344 and Documentation Gate #40972509431 passed on its PR head. Live authenticated OCC browser/API behavior is not verified.
- PR #708/migration 085 remains the recorded OCC database repair; earlier SQL verification is historical evidence and was not repeated in this audit.
- Documentation PR #710 is 5 ahead / 5 behind and non-mergeable; PR #705 is 22 ahead / 16 behind with no workflow run returned for its exact head. This current-main-based audit branch is the reconciliation candidate.
- Carried-forward, not freshly rechecked: migration registry/source parity for 080–082; Supabase leaked-password protection; targeted SECURITY DEFINER review.
- No production schema, Auth setting, credential, deployment, or application code was changed during this audit. See [the 09:20 audit delta](engineering/updates/2026-10-30-0920-nasrinai-audit.md).



**Snapshot:** 2026-10-30 06:20 Asia/Manila (2026-10-29 22:20 UTC)  
**Repository:** https://github.com/nasrinaiv0/nasrinAI  
**Baseline main SHA:** 33f9283f35a0627c700efb43b3335bcfd8d52840  
**Scope:** NasrinAI repository, its own production deployment, and its own database only. All MOVO/MOVI and other unrelated product workstreams are excluded, including any such changes mentioned in NasrinAI PR descriptions. No implementation claims are made about excluded work.

## How Claude should use this ledger

Start here, then open the focused audit delta and cited source files/PRs. Do not reread the entire codebase by default. Inspect only the paths linked to the finding and the adjacent authorization/data-flow boundary needed to verify it.

Every finding uses exactly one status:
- **Implemented** — implementation or configuration is present and the specific claim is supported by evidence.
- **Partially implemented** — some implementation exists, but a required component or verification is missing.
- **Not implemented** — the required implementation/object is confirmed absent.
- **Blocked** — progress or safe release is prevented by a known dependency, failed gate, missing schema, or owner action.
- **Not verified** — available evidence does not establish the claim.

Evidence labels:
- **Directly verified:** observed in current GitHub, Vercel, or read-only Supabase results during this run.
- **Reported:** recorded in a PR description or existing audit, not independently rerun during this run.
- **Not verified:** no current evidence for the claim.
- **Inference:** reasoned from direct evidence and explicitly not a runtime observation.

## Executive status — 2026-10-30 06:20 Asia/Manila

| Item | Status | Evidence and caveat |
|---|---|---|
| Repository main | **Implemented** (reference state observed) | Main SHA `33f9283f35a0627c700efb43b3335bcfd8d52840`, merge of in-scope PR #701. [Commit](https://github.com/nasrinaiv0/nasrinAI/commit/33f9283f35a0627c700efb43b3335bcfd8d52840). This audit does not make claims about excluded work in repository history. |
| Production deployment | **Implemented** (deployment state only) | Vercel deployment `dpl_G39Ax4eFvM514ohoKQmVKwVqxV3H` reports READY at the main SHA; the GitHub Vercel status is success. READY is not end-to-end feature verification. [Deployment](https://vercel.com/nasrin-ai/nasrinai/G39Ax4eFvM514ohoKQmVKwVqxV3H). |
| PR #701 — image-edit slash commands | **Partially implemented** | Merged/deployed; CI run #40958705882 and Documentation Gate #40958705888 passed on PR head `684b82865559a2286c856efe9c02dae226df94ad`. PR-reported test total is 1,248 passing with one local-only FFmpeg export failure; current production edit smoke tests were not run. |
| PR #702 — rich reply rendering | **Blocked** | Head `c9ddf310f48c0157b8267187c0da9e69735a3d09`; CI #40957687555 and Documentation Gate #40957687102 passed on that head, but branch comparison is 1 commit ahead / 32 behind main. Reconcile and rerun checks before merge. |
| PR #703 — agent tools | **Blocked** | Head `cda418b0b6b8ea0f00a68535c0631da5e1408ba1`; comparison is 2 commits ahead / 28 behind main. No workflow runs or combined status checks were returned for that exact head. Treat PR-body test counts as historical reports only. |
| PR #704 — older audit draft | **Blocked** | Branch comparison reports 0 commits ahead, 5 behind, and no changed files. It is stale/duplicate; do not merge as-is. |
| PR #705 — current audit documentation | **Blocked pending exact-head gates** | Prior head `8245a7de6b30afad01f114d6c43d0cffa4ba964b`: CI #40964845572 passed; Documentation Gate #40964845542 failed at “Require changelog update in this PR”. This refresh adds `docs/pr-change-log.md`; checks on the new head must be verified before merge. |
| Migration 068 — integration persistence | **Blocked** | Migration file exists in main, but production registry lacks 068 and production lacks `public.integration_connections` and `public.integration_oauth_states`, while `src/integrations/store.js` queries `integration_connections`. No migration was applied. |
| Migration 079 — tenant hybrid retrieval | **Blocked** for semantic retrieval activation | Production has tenant columns and `knowledge_chunks_tenant_idx`, but lacks `embedding`, `embedding_model`, `knowledge_chunks_embedding_hnsw`, and `public.search_knowledge_hybrid`; registry lacks 079. The production feature-flag value was not inspected. |
| Migrations 080/081 — owner console/API keys | **Partially implemented** | Expected functions exist and execute as `service_role`, not `anon` or `authenticated`; migration registry entries are absent. Exact live-definition parity has not been compared. Do not blindly replay. |
| Migration 082 — user-message recall | **Partially implemented** | `public.search_user_messages` and `messages_content_fts_idx` exist; execution is service-role-only. Registry lacks 082 and exact live-definition parity has not been compared. |
| Supabase Auth leaked-password protection | **Blocked — owner action required** | Security Advisor still reports the setting disabled. No Auth setting was changed. |
| RLS-without-policy findings | **Partially implemented / review required** | RLS is enabled on `knowledge_learning_runs`, `openrouter_generations`, and `public_technical_chunks`, each with zero policies; the read-only grants query found no `anon` or `authenticated` table privileges, while `service_role`/postgres grants exist. Keep the server-only access intent explicit and recheck after schema changes. |
| Unused-index advisor findings | **Not verified** as removable | Advisor reports 41 informational unused-index findings. No workload review or index removal was performed. |

## 1. Recent in-scope merged change — PR #701

- **PR:** https://github.com/nasrinaiv0/nasrinAI/pull/701
- **Merge/main commit:** `33f9283f35a0627c700efb43b3335bcfd8d52840`
- **PR head checked:** `684b82865559a2286c856efe9c02dae226df94ad`
- **Exact changed paths from the merge commit:**
  - `config/image-edit-commands.json`
  - `docs/features/universal-slash-commands.md`
  - `docs/pr-change-log.md`
  - `public/app.js`
  - `public/creative-intent.js`
  - `public/slash-menu.js`
  - `scripts/build-image-edit-commands.js`
  - `src/routes.js`
  - `src/skill-commands.js`
  - `test/image-edit-commands.test.js`
  - `test/skill-commands.test.js`
- **Purpose/behavior:** the PR reports 1,017 image-edit slash commands. The merged paths add/build the command catalog, register and render slash-menu choices, resolve creative intent, route commands through existing image handling, and add focused tests. A command is described as requiring an attached image and using existing plan/rate/billing/safety controls.
- **Validation:** CI #40958705882 passed; Documentation Gate #40958705888 passed on the PR head. The PR reports 1,248 passing tests and one local-only FFmpeg export test failure because FFmpeg was unavailable in that test environment. Those totals are PR-reported, not a fresh full test run performed by this audit.
- **Deployment:** Vercel deployment `dpl_G39Ax4eFvM514ohoKQmVKwVqxV3H` is READY at main SHA `33f9283f...`; Vercel status is success. No authenticated production image-edit smoke test was run.
- **Security/privacy implications:** no new privilege boundary is intended. Keep the existing image endpoint's authorization, quota, billing, upload, and content-safety checks authoritative; verify representative edits, missing-image rejection, catalog uniqueness/no shadowing, and plan/rate enforcement before claiming end-to-end completion.
- **Status:** **Partially implemented** — code is merged/deployed; production behavior is not fully verified.
- **Rollback:** if a regression is confirmed, use the normal reviewed application rollback/revert process for the feature commit; do not roll back unrelated main history. This audit did not initiate a rollback.

## 2. Open PR inventory and merge readiness

### PR #702 — rich reply rendering

- **URL:** https://github.com/nasrinaiv0/nasrinAI/pull/702
- **Head:** `c9ddf310f48c0157b8267187c0da9e69735a3d09`; merge base `ed6f0ad6d9bc8cf3b22862e89adbd67396ee7ab8`.
- **Changed paths:** `docs/chat.md`, `docs/pr-change-log.md`, `public/app.css`, `public/app.js`, `public/format.js`, `public/index.html`, `src/ai/prompt.js`, `test/reply-rendering-rich.test.js`.
- **Reported behavior:** richer formatting for code, diffs, math, callouts, quotes, nested lists, and headings. Current code-level security review was not repeated in this run.
- **Checks:** CI #40957687555 passed; Documentation Gate #40957687102 passed on this exact head. No current production preview/runtime verification was established here.
- **Branch drift:** 1 commit ahead / 32 behind main. **Status: Blocked** until reconciled and all required checks pass on the new head.
- **Security/accessibility follow-up:** review output/URL escaping, MathML safety, malformed and oversized payloads, regex complexity, CSP, keyboard navigation, and screen-reader/mobile rendering.
- **Rollback:** do not merge while stale; if merged later and a regression is confirmed, use a targeted reviewed revert.

### PR #703 — agent tools

- **URL:** https://github.com/nasrinaiv0/nasrinAI/pull/703
- **Head:** `cda418b0b6b8ea0f00a68535c0631da5e1408ba1`; merge base `531f56d6d5685730692372d64bd7780b974f5c69`.
- **Changed paths:** `.env.example`, `docs/pr-change-log.md`, `docs/tools.md`, `public/app.js`, `public/legal/privacy.md`, `src/auto-repair.js`, `src/chat.js`, `src/config.js`, `src/github/api.js`, `src/github/index.js`, `src/main.js`, `src/routes.js`, `src/tools/agent.js`, `test/agent-tools.test.js`, `test/legal.test.js`, `test/page.test.js`.
- **Reported behavior:** URL fetch, optional search, repository file search, and bounded code execution in isolated sandboxes, with privacy-notice updates and repair-on-failure behavior. Exact runtime enforcement was not independently tested.
- **Checks:** no workflow runs and no combined status checks were returned for the exact head. The PR's reported test count is not accepted as current-head evidence.
- **Branch drift:** 2 commits ahead / 28 behind main. **Status: Blocked** until rebased/reconciled and exact-head CI, Documentation Gate, dependency/security checks, and sandbox-specific tests pass.
- **Security review required:** sandbox isolation, network denial, process/resource/output caps, filesystem persistence, environment/secret inheritance, SSRF protections, prompt-injection treatment for fetched results, server-side per-user limits, guest denial, and kill-switch enforcement.
- **Rollback:** keep unmerged until verified; if a future release exposes unsafe execution, disable via the server-side kill switch if available and follow the reviewed release rollback plan.

### PR #704 — older audit draft

- **URL:** https://github.com/nasrinaiv0/nasrinAI/pull/704
- **Branch comparison:** 0 commits ahead, 5 behind current main, no changed files.
- **Status:** **Blocked** as a stale/duplicate proposal. Do not merge as-is. No PR state was changed by this audit.

### PR #705 — canonical audit documentation proposal

- **URL:** https://github.com/nasrinaiv0/nasrinAI/pull/705
- **Branch:** `docs/change-ledger-refresh-2026-10-30-0614`; prior head `8245a7de6b30afad01f114d6c43d0cffa4ba964b`; base/main `33f9283f35a0627c700efb43b3335bcfd8d52840`.
- **Purpose:** provide a concise current-state handoff plus detailed change ledger and audit delta so Claude can investigate only cited files.
- **Gate failure on prior head:** CI #40964845572 passed; Documentation Gate #40964845542 failed in job “Require changelog entry”, step “Require changelog update in this PR”. This refresh adds the required changelog path.
- **Status:** **Blocked pending exact-head validation**. Keep draft; do not merge until the latest head's CI and Documentation Gate results are observed and green.
- **Rollback:** revert only the documentation commits on this branch if the report is materially inaccurate. No runtime rollback is needed for documentation-only changes.

## 3. Production database and security — fresh read-only checks

The following checks were run against the NasrinAI Supabase project only. No migration, DDL, DML, grant, policy, or Auth-setting changes were performed. The migration registry does not contain entries named 068, 079, 080, 081, or 082; registry/object mismatches must be reconciled rather than “fixed” by blind replay.

### Migration 068 — universal integration persistence

- **Repository evidence:** `db/migrations/068_user_owned_integrations.sql` (blob SHA `d405e25c611d539e901a2d1f133366aa6bee38e3`) defines `public.integration_connections` and `public.integration_oauth_states`, encrypted credential fields, tenant/user/provider uniqueness, indexes, RLS, and browser-deny policies.
- **Code evidence:** `src/integrations/store.js` (blob SHA `d09e449c5892ea56d36d01a8f053d4957824c21b`) queries `integration_connections` for owner-scoped reads/writes/deletes.
- **Production evidence:** migration registry has no 068 entry; both expected tables are absent from `information_schema.tables`.
- **Security/privacy implication:** the intended model is server-only encrypted credentials and tenant/user ownership. With the tables absent, integration persistence paths may fail; do not claim universal integration persistence works in production.
- **Status:** **Blocked**.
- **Next step:** prepare a small reviewed migration-reconciliation plan, inspect existing objects/history first, validate RLS and grants in non-production, and obtain explicit owner approval before any production migration.
- **Rollback:** no migration was run. A future rollout needs a reviewed rollback plan that accounts for any credential rows created after deployment; do not drop or overwrite live credentials blindly.

### Migration 079 — tenant hybrid semantic retrieval

- **Repository evidence:** `db/migrations/079_tenant_hybrid_knowledge.sql` (blob SHA `8350a4e52c29521fd79154efd3d3c25882c0b6e9`) adds `knowledge_chunks.embedding`, `embedding_model`, `knowledge_chunks_embedding_hnsw`, and `search_knowledge_hybrid`, with tenant/audience filters and service-role-only execute grants.
- **Production evidence:** registry has no 079 entry. `knowledge_docs.tenant_id`, `knowledge_chunks.tenant_id`, and `knowledge_chunks_tenant_idx` exist. The two embedding columns, HNSW index, and `public.search_knowledge_hybrid` are absent.
- **Flag caveat:** the current production value of `TENANT_KNOWLEDGE_EMBEDDINGS_ENABLED` was not inspected. Do not enable it until migration state, tenant/audience isolation, embedding model matching, fallback, and grants are verified.
- **Status:** **Blocked** for semantic retrieval activation.
- **Rollback:** no migration or flag change was made. Future rollout must define a safe flag-off fallback and a reviewed rollback for any new index/function/columns.

### Migrations 080/081 — Owner Console and API-key functions

- **Repository evidence:** `db/migrations/080_owner_console_dashboard.sql` (blob SHA `a086f61b3636acf2c99033ff09c86c4e872cf3d4`) and `db/migrations/081_owner_console_api_keys.sql` (blob SHA `07c7fa3ef36d18e0056ea465703c3cda478e8e91`).
- **Production evidence:** registry entries for 080/081 are absent. `owner_console_dashboard`, `owner_console_mask_email`, `owner_console_create_api_key`, `owner_console_list_api_keys`, and `owner_console_revoke_api_key` exist. The checked dashboard/API-key functions are executable by `service_role`, not `anon` or `authenticated`; the relevant API-key/dashboard functions are SECURITY DEFINER.
- **Parity limitation:** exact live function definitions and constraints were not diffed against the migration files. Function presence does not prove complete UI/runtime behavior or migration-history consistency.
- **Status:** **Partially implemented** — catalog objects exist but registry drift remains.
- **Next step:** compare live definitions, ownership, search_path, grants, constraints, and tests; reconcile history without blindly replaying or dropping objects.
- **Rollback:** no changes made; do not revoke service-role access or remove functions as an audit shortcut.

### Migration 082 — long-term user-message recall

- **Repository evidence:** PR #693 is merged at `d953f139b70032fdea2834cf7cd755d90cde606d`; main contains `db/migrations/082_user_message_recall.sql` (blob SHA `2d124e0ebf078ea27ae9273585039be6df6dbe07`) and `db/tests/082_user_message_recall.test.sql`. Other changed paths include `docs/knowledge.md`, `docs/pr-change-log.md`, `public/legal/privacy.md`, `src/config.js`, `src/conversations.js`, `src/store/memory-store.js`, `src/store/supabase-store.js`, `test/conversations.test.js`, `test/knowledge.test.js`, `test/legal.test.js`, and `test/page.test.js`.
- **Production evidence:** migration registry lacks 082, but `public.search_user_messages` and `messages_content_fts_idx` exist. The function is SECURITY DEFINER and executable by `service_role`, not `anon` or `authenticated`.
- **Parity limitation:** live function/index definition parity and end-to-end memory-opt-in behavior were not tested in this run.
- **Status:** **Partially implemented** — expected recall objects exist but registry history is missing and runtime behavior is not verified.
- **Next step:** compare live function/index definitions to migration 082, reconcile registry safely, then test signed-in user/tenant isolation and opt-in gating in an approved environment.
- **Rollback:** no change made; avoid deleting the function or index while users may rely on recall.

### Supabase Security Advisor and grants

- **Leaked-password protection:** Advisor warning remains active. Status **Blocked — owner action required**; setting was not changed.
- **RLS without policy:** `knowledge_learning_runs`, `openrouter_generations`, and `public_technical_chunks` have RLS enabled and zero policies in the read-only catalog query. The checked table-grant query showed no `anon` or `authenticated` table privileges for these tables; `postgres` and `service_role` grants exist. This is consistent with a server-only deny-by-grant pattern but does not remove the need to document intended access and recheck after schema changes.
- **API-key and owner audit tables:** `api_keys` and `owner_audit_events` each have one `server_only_deny_browser` policy; checked owner-console functions are service-role-only.
- **Performance Advisor:** 41 informational unused-index findings were returned. They were not individually analyzed; no index was removed. Never drop indexes based solely on this advisor count.

## 4. Required next actions

1. **P0 — Migration 068:** investigate why production lacks both integration tables while main code queries them. Draft a reviewed, non-production-first reconciliation plan; do not apply it from this audit.
2. **P1 — Migration 079:** keep semantic retrieval activation blocked until embedding columns/index/RPC and tenant/audience/grant checks are verified.
3. **P1 — Migrations 080/081/082:** compare live definitions and migration history; reconcile without blind replay.
4. **P1 — Auth security:** leaked-password protection remains disabled; schedule the change only through explicit owner approval and verify afterward.
5. **P1 — PR #705:** verify CI and Documentation Gate on the latest documentation head; do not merge if either is pending/failing.
6. **P1 — PR #703:** reconcile 28 commits of drift, then run exact-head CI, Documentation Gate, dependency audit, and security tests for the execution sandbox.
7. **P2 — PR #702:** reconcile 32 commits of drift and rerun checks; include hostile/malformed renderer and accessibility tests.
8. **P2 — Production feature verification:** run approved authenticated smoke tests for image-edit commands, owner-console/API-key workflows, and opted-in message recall; distinguish test results from deployment READY.
9. **P2 — Performance:** investigate unused-index findings with workload/query evidence before considering any index changes.

## 5. Audit change and rollback record

- **Exact documentation paths being refreshed:** `docs/engineering/MASTER_CHANGE_LEDGER.md`, `docs/engineering/updates/2026-10-30-0614-audit-delta.md`, `docs/CLAUDE_MASTER_PLAN_SUMMARY.md`, and `docs/pr-change-log.md`.
- **Purpose:** correct scope leakage in the earlier draft, reconcile the latest in-scope main/PR state, record fresh read-only database and security evidence, and give Claude a targeted investigation plan.
- **Runtime behavior:** none. No application code, API behavior, credentials, provider configuration, user data, database schema, grants, policies, Auth settings, or production deployments were changed.
- **Tests:** no application tests were run manually by this audit. Exact-head CI/Gate results are listed above; checks for the updated documentation head remain pending until observed.
- **Deployment/migrations:** no deployment or migration was initiated. Production remains READY at main SHA `33f9283f35a0627c700efb43b3335bcfd8d52840`.
- **Rollback:** revert only the documentation-only commit(s) on the audit branch if the evidence is wrong. No runtime rollback is needed.
- **Scope boundary:** unrelated product-specific details in PR descriptions or existing historical logs are not audited or repeated here.


## Audit update — 2026-10-30 07:11 Asia/Manila — production schema and OCC recovery

**Supersedes older snapshot lines where the status conflicts.** Current main is `52392234ce7583303d4d25880296c06d7ad529b1`, merged PR #707; production Vercel deployment `dpl_9Ta9xUconH4kxQMipobLbDaUNMJF` reports READY at that SHA. PR #707 exact-head CI run [40969812290](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40969812290) and Documentation Gate [40970398301](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40970398301) passed. The merge records migrations 083 (explicit browser-deny policies and privilege revocation for server-only telemetry/knowledge tables) and 084 (harden `owner_console_dashboard(integer)` to `search_path=pg_catalog, pg_temp`); production migrations 068 and 079 had been applied directly before the merge.

**OCC migration 085:** PR [#708](https://github.com/nasrinaiv0/nasrinAI/pull/708) remains open/non-draft at head `6bf461687c440210d3d3d5f598ff23e7917e00f3`. CI [40971199851](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40971199851) and Documentation Gate [40971199886](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40971199886) passed. The PR reports migration 085 was applied directly to production before source merge; read-only checks corroborated the registry entry `20261029230728`, table presence, RLS/policies, and service-role-only table access. `owner_console_dashboard(7)` now executes and returns 7 series days and 12 recent-activity entries; automation tables have 0 rows, so no real automation history exists yet. No preview was returned for the PR branch and hosted OCC browser/API behavior remains unverified.

**Live Supabase recheck:** migration registry contains 068, 079, 083, 084, 085; versions 080–082 remain absent and source/live parity is unresolved. Security Advisor currently returns the leaked-password-protection warning. Catalog inspection found 16 SECURITY DEFINER functions with `search_path=public, pg_temp`; browser roles cannot CREATE in public, so this is an audit lead, not a confirmed exploit. Inspect function bodies for unqualified object references/dynamic SQL before proposing further hardening.

**Documentation branch caution:** this branch was based on `33f9283f35a0627c700efb43b3335bcfd8d52840` and is behind current main `52392234...`; reconcile before merging. No database writes, application-code changes, migrations, deployments, Auth changes, or PR-state changes were performed by this audit.

Detailed evidence: [Audit delta](https://github.com/nasrinaiv0/nasrinAI/blob/docs/change-ledger-refresh-2026-10-30-0614/docs/engineering/updates/2026-10-30-0711-production-schema-and-occ.md) (commit 8c703534a15dd6886ee7831dea25fdc5f4d74546).


## Audit checkpoint — 2026-10-30 08:17 Asia/Manila

- **Current main:** `b39f4dcd62641d5f601e4e707cb46155ca8e135e`, merge of PR #709. Production Vercel deployment `dpl_EYBvVZe2o1qdMrUuXvGoXcqD4qkG` is READY at that SHA; combined status reports Vercel success.
- **PR #709:** corrected OCC navigation `Automation (NCC)` → `Automation & Jobs` and mini-report `Automation (NCC)` → `Automation`. Files: `src/owner-console.js`, `public/owner-console.js`, `docs/CLAUDE_MASTER_PLAN_SUMMARY.md`, `docs/pr-change-log.md`. Exact-head CI #40972509344 passed dependency-audit, test, and database jobs; Documentation Gate #40972509431 passed. Hosted authenticated OCC browser/API behavior remains **not verified** because the deployment page could not be fetched through the available Vercel connection.
- **PR #708 / migration 085:** remains merged and deployed. Earlier SQL verification showed the dashboard function returning seven series days and twelve recent-activity entries, with server-only automation tables and no synthetic rows. Not re-queried in this cycle; see [detailed 08:17 audit](updates/2026-10-30-0817-occ-label-and-release-audit.md).
- **Documentation release control:** PR #705 ledger branch is 16 ahead / 16 behind current main; PR #710 audit branch is 5 ahead / 5 behind. They overlap and must be reconciled into one canonical branch before merge.
- **Carried-forward, not freshly checked:** leaked-password protection previously disabled; migration registry entries 080–082 absent; 16 SECURITY DEFINER functions with `search_path=public, pg_temp` identified for targeted body review. Do not treat these as fresh checks or confirmed exploits.
- **No production/schema/security changes were performed in this monitoring cycle.**

Detailed evidence: [Audit delta — 2026-10-30 08:17](updates/2026-10-30-0817-occ-label-and-release-audit.md).


## Follow-up status after documentation commit — 2026-10-30 08:18 Asia/Manila

The ledger update itself advanced PR #705's head to `ffe51db6664e98dc0b343bed950146edb6a00a1a`. A fresh compare now reports **18 commits ahead / 16 behind current main**; the earlier 16/16 figure above was the pre-write snapshot and is superseded. GitHub returned no status checks or PR-triggered workflow runs for this new head yet, and no matching Vercel preview was found. Do not describe this new ledger head as CI-validated. PR #710 remains separately diverged at 5 ahead / 5 behind. Consolidate/reconcile before merging.


## Final documentation-head correction — 2026-10-30 08:19 Asia/Manila

The SHA references in the earlier follow-up paragraphs are **intermediate commits**, not the final branch head: the master-ledger and detailed-delta updates were committed sequentially. After the last update in this checkpoint, the exact current head is the latest commit shown on [PR #705](https://github.com/nasrinaiv0/nasrinAI/pull/705). No CI/status result has been returned for the latest documentation head, and the branch remains diverged from main; validation and branch reconciliation are pending. Use PR metadata as the source of truth for the final head SHA.

- **Current audit-document PR:** [#711](https://github.com/nasrinaiv0/nasrinAI/pull/711), open/draft, based on current main `b39f4dc...`; documentation checks on its final head must pass before merge.


## Monitoring checkpoint — 2026-10-30 10:35 Asia/Manila
- No new application-code merge or production deployment was detected since the 10:12 checkpoint. Main remains b39f4dcd62641d5f601e4e707cb46155ca8e135e; production deployment dpl_EYBvVZe2o1qdMrUuXvGoXcqD4qkG is READY at that SHA.
- Newly verified high-priority governance gap: main branch metadata reports protected=false and required checks enforcement off; repository rulesets endpoint returned an empty array. External organization/user-level rules were not separately verified. See [10:35 audit delta](updates/2026-10-30-1035-branch-protection-and-release-control.md).
- PR #711 exact-head CI #40985781454 and Documentation Gate #40985781356 both passed. PR #702 is 1 ahead / 48 behind main and non-mergeable; PR #703 is 2 ahead / 44 behind and non-mergeable. Their older green checks do not validate reconciled heads.
- Existing issue #486 (persistent chat attachments) remains open without new implementation progress in this checkpoint. Secure private storage, ownership checks, expiry handling, and persistence tests remain acceptance requirements.
- No branch settings, code, database, secrets, or deployments were changed by monitoring.


## Monitoring checkpoint — 2026-10-30 12:06 Asia/Manila

- Main remains `b39f4dcd62641d5f601e4e707cb46155ca8e135e`; production deployment [EYBvVZe2o1qdMrUuXvGoXcqD4qkG](https://vercel.com/nasrin-ai/nasrinai/EYBvVZe2o1qdMrUuXvGoXcqD4qkG) is READY at the same application SHA. No new in-scope application-code merge/deployment was detected in this review.
- PR #709 remains the latest verified application change (OCC automation-label correction). Existing CI #40972509344 and Documentation Gate #40972509431 passed on the exact PR head; the hosted OCC browser/API path remains not independently smoke-tested.
- PR #711's prior exact head `99d3458f2fb15feed4756aba8a1efc2e6473d8c0` passed CI [#40992805066](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40992805066) and Documentation Gate [#40992805056](https://github.com/nasrinaiv0/nasrinAI/actions/runs/40992805056). This checkpoint appends documentation, so its resulting new head must rerun both gates; do not reuse the prior pass as validation of the new head.
- PR #702 head `c9ddf310f48c0157b8267187c0da9e69735a3d09` is based on `ed6f0ad6d9bc8cf3b22862e89adbd67396ee7ab8` and GitHub reports mergeable=false. PR #703 head `cda418b0b6b8ea0f00a68535c0631da5e1408ba1` is based on `531f56d6d5685730692372d64bd7780b974f5c69` and is also non-mergeable. Reconcile these implementation branches with current main and rerun exact-head CI/security checks before review or merge.
- PRs #705 and #710 remain stale/non-mergeable documentation branches. Avoid merging duplicate historical snapshots; keep #711 as the primary current-main ledger review.
- Migration 080–082 parity, leaked-password protection, SECURITY DEFINER review, OCC live smoke, and issue #486 attachment persistence remain carried-forward risks and were not freshly rechecked here.
- MOVO's merged PR #63/#64 are outside this repository and are intentionally excluded from NasrinAI implementation status.
- No application code, production schema/data, Auth setting, secret, configuration, or deployment changed. This is a documentation-only checkpoint.




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


## 2026-10-30 15:23 Asia/Manila (07:23 UTC) — PR #715 multitasking release and concurrency audit

### Verified release state
- **Repository/project:** `nasrinaiv0/nasrinAI` / NasrinAI.
- **Main commit:** `85db3be07e8fa895a835fa7736e2de8ea07b9ed5`, merge of PR #715 at `2026-10-30T06:06:37Z`.
- **Production deployment:** Vercel `dpl_HiEJFRKoymqDcVX2PMN88GmCtBqY`, target `production`, state `READY`, Git SHA matches main `85db3be07e8fa895a835fa7736e2de8ea07b9ed5`. Project deployment metadata lists `nasrinai.com` as a production domain.
- **PR:** [#715 — Multitasking: parallel tools, up to 4 pictures at once, up to 10 files per reply](https://github.com/nasrinaiv0/nasrinAI/pull/715), merged.
- **Evidence:** [PR-head CI #41012048749](https://github.com/nasrinaiv0/nasrinAI/actions/runs/41012048749), [PR-head Documentation Gate #41012048771](https://github.com/nasrinaiv0/nasrinAI/actions/runs/41012048771), [main push CI #41012161842](https://github.com/nasrinaiv0/nasrinAI/actions/runs/41012161842), [production deployment](https://vercel.com/nasrin-ai/nasrinai/HiEJFRKoymqDcVX2PMN88GmCtBqY).
- **Latest exact logged test summary:** 1,297 total, 1,296 passed, 0 failed, 1 skipped. Database suite passed. Dependency audit at `--audit-level=high`, lockfile consistency check, JavaScript syntax checks, secret scan, and OpenRouter activity-sync Python tests (2 tests) passed.
- **Runtime telemetry:** Vercel grouped runtime-error query for the last two hours returned no runtime errors for NasrinAI. This is a bounded aggregate observation, not proof that all feature paths work correctly.

### Files and areas changed by PR #715
- `src/chat.js`: introduces `MAX_PARALLEL_TOOLS = 4`; contiguous tools run concurrently only while the registry classifies them as `risk === 'read'`. Results are put back in model-request order. Failed tool checks take precedence when deciding whether the repair loop should continue.
- `src/github/runner.js`: overlapping coding runs for the same chat use a separate sandbox rather than sharing the same active sandbox.
- `src/images.js`: validates `count` as an integer from 1 to 4; runs individual image generations concurrently; retains successful results when some variants fail; returns multiple image IDs; logs successful image usage and provider-reported costs; uses image cache only for single-image requests.
- `public/creative-intent.js`, `public/app.js`: infer requested picture count from numeric/word requests (including selected Filipino number words), cap at four, and ask for confirmation before plural image generation.
- `public/files.js`, `src/ai/prompt.js`: render up to 10 `[[file]]` blocks in one reply, subject to the bounded response-size constraint.
- `test/multitask.test.js`, `test/images.test.js`: cover parallel tool execution, ordering, sequential edit behavior, picture-count inference, four-way image generation, per-image quota accounting, invalid counts, and partial failures.
- `CLAUDE.md`, `docs/chat.md`, `docs/features/image-creation.md`, `docs/pr-change-log.md`: record the behavior and limits.
- Commit diff reports 13 changed files, 247 additions, 48 deletions. No database migration or package-lock/dependency change is present in the merge diff.

### Behavior before and after
- **Before:** one picture per image request; at most three file blocks shown per reply; tool calls were processed sequentially.
- **After:** up to four independent read-only tools can run concurrently; coding edits/memory writes are explicitly sequential; up to four distinct image requests can run in parallel; all generated images count toward allowance and usage telemetry; partial image successes are preserved and failures are disclosed; up to ten file blocks can be displayed.
- Each picture is a separate provider request (not a grid). A request that exceeds the remaining daily allowance is rejected before provider work. This can increase peak provider concurrency and spend per user request, although per-image usage and provider-reported costs are recorded.

### Security/privacy and correctness review — new findings, not reproduced exploits
1. **P1 — Image allowance reservation is not atomic (static inference; no reproduction run).** `src/images.js` checks `busy.has(who)` before several awaited operations and only calls `busy.add(who)` after the allowance check and conversation writes. The allowance check reads existing successful images but does not reserve quota atomically. Two overlapping requests may both observe the same remaining allowance before either records successful images; the in-process `busy` set is not a cross-instance reservation for serverless deployments. Multi-image requests amplify the potential excess spend. Add a shared atomic per-tenant/actor reservation (with idempotency and release/finalize semantics) or a distributed lock, and test simultaneous requests against the last available quota across separate handler instances. Do not claim a production exploit without a reproducer.
2. **P1 — Audit tool risk classifications.** `parallelSafe(reg, name)` relies on registry `risk === 'read'` plus an explicit sequential-name set (`code_edit`, `code_write`, `code_revert`, `remember`). The test verifies three sample read tools and one edit, but not every registered tool. Audit all tool definitions to prove every mutating, externally consequential, or confirmation-requiring tool is not marked read-only; add a registry-wide invariant test. The code does not independently inspect confirmation metadata in `parallelSafe`.
3. **Carried forward:** the post-merge `src/tools/agent.js` rate-limit helper's missing-`rateHit` fail-open branch remains unaddressed. Both currently supported stores implement `rateHit`, so a live bypass is not established. See [PR #703 review comment](https://github.com/nasrinaiv0/nasrinAI/pull/703#issuecomment-6515935485).
4. **Not live-verified:** no authenticated production sandbox execution was performed. Network denial, secret absence, timeout/output limits, cleanup, per-actor hourly rate limits, and real provider billing have not been proven by a live test.
5. **Governance access limitation:** the repository rulesets endpoint returned an empty list, but the classic main-branch-protection endpoint returned HTTP 403 `Resource not accessible by integration`. Therefore protection settings cannot be freshly confirmed in this run. A previous checkpoint reported protection disabled; preserve that as a carried-forward concern, not a newly verified state.

### PR #716 — Video Studio planning only
- [PR #716](https://github.com/nasrinaiv0/nasrinAI/pull/716) is open/draft and adds `docs/video-studio-drama-studio-feature-adoption.md` plus a changelog entry. It is a prioritized, test-gated planning backlog for timeline editing, Director workflows, workflow/prompt libraries, asset provenance, and production-safe export; **no feature implementation is included**.
- Latest head `bfc83e87e47e142c5d93096013ade2d4e635958d`: CI [#41018566624](https://github.com/nasrinaiv0/nasrinAI/actions/runs/41018566624) and Documentation Gate [#41018566645](https://github.com/nasrinaiv0/nasrinAI/actions/runs/41018566645) passed. An earlier Documentation Gate failed because the changelog entry was missing; the later head added it and passed.
- The plan records that the reference project is GPL-3.0-only and requires licensing review before any source adaptation. It also explicitly says full arbitrary multi-clip MP4 export is not yet proven; do not advertise it as complete.
- No application code, tests, schema, migration, or runtime behavior changed in #716.

### Audit-ledger continuity
- Replacement audit PR [#712](https://github.com/nasrinaiv0/nasrinAI/pull/712) is open/draft and based on current main. Before this checkpoint it had head `09ad5157e7643ae1d97fa4d95227597b91faaba2`; CI [#41018873877](https://github.com/nasrinaiv0/nasrinAI/actions/runs/41018873877) and Documentation Gate [#41018873936](https://github.com/nasrinaiv0/nasrinAI/actions/runs/41018873936) passed on that prior head. This ledger update advances the documentation branch, so the final head must receive fresh exact-head validation before merge.

### Next actions
1. Add atomic image-quota reservation and a concurrency test spanning simultaneous requests/handler instances.
2. Add a registry-wide test for `parallelSafe` classifications, including all confirmation-required and side-effecting tools.
3. Harden the missing-`rateHit` fallback in `src/tools/agent.js`.
4. Run authorized authenticated production smoke tests for multitool requests, image count/partial failure/billing, and sandbox isolation; redact prompts and never log credentials.
5. Recheck branch protection with an appropriately authorized repository-admin connection.
6. Keep PR #716 marked planning-only until each feature has implementation, tests, security review, and explicit licensing clearance where applicable.
