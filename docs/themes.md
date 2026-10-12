# Themes

Owner request, 2026-10-12: "aside from the appearance add theme (orange,
charcoal, galaxy)".

Settings has two choices, side by side:

- **Appearance:** Light, Dark or System (unchanged).
- **Theme:** **Mono** (the default monochrome look), **Orange**, **Charcoal**
  or **Galaxy**. Each theme has its own Light and Dark colours, so the two
  choices combine (for example Galaxy + Dark).

| Theme | Light | Dark | Main actions |
|---|---|---|---|
| Mono | off-white | near-black | black / white (unchanged) |
| Orange | warm paper | warm brown-black | orange |
| Charcoal | cool grey | charcoal grey | charcoal / light grey |
| Galaxy | lavender, soft violet glow | deep night sky with stars | violet |

## How it works

- `public/theme.js` sets `data-palette` on `<html>` before the page is drawn
  (no flash), next to `data-theme`. Mono means no attribute.
- `public/app.css`, at the end: each theme sets the page tokens (`--paper`,
  `--surface`, `--ink`, `--line`, glass, glow) for Light and Dark, and
  `--accent` / `--on-accent`. The accent colours the main actions only:
  Send, main buttons, switches, selected chips, the open model menu, links in
  replies and focus rings. Every accent rule sits under `:root[data-palette]`,
  so Mono is exactly as before.
- The logo stays monochrome in every theme (owner decision).
- `public/app.js` saves the choice on the device (`nasrin.palette`, like the
  appearance) and paints the phone's status bar in the theme's colour.
- Only the three known theme names are applied; anything else falls back to
  Mono.

## Privacy

The theme is a device setting, kept in the browser like the appearance. The
privacy notice's list of device choices now names it (version 2026-10-12a).
Nothing is sent to the server.

## Tests

`test/themes.test.js`. Checked in headless Chromium at 390 px for every theme
in Light and Dark: Settings picker, chat, Send colour, status-bar colour, and
the theme kept after a reload.
