# Search and address basics

Part of the production-quality upgrade (`docs/nasrinai-production-quality-anti-vibe-coding-upgrade.md`, PR #366, sections 3, 4 and 6). Canonical address: `https://nasrinai.com`.

## What is in place

| Item | Where | Notes |
|---|---|---|
| Page title, description, canonical address, share tags (Open Graph, Twitter card) | `public/index.html`, `faq.html`, `legal.html` | One description per page. Share image is `/icon-512.png` (a square icon, not a designed share card). |
| `robots.txt` | `public/robots.txt` | Allows public pages; hides `/v1/` (API), `/chat/` (shared chat links) and `/ncc/` (NCC app). Points to the sitemap. |
| `sitemap.xml` | `public/sitemap.xml` | Home, FAQ, Terms, Privacy. Keep it in step with new public pages. |
| 404 page | `public/404.html` | Branded, `noindex`. The app server returns it with status 404 when a browser asks for HTML; API paths and other clients keep their JSON / plain answers. |
| Shared chat links | `public/chat.html` | Already `noindex, nofollow`. |

## Not verified from the repository

- Vercel serves `public/404.html` for unknown static paths on the live site. Check `https://nasrinai.com/some-wrong-address` after deploying: it should show the page with status 404.
- Whether `www.nasrinai.com` redirects to `nasrinai.com` (Vercel domain setting, not in the repo).
- Search-engine indexing: nothing here proves a page is indexed.

## Fixed: unstyled FAQ and registry pages

`public/faq.html` and `public/nasrinai-professional-workforce-registry.html` used inline `<style>` blocks (and one `style=` attribute), which the page policy (`style-src 'self'`) blocks. Rendered locally under the real policy, the FAQ showed as plain black-on-white text. The styles now live in `public/faq.css` and `public/registry.css`; the policy was not loosened. A test fails if an inline style returns.

## Open findings

- Structured data (JSON-LD) is not added: it needs an inline script, which the strict policy forbids, and no verified business facts exist to put in it.

## Next steps from the spec

Route inventory table, favicon/size review, console and source-map review, then live checks.
