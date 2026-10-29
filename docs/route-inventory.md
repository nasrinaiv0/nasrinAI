# Public route inventory (2026-10-29)

Source of truth: `public/*.html`, `vercel.json` (rewrites, redirects, headers),
`public/robots.txt`, `public/sitemap.xml`. Update this file, the sitemap and
`test/route-inventory.test.js` together when a public route changes.

| Route | Indexed | Notes |
| --- | --- | --- |
| `/` (`index.html`) | yes | App; canonical `https://nasrinai.com/` |
| `/faq.html` | yes | Canonical set |
| `/legal.html?doc=terms`, `/legal.html?doc=privacy` | yes | One canonical (`/legal.html`) for both documents — see open item 2 |
| `/chat/:code` → `chat.html` | no | Hosted business chat; `Disallow: /chat/` |
| `/ncc/` (also `ncc.nasrinai.com` → `/ncc/`) | no | Team CRM; `Disallow: /ncc/` |
| `/video-studio.html` | no | Signed-in tool |
| `/nasrinai-professional-workforce-registry.html` | no | Internal reference page |
| `/v1/*`, `/healthz` | no | API; `Disallow: /v1/` |
| any other path | no | `404.html` with status 404 |

Checks done: no `.map` files or `sourceMappingURL` in `public/`; no
`console.log`/`console.debug` in public scripts.

## Open items

1. **Canonical host (owner, Vercel):** pages, the sitemap and the JSON-LD use
   `https://nasrinai.com`, but Vercel currently sends `nasrinai.com` to
   `www.nasrinai.com` with a temporary 307. Make `nasrinai.com` the production
   domain and redirect `www` to it with a permanent 308 (or switch every
   canonical to `www`). Until then search engines see canonicals that redirect.
2. **Legal page canonical:** both documents share `/legal.html` as canonical.
   Give each document its own static URL before relying on both being indexed.
3. **Structured data:** not added. JSON-LD must be an inline `<script>` data
   block, and `test/page.test.js` forbids every inline `<script>` on the app
   page (strict CSP guard). Adding it needs an owner decision to allow a
   narrow `application/ld+json` exception in that guard.
