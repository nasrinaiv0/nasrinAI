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
