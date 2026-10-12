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
| R2 | `ui/ios-tab-bar` | Phone tab bar (Chat, Library, Projects, Settings); simpler header; desktop keeps its side rail | PR open (builds on R1) |
| R3a | `ui/ios-header-icons` | iOS-style header icons (clock, gear, compose); a guest's Sign in moves above the message box | PR open (builds on #224, #231, #232) |
| R3 | `ui/icon-set` | The same icon style for the composer, reply actions and Settings | To do |
| R4 | `ui/motion` | Sheet, page and reply motion on the tokens; replies fade in without jumping the screen (handoff item 9); generation loader (item 8) | To do |
| R5 | `ui/screens-pass` | Settings as iOS grouped lists; Library, Projects and Code screens; sign-in; checked at 320, 390, 768 and 1280 px, light and dark | To do |

Already open and part of this direction:

- #224: header fit on phones
- #225: 44 pt touch targets
- #228: reply formatting
- #229: play/stop button
- #230: desktop Enter sends

## R2: the tab bar

- Phones and tablets (under 70rem wide) get a bottom tab bar: **Chat, Library,
  Projects, Settings**. Desktop keeps its side rail; there is no tab bar there.
- The tabs open the screens that already exist: Library and Projects open the
  chats sheet on that tab, and Settings opens Settings. Chat closes any open
  sheet. There are no duplicate screens.
- The current tab follows what is open (a `MutationObserver` on `hidden` and
  `aria-selected`), so it stays right however a screen was opened.
- The header's Settings button is hidden on phones, because the tab bar has it.
- The bar sits clear of the iPhone home indicator (`safe-area-inset-bottom`),
  and the message box sits above it.
- While typing on a touch screen, the bar steps aside for the keyboard. It
  comes back 300 ms after the message box loses focus, so a tap on Send lands
  before the box moves (this was a real bug found in the browser check). A
  tablet with a mouse or trackpad keeps its tabs while typing.
- Signed out, Library and Projects show the existing "Sign in" prompt.
- Sheets cover the bar, as iOS modal sheets do.
- Checked in headless Chromium at 320, 390 and 768 px (touch, light and dark)
  and 1280 px (no bar): switching tabs, the active tab, sending a message, and
  no sideways scroll. Test: `test/ios-tab-bar.test.js`.

## R3a: header icons and the guest Sign in

Owner request (2026-10-12): "change these icons make it iOS like icons" and
"move the sign in button at the top of composer if there is a guest using it".

- Icons in the SF Symbols style (thin 1.6 stroke, round ends): history is a
  clock with a back arrow, Settings is a gear (in place of the sliders), and
  New chat is the iOS compose square and pencil. The same icons are used in
  the header, the desktop rail and the tab bar.
- Signed out, a "Sign in" capsule (person icon) sits just above the message
  box on every screen size; the header no longer has a Sign in button, so the
  wordmark always fits. It is hidden when signed in or when no sign-in method
  is set up. It is 44 pt tall on touch screens, and it steps aside while the
  keyboard is up.
- Checked in headless Chromium at 320, 390 and 768 px (touch) and 1280 px,
  light and dark: no sideways scroll, and the capsule opens sign-in. Tests:
  `test/ios-header-icons.test.js`, `test/ios-header-fit.test.js`.

## How each phase is checked

- A regression test that fails without the change.
- Headless-Chromium screenshots at 320, 390, 768 and 1280 px, light and dark, with no sideways scroll.
- `npm test` and `npm run check:secrets`.
- CI, GitGuardian and the Vercel preview green before handing back.
