# NasrinAI audit delta — 2026-10-30 15:08 Asia/Manila (07:08 UTC)

## Scope and evidence standard

- Repository: https://github.com/nasrinaiv0/nasrinAI
- Current main: 85db3be07e8fa895a835fa7736e2de8ea07b9ed5; merged PR #715.
- Current production deployment: https://vercel.com/nasrin-ai/nasrinai/HiEJFRKoymqDcVX2PMN88GmCtBqY; deployment ID dpl_HiEJFRKoymqDcVX2PMN88GmCtBqY, state READY, target production, Git source SHA 85db3be07e8fa895a835fa7736e2de8ea07b9ed5.
- Production root and /app.js were fetched from the deployment and returned HTTP 200. /creative-intent.js returned HTTP 200. These checks prove asset delivery, not authenticated feature behavior.
- No application code, database schema, migrations, Auth configuration, secrets, production records, PR merges or deployments were changed by this monitoring checkpoint. Documentation branches were updated only.

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

## Evidence links

- PR #713: https://github.com/nasrinaiv0/nasrinAI/pull/713
- PR #713 CI: https://github.com/nasrinaiv0/nasrinAI/actions/runs/41011007035
- PR #713 Documentation Gate: https://github.com/nasrinaiv0/nasrinAI/actions/runs/41011006873
- PR #714: https://github.com/nasrinaiv0/nasrinAI/pull/714
- PR #714 CI: https://github.com/nasrinaiv0/nasrinAI/actions/runs/41011532839
- PR #714 Documentation Gate: https://github.com/nasrinaiv0/nasrinAI/actions/runs/41011532965
- PR #715: https://github.com/nasrinaiv0/nasrinAI/pull/715
- PR #715 CI: https://github.com/nasrinaiv0/nasrinAI/actions/runs/41012048749
- PR #715 Documentation Gate: https://github.com/nasrinaiv0/nasrinAI/actions/runs/41012048771
- Main push CI: https://github.com/nasrinaiv0/nasrinAI/actions/runs/41012161842
- PR #716 planning spec: https://github.com/nasrinaiv0/nasrinAI/pull/716
- PR #716 initial failing Documentation Gate: https://github.com/nasrinaiv0/nasrinAI/actions/runs/41015502425
- PR #716 corrected-head CI: https://github.com/nasrinaiv0/nasrinAI/actions/runs/41018566624
- PR #716 corrected-head Documentation Gate: https://github.com/nasrinaiv0/nasrinAI/actions/runs/41018566645
- Current production deployment: https://vercel.com/nasrin-ai/nasrinai/HiEJFRKoymqDcVX2PMN88GmCtBqY

## Next audit actions

1. Harden src/tools/agent.js limited() so a missing store.rateHit method fails closed; add regression tests for absent, throwing and denied limiter implementations.
2. Execute authenticated synthetic tests for code workspace edits, batch command deadlines, sandbox reuse/release and network policy.
3. Run an authenticated image-generation test for count 1–4, allowance boundary, partial provider failure, usage/cost records and duplicate retries.
4. Review provider privacy disclosures against actual runtime routing and retention.
5. Keep PR #716 planning-only until feature-specific implementation and test evidence exists.
6. Complete carried-forward branch protection, leaked-password protection, migration 080–082, SECURITY DEFINER, Owner Command Center and attachment audits.
