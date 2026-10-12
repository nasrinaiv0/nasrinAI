# Feature audit (2026-10-12)

Backlog item 1 of `docs/claude-code-handoff.md` (PR #222). It records findings **before** any fix. Each fix goes in its own branch and PR.

## How it was checked

- **Base:** `main` at `8a7c8af` (PR #220). `npm test`: 439 pass, 0 fail. `npm run check:secrets`: no secrets found.
- **Local run:** the app's own server with the fake AI provider and a fake Supabase Auth. Email-code sign-in works end to end with this setup.
- **Browser:** headless Chromium.
  - A script opened the app fresh and clicked every visible control on the main screen, Settings, the chats sheet, the + menu and the Professional AI sheet.
  - It ran signed out and signed in, at 390 × 844 (iPhone) and 1280 × 800 (desktop).
  - For each click it recorded script errors, failed API calls and whether the screen changed.
  - Header fit was also measured at 320, 375, 390, 430 and 768 px.
- **Not checked here** (needs the owner's live keys or the live site, which this session cannot reach):
  - live AI replies and model tiers;
  - pictures, video and natural voices;
  - live voice conversation;
  - web search;
  - Google sign-in and Turnstile;
  - PayMongo checkout;
  - Messenger.

  These keep the "Not yet tested against live services" status in `CLAUDE.md`.

## What works

On the local run, every control responded: it either opened its sheet or page, or changed the screen. No script errors appeared, and no API call failed except the cases listed below.

- **Signed out:**
  - sending a message;
  - streaming reply;
  - copy box on code;
  - Listen, Copy, Share, Save to Library and Regenerate;
  - edit last message;
  - the four home buttons;
  - the + menu;
  - model picker;
  - Professional AI sheet;
  - voice button;
  - every Settings row.
- **Signed in:** everything above, plus:
  - the Library, Projects and Code tabs;
  - memory;
  - notices;
  - usage.

## Findings

| # | Severity | Where | What the user sees | Evidence | Fix branch |
|---|---|---|---|---|---|
| F1 | High | Header, signed out, after the first message (phones ≤ 390 px) | The page scrolls sideways and the **Sign in** button is cut off at the right edge. | Page width is 404 px at 320, 375 and 390 px. The header holds the brand, two icons, "New chat" and "Sign in". At 430 px it just fits. | `ui/ios-header-fit` |
| F2 | Medium | Header icons, composer buttons, sheet close buttons, home buttons | Tap targets are smaller than Apple's 44 × 44 pt minimum, so they are easy to miss on an iPhone. | Measured 40 × 40 for the history, settings, +, model, voice, send and close buttons. The home buttons and the account button are 38 px tall. | `ui/ios-touch-targets` |
| F3 | Low | Settings → Billing, signed out | "Sign in to see billing." is plain text with no button, and an empty "Payments" box is shown. | `GET /v1/billing` returns 403 (correct: billing is per account), but the page doesn't offer a way forward. | `fix/billing-signed-out` |

## By design (not bugs)

- **Enter starts a new line; only the Send button sends.** This is the owner's change of 2026-10-07 (commit `7f19391`).
- **Every visit asks `/v1/auth/refresh`, even signed out.** The sign-in cookie, not device storage, decides who is signed in, so an iPhone that cleared Safari storage stays signed in. A signed-out visitor gets a harmless 401.

## GPT capability list (owner's PDF) mapped to NasrinAI

The list describes what large language models can do in general. For each item: what NasrinAI already does, the gap, and the plan. Model internals (transformers and attention, vector embeddings, test-time compute) are properties of the chosen model, not app features. NasrinAI already uses embeddings for its semantic cache (`src/ai/embeddings.js`).

| Capability | NasrinAI today | Gap → plan |
|---|---|---|
| Intent and context tracking | History of the conversation, opt-in memory, recall of past chats | Covered. Media recall: backlog 7 `feature/media-recall` |
| Adaptive voice and translation | Answers in the user's language; Professional AI adjusts expertise | Add "explain simply / in depth" to reply style: backlog 3 |
| Step-by-step reasoning | Smart routing sends hard questions to stronger tiers (`src/ai/classify.js`) | Covered (depends on the live model) |
| Direct compliance (formats, limits, "don't include X") | Reply rules in `src/ai/prompt.js` | Tighten in backlog 3 `feature/reply-formatting` |
| Interactive clarification | Picture requests ask questions first | Add a "ask one short question when the request is unclear" rule: backlog 3 |
| Very large context (books, codebases) | Attachments are capped (4 files, 3 MB, `MESSAGE_MAX_CHARS` 4000); the Library is searched, not sent whole | Will not promise 1M tokens: cost and the provider decide. Larger per-plan file limits can be proposed separately. |
| Precise retrieval and comparison across files | Library full-text search; files read in chat | Partly covered. Multi-file compare follows backlog 2. |
| Multimodal (charts, handwriting, scanned PDFs) | Photos and PDFs go to vision-capable models | Covered when the live model supports it |
| Automated code execution | Not offered. The AI model cannot act on its own (CLAUDE.md rule 5); there is no sandbox. | **Not doing.** Instead, exact numbers for CSV/Excel come from server code, not the model: backlog 2 `feature/messy-file-cleaner` |
| Corpus summarization | Works through chat within the file caps | Covered within limits |
| Production-grade code | Code in replies, each block with a Copy button | Covered; backlog 3 checks every reply path |
| Strict formats (JSON, YAML, SQL, regex, Markdown tables, LaTeX) | Code blocks work. Tables are forbidden in the prompt and not rendered by `public/format.js`; LaTeX is not rendered. | Safe table rendering (no HTML from the model) in backlog 3. LaTeX later, without a library. |
| Professional and creative deliverables | Professional AI (44 professions); Markdown → HTML download (`public/markdown-html.js`) | Covered |
| Autonomous tool use (web search, research) | Web search with sources; read-only tools; Confirm card for actions | Sources as a collapsible control: backlog 5. Multi-step research runs stay budget-gated. |
| Data visualizations (charts, diagrams) | None | New `feature/safe-charts`, after backlog 2: the server checks a small chart spec and draws it as SVG (no scripts, CSP-safe, no dependency). The model never sends raw SVG/HTML. |
| Iterative co-creation | Edit last message, Regenerate, Save to Library | Covered |

## iOS-friendly redesign: principles for the UI branches

1. **Touch:** every control at least 44 × 44 pt (F2); no actions available only on hover.
2. **Fit:** no sideways scroll from 320 px up (F1); the header drops text labels before it overflows.
3. **Safe areas:** the composer and sheets keep clear of the home indicator and notch (`env(safe-area-inset-*)`); the keyboard never hides the composer.
4. **Sheets:** bottom sheets with a grabber, a close button at least 44 pt, and grouped rows like iOS Settings. Keep the current monochrome look and the rounded heading font (owner decisions).
5. **Feedback:** each button shows a pressed state; long actions show progress (backlog 8); `prefers-reduced-motion` is respected.
6. **Consistency:** one source of truth for signed-in state, model, Professional AI and theme, so every place that shows them updates together.

## Order of work

1. F1 `ui/ios-header-fit`
2. F2 `ui/ios-touch-targets`
3. F3 `fix/billing-signed-out`
4. Then the handoff backlog: 4 → 3 → 6 → 9 → 8 → 5 → 7 → 2 → `feature/safe-charts` → 10 (responsive and iOS pass)

Items that touch stored data (7, 2) wait for the owner's review of their plan.
