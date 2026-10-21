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
