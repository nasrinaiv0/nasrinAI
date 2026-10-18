# Performance baseline (2026-10-19)

First step of `docs/performance-optimization-handoff.md` (PR #363): measure before changing anything. **No application code was changed.**

## How it was measured

- `main` at the time of writing, served by the app's own server (`AI_PROVIDER=fake`), signed out, home page `/`.
- Headless Chromium over the DevTools Protocol, phone-sized (390 × 844, 2× scale), cache disabled, median of 3 runs. Repeat with `node scripts/measure-page-load.mjs <url> <runs> <throttle:0|1>` (set `CHROMIUM_PATH` if Chromium is elsewhere).
- "Slow phone" = 4× CPU slowdown, 1.6 Mbit/s down, 150 ms latency.
- **Not Lighthouse.** Lighthouse could not be installed in this environment (the package registry was unreachable for new installs), so there are no Lighthouse scores. Run one on the live site from your own device or Chrome DevTools and add it here.
- **Local server does not compress.** On the live site Vercel compresses text files, so real transfer sizes are much smaller than the "raw" column. Gzip sizes below are estimates computed locally, not live measurements. The slow-phone timings below use the uncompressed files, so they are pessimistic.

## Results: home page `/`

| Measure | Fast (local) | Slow phone (4× CPU, 1.6 Mbit/s) |
|---|---|---|
| First paint of content (FCP) | 164 ms | 3,424 ms |
| Largest content paint (LCP) | 188 ms | 3,424 ms |
| DOM ready | 257 ms | 5,165 ms |
| Page load finished | 301 ms | 5,557 ms |
| Requests | 37 | 36 |
| Transferred (uncompressed) | 1,042 KB | 1,041 KB |
| Page elements | 2,141 | — |
| Script errors | 0 | — |

Transferred by type (uncompressed): scripts 603 KB, stylesheets 208 KB, document 93 KB, images 41 KB, other 75 KB (the favicon).

Other pages: `/faq.html` loads 15 KB, FCP 356 ms on the slow phone setting.

## Biggest files

| File | Raw | Gzip (estimate) | Notes |
|---|---|---|---|
| `public/app.js` | 445 KB | 118 KB | One file for the whole app. Loaded with `defer`. |
| `public/app.css` | 198 KB | 41 KB | About 1,700 rules. Render-blocking (a stylesheet in `<head>`). |
| `public/index.html` | 92 KB | 19 KB | |
| `public/logo.png` | 75 KB | 60 KB | Used as the browser-tab icon, so every first visit downloads it. PNG barely compresses. |
| `files.js`, `cleaner.js`, `voice-wave.js` | 33 / 32 / 20 KB | 11 / 10 / 6 KB | Loaded on the first screen though used later. |

On the home page the script and style files add up to about 810 KB raw, roughly 200 KB compressed (estimate).

## What stands out (candidates, not yet changed)

1. **Large single script and stylesheet.** `app.js` alone is 43% of the transferred bytes (445 of 1,042 KB), and all scripts together 58%. Splitting out features used later (files, cleaner, voice, Connect dashboard) would shorten first load. The app has no build step, so this means separate files loaded on demand.
2. **Favicon is a 75 KB PNG.** `index.html` points `<link rel="icon">` at `/logo.png`. A small icon (`/icon.svg` or `/icon-192.png`) would save most of that.
3. **Images not marked lazy.** The home page has 6 `<img>` tags with no `loading="lazy"`, several inside sheets that are hidden at first.
4. **Heavy illustrations.** `public/space-logos/` holds SVGs of 135–526 KB each (the "busy" Code logos are 526 KB). They are only used when the Code area shows, but check they are not fetched early.
5. **Static files use `no-cache`** (re-checked on every visit with an ETag). This is deliberate (a phone must never pair a new page with an old script, see `src/http/static.js`), so any caching change must keep that safety, for example by file names that change with the content.
6. **Compression and live cache headers are unverified here.** Confirm on the live site that Vercel sends compressed responses and what cache headers it adds.

## Not measured yet

- Lighthouse scores; real-phone timings; signed-in screens; chat streaming speed; API response times; database query times (needs staging); load tests.
- `/_vercel/speed-insights/script.js` returns 404 locally (Vercel adds it on the live site only).

## Suggested next steps (each its own small PR)

1. Favicon and lazy images (lowest risk).
2. Move rarely used scripts to load on demand, keeping the strict page policy.
3. Re-measure with the same script and record the change here.
