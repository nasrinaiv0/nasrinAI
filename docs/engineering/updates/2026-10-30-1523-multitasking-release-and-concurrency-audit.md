
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

