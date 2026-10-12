# App redesign (2026-10-12)

The owner asked for the whole app to be redesigned and organized: animations, UI/UX, icons, button sizes and adaptive backgrounds. This file is the plan and the record. Each phase is its own branch and PR into `main`; the owner merges.

## Owner's choices (2026-10-12)

- **Navigation on phones:** an iOS-style bottom **tab bar**: Chat, Library, Projects, Settings.
- **Look:** **monochrome, refined.** Off-white and near-black, rounded headings (`--round`), the ball logo. No new colours.

These follow the owner decisions in `CLAUDE.md` (logo, type, no heavy bold or oversized text).

## Design system

All sizes, spacing, motion and surfaces come from tokens on `:root` (`public/app.css`, "Design system" block). New or redesigned parts use the tokens, not raw values.

| Token group | Values |
|---|---|
| Spacing `--space-1…8` | 4, 8, 12, 16, 20, 24, 32, 40 px |
| Touch size `--tap` | 44 px (Apple's minimum); `--tap-compact` 36 px for mouse-only controls |
| Radius | `--radius-sm` 10, `--radius-md` 14, `--radius-lg` 20, `--radius-xl` 26 px, `--radius-pill` |
| Type `--text-*` | xs 12, sm 13.5, base 16, lg 18, xl 22, title 28 px; headings use `--round` at weight 600 |
| Icons | `--icon` 20 px, `--icon-sm` 16 px; 24-unit grid, 1.8 stroke, round caps and joins |
| Motion | `--dur-fast` 120 ms, `--dur` 220 ms, `--dur-slow` 360 ms; `--ease` (glide) for most, `--ease-spring` for sheets and presses; off with reduced motion |
| Surfaces | `--bg`, `--bg-glow` (adaptive background), `--elev-1` / `--elev-2` shadows, existing glass tokens |

**Rules:**

- Every control is at least `--tap` on touch screens.
- Every control shows a pressed state and a visible keyboard focus ring.
- Nothing scrolls sideways from 320 px up.
- Motion never blocks input and stops with "Reduce motion".

**Adaptive background:** a soft light from the top over `--paper`. It follows light and dark mode and the device setting, and stays clear of the notch and home indicator (`env(safe-area-inset-*)`).

**Known exception:** reply links are orange (`#D96A1D` / `#FFAA70`), set earlier on `main`. It stays until the owner decides otherwise.

## Phases

| # | Branch | What | Status |
|---|---|---|---|
| R1 | `ui/redesign-foundation` | Design tokens, adaptive background, one press and focus style for every button | PR open |
| R2 | `ui/ios-tab-bar` | Phone tab bar (Chat, Library, Projects, Settings); simpler header; desktop keeps its side rail | To do |
| R3 | `ui/icon-set` | One consistent icon set across header, composer, reply actions, Settings | To do |
| R4 | `ui/motion` | Sheet, page and reply motion on the tokens; replies fade in without jumping the screen (handoff item 9); generation loader (item 8) | To do |
| R5 | `ui/screens-pass` | Settings as iOS grouped lists; Library, Projects and Code screens; sign-in; checked at 320, 390, 768 and 1280 px, light and dark | To do |

Already open and part of this direction:

- #224: header fit on phones
- #225: 44 pt touch targets
- #228: reply formatting
- #229: play/stop button
- #230: desktop Enter sends

## How each phase is checked

- A regression test that fails without the change.
- Headless-Chromium screenshots at 320, 390, 768 and 1280 px, light and dark, with no sideways scroll.
- `npm test` and `npm run check:secrets`.
- CI, GitGuardian and the Vercel preview green before handing back.
