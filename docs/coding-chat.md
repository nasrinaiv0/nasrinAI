# Coding chat

A dedicated chat for building software, always inside a project.

## Opening it

- **Code** in the phone menu (under Library) and in the desktop rail.
- The **Start coding** starter, NasrinAI Space → **Coding**, and a project's
  **Code** action open it too.

People must be signed in (projects belong to an account). A window asks them
to **choose a project or create one** first; done projects are not listed.

## In the coding chat

- Top bar: the menu stays on the left; the project's name sits under
  "Nasrin" at the top center; on the right a **folder button** (tap to switch
  project or start a fresh coding chat in the same one) and **×** to leave. New chat, Your chats and Settings are hidden meanwhile.
- The home screen (Nasrin ball, greeting and starter buttons) is hidden; the
  coding chat starts empty with the message box.
- No question cards: the prompt leaves out the `[[ask]]` rule, the coding
  rule asks for one plain-sentence question at most, and a stray `[[ask]]`
  block is turned into plain text (`plainAsks` in `src/chat.js`).
- The Professional AI pill becomes **Code experts**: every message asks the
  Technology group (`mode: 'group', groups: ['technology']`); the server picks
  the experts a message needs (at most 3).
- Each message carries `coding: true`. The server then adds `CODING_RULE` and
  `CODING_CHAT_RULE` (`src/coding.js`) to the system prompt, keeps code files
  as their real type (`.html`, `.js`, … are not turned into PDFs), and skips the
  answer cache.
- The coding chat survives a reload (`nasrin.coding` on the device, cleared
  when signed out or when Projects are off). New chat, opening another chat
  or signing out leaves it.

## Logo

The Code chat logo is the owner's pixel robot (2026-10-12): shown in the top
bar while coding, on NasrinAI Space → Coding and in the project picker.
`public/space-logos/code-bot-{light,dark}.svg` (animated) and `-still.svg`
(reduced motion) were made from the owner's files with
`scripts/pixelbot-logo.py`: colours became attributes and the CSS animation
became SMIL `<animate>`, so the strict CSP (no inline styles) still allows
them. CSS (`.code-logo`) picks the tile for the theme and motion setting:
light UI → dark robot on a light tile, dark UI → the reverse.
While Nasrin works in the coding chat (thinking, remembering, reading,
searching) the thinking line shows `code-bot-*-busy.svg`: the robot pops up,
its pixels explode outwards while its face turns once like a globe (sliding
across the fixed grid), pauses at 360°, then snaps back with a bounce (pixel-perfect; still when motion is
reduced).

## Replies

- Compact type: smaller text, plain (not rounded) headings, smaller code
  (`body.coding-mode` in `public/app.css`).
- Each reply starts with a one-line result and ends with a **super simple
  summary** as a status list:

  ```
  [[checks title="Summary"]]
  ok | What was done | Done
  warn | What to watch | Check
  todo | What the person must do | Your step
  [[/checks]]
  ```

  Statuses: `ok`, `fail`, `warn`, `secure`, `info`, `todo` → green check,
  red ✕, orange warning, green shield, grey info, amber key. Icons are
  outline SVGs drawn in `public/format.js` (nothing is loaded from other
  sites, so the strict CSP stays). A status emoji (✅ ❌ ⚠️ 🛡️ 🔒 ℹ️ 🔑) at the
  start of a heading, list item or paragraph also becomes its icon, in any
  chat. Copy and read-aloud turn rows into plain words.

No new data is stored: coding chats are ordinary project chats.

## GitHub

Connect GitHub from Plugins in the menu; Nasrin reads repositories with read-only tools, and **Open pull request** under a reply with files opens a pull request on a new branch after Confirm. See `docs/github.md`.


## Production-grade implementation standard (2026-10-13)

The default is a complete, maintainable, production-oriented implementation—not a cheap prototype, demo, or MVP unless the person explicitly asks for one.

For substantial work, Nasrin follows one delivery loop: inspect the actual repository and constraints; define acceptance criteria; plan related file changes; implement the real end-to-end behavior; add regression, edge-case, and security tests; review reliability, accessibility, performance, and maintainability; run checks that are actually available; and report evidence plus unresolved gaps.

A complete result should wire visible controls to real behavior, include validation and authorization, tenant/data isolation, useful failure states and safe diagnostics, secure configuration, relevant migrations, documentation, and deployment/rollback notes where applicable. Do not use fake integrations, hardcoded secrets, placeholder data presented as real, TODO-only stubs, or silent scope reductions.

Nasrin must inspect existing files before editing and reuse the repository's architecture. It must not invent routes, schema, provider APIs, environment variables, or dependency versions. A plan alone is not completion when implementation is possible. It must never claim tests/builds passed without observed tool output. If execution or a required external service is unavailable, clearly label that verification as outstanding; do not falsely call the work production-ready.

This quality standard does not authorize destructive changes, secret exposure, security weakening, production writes, merges, or deployments without required authorization.

## New chat, Summary and pull request chips (2026-10-13)

- **New chat** inside the coding chat opens a fresh coding chat in the same
  project; it does not go back to the normal chat. The header's leave button
  is how to leave the coding chat.
- **Autonomous execution and continuity**: coding chat must use connected repository tools immediately, preserve earlier conversation context and unfinished work, inspect the actual frontend before UI changes, fix ordinary test/build failures without asking, and rerun checks. It must not emit question cards or ask the user to inspect files when tools can do so. During active work it re-checks relevant status as often as the execution environment permits (target interval: 5 seconds); this is not a persistent background watcher after the response ends.
- **Summary**: every coding-chat reply ends with the `[[checks title="Summary"]]`
  status list (`CODING_CHAT_RULE` in `src/coding.js`), also for short answers
  and questions.
- **Pull request chips**: when the reply used `github_pr_status`, the server
  adds `[pr:owner/name#N state +A -D]` (state: open, draft, merged, closed);
  for `github_list_pull_requests` it adds `[prs:owner/name count]`
  (`src/github/chips.js`). The page shows them as "Diff +A −D", "#N · Merged"
  and "Pull requests · count", linking to GitHub. They are made only from
  GitHub's answer: lines the model writes in that shape are removed, so a
  chip cannot claim a merge that never happened.

## Grounded reviews and audits (2026-10-14)

An audit in the coding chat once quoted settings and code lines that do not
exist in the repository (`CORS_ALLOWED_ORIGINS`, `allowCredentials: true`, a
`PORT` default of 3000). `CODING_CHAT_RULE` now requires: quote only code a
`github_` tool returned in the chat, word for word, with `path:line`; never
claim to have read a file no tool returned; read a file instead of guessing or
offering to check later; mark each finding **Confirmed** (path:line) or **Not
verified** (what is missing). This is an instruction to the model, so it lowers
the risk of invented findings but cannot rule it out.


## Execute-first task handling (2026-10-14)

When the user gives a concrete repository task—especially a named PR/commit,
acceptance checklist, test request, or audit—Nasrin must execute that task
rather than summarize the architecture or ask what behavior is desired. It
must distinguish the requested outcome from incidental reference material:
unrelated examples (including examples in other programming languages or
formats) must not redirect the task unless the user explicitly asks to
integrate them.

The expected loop is: inspect the named repository and current ref; translate
the request into acceptance checks; use available tools to inspect, run checks,
and reproduce issues; fix verified defects within the authorized scope; rerun
checks; then report evidence, unverified items, and exact blockers. Ask a
question only when a missing decision materially blocks safe action. A prompt
rule is guidance, not a guarantee, so regression tests cover the presence of
these instructions and actual tool evidence must still support every completion
claim.


## Tier-specific coding models (2026-10-21)

- **Max:** `openrouter:openai/gpt-6-sol` ($2/M input, $10/M output listed).
- **Ultra:** `openrouter:openai/gpt-6.1-sol` ($2/M input, $10/M output listed).
- Ultra deep-coding route is also pinned to GPT-6.1 Sol. These are server-side, tier-scoped allowlisted routes; Max cannot select the Ultra model through the Max coding route. Source pricing: https://openrouter.ai/openai/gpt-6-sol/ and https://openrouter.ai/openai/gpt-6.1-sol/.
- Defaults select these OpenRouter models when `OPENROUTER_API_KEY` is configured. Otherwise the existing approved Anthropic fallback remains. To force the selection explicitly in Vercel, set `CODING_MAX_MODEL=openrouter:openai/gpt-6-sol`, `CODING_ULTRA_MODEL=openrouter:openai/gpt-6.1-sol`, and `CODING_ULTRA_DEEP_MODEL=openrouter:openai/gpt-6.1-sol`.
- Current automated tests verify tier/model pinning; live authenticated coding requests, cost reconciliation, and output quality still need Preview smoke testing.

## Automatic failure detection and repair (2026-10-29)

The coding chat no longer relies on the model alone to notice a failed check. `src/auto-repair.js` classifies every `github_run_command` / `github_render_test_screenshot` result. When the last check failed in a way code can fix (non-zero exit, rejected patch, failed install/preview/test) and the model tries to finish, the chat sends it back automatically with a short "[NasrinAI automatic check n/3]" note to diagnose, fix the code and re-run, at most 3 times per message. The page shows "A check failed — fixing it" meanwhile. Environment problems a code change cannot fix (rate limit, GitHub not connected, sign-in) never trigger a repair round. The coding chat gets up to 12 tool rounds (other chats keep 4), always inside the reply's time limit (below). A failed `run_code` counts as a check too. Nothing is merged or deployed automatically; pull requests still need Confirm.

## Edit workspace, like a developer (2026-10-30)

`src/github/workspace.js` gives the coding chat a workspace for a GitHub repository, so Nasrin works the way a coding assistant does: find files (`github_find_files`, `github_search_code`), read them, edit, test, fix, re-test.

- `code_edit`: exact find-and-replace. `old_string` must match exactly one place (or set `replace_all`); otherwise the tool says why and nothing changes.
- `code_write`: a new file, or a small file replaced whole.
- `code_changes`: what changed so far. `code_revert`: undo one file or all.
- `github_read_file` returns Nasrin's edited version once a file changed.
- `github_run_command` writes the edited files into the sandbox before the command (paths checked like patches: never `.git`, `node_modules`, `.env`), so tests run against the edits without a hand-written diff. `patch` still works on top.
- At the end of the reply the change set is attached as `[[file]]` blocks: SEARCH/REPLACE parts that apply to the base exactly like a pull request, or whole files for new files and `replace_all`. Blocks the model wrote for the same paths are replaced. The person reviews them and opens a pull request with the usual Confirm. Nothing is written to GitHub by the workspace.
- The reply's `response_metadata.code_workspace` (`repo`, `ref`, `files`; no code) marks it, and the next message continues from that reply's changes. Changes that no longer apply (for example, already merged) are dropped with a note.
- Limits: 20 files, 200 KB per file, 500 KB in all; state lives for one reply (at most 15 minutes) in server memory. Attached blocks must fit the stored reply (about 18,500 characters): a block that does not fit is left out whole, never cut, and named in the reply.

## Time guard (2026-10-30)

A reply must finish inside the 120-second server limit (`vercel.json`). Before each tool call the chat checks the time used: a tool that could not finish before `TURN_TIME_LIMIT_MS` (112 s) is not started (`out_of_time`), and after `TOOL_TIME_BUDGET_MS` (85 s) or a skipped tool the model gets no more tools and answers with what is done and what is left; the person can say "continue". No repair round starts once time is short.

Tests: `test/code-workspace.test.js`.

## Many commands per reply (2026-10-30)

The coding chat investigates first and then runs as many commands as the task needs (`src/github/runner.js`):

- **Batches:** `github_run_command` takes `commands`, up to 10 lines, each checked exactly like a single command, same runtime. They run in order and stop at the first failure unless `keep_going` is true. Long output keeps its start and end (where errors are); failed commands get the most room.
- **One sandbox per reply:** in a chat, the sandbox (same person, chat, repository, ref, runtime) stays open for the rest of the reply, at most about 115 seconds, so later runs skip the download and install. Only changed workspace files are written again; reverted ones are restored from GitHub (new ones removed). A changed `package.json`, `package-lock.json` or `requirements.txt`, or a `patch`, gets a fresh sandbox. The reply's end closes it (`release`, called when the workspace finishes). Other chats never share it.
- **Deadline:** the chat passes the reply's deadline to the tool (`ctx.deadline`). The runner stops a batch before it (`out_of_time`, exit 124 for a cut command), so it may start with about 20 seconds left instead of reserving its full 85-second limit.
- **More tools:** `npx` (installed tools only, never downloads: `--no`), `pip list|show|freeze|check`, `head`, `tail`, `wc`, `diff`, `sort`, `uniq`, `cut`, `tr`, `echo`, `pwd`, `du`, `stat`, `file`, `which`, `make`, alongside the earlier ones. Still no shell operators, no network after install, no `git push/pull/fetch`.
- **Limit:** `CODE_RUNS_PER_HOUR` (default 60, 1–1000) per person; a batch counts once.

Tests: `test/batch-commands.test.js`.

