# NasrinAI themes

Settings keeps **Appearance** (Light, Dark, System) independent from **Theme**. Theme choices are stored locally on the device and apply to both light and dark appearance modes.

## Available themes

| Theme | Visual direction | Action accent |
|---|---|---|
| Mono | Original monochrome, unchanged | Neutral |
| Orange | Neutral light/dark surfaces; pastel orange actions only | Pastel orange |
| Blush (formerly Charcoal) | Feminine pearl, rose and mauve | Rose |
| Galaxy | Deep navy and black-hole atmosphere; faint stars and distant planets in dark mode | Steel blue |
| Rose Quartz | Soft pink and mauve | Rose |
| Ocean | Cool sea-glass and deep teal | Aqua |
| Forest | Calm sage and evergreen | Sage |
| Sunset | Warm peach and terracotta, without overwhelming the surface | Peach |
| Midnight | Ink-black and blue-grey | Periwinkle |

## Implementation

- `public/theme.js` applies a valid saved palette before rendering to prevent a flash of the wrong theme.
- `public/app.js` validates the theme name, persists the selection in `nasrin.palette`, and synchronizes the Settings radio controls.
- `public/app.css` defines theme-scoped surface, text, line, glass, focus and accent tokens. Light, Dark and System are supported.
- Galaxy's celestial effects are CSS gradients only: no remote assets, trackers, or extra network requests. The stars and planet-like forms remain subtle behind the interface.
- Mono remains the default and keeps its original styling. The logo and product functionality are unchanged.

## Quality checks

Verify each palette in Light, Dark and System modes, reload persistence, selected-state/focus accessibility, mobile Settings layout, text contrast, and that Orange backgrounds remain neutral while buttons use pastel orange.
