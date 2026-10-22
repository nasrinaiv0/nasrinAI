# Nasrin and the internet

## Links people share

When a message contains a link (up to 2), the server opens the page, keeps
only its readable text (no scripts, menus or styles), and adds it to that
turn for the model, marked as data, not instructions. The page text is not
saved with the conversation. If a page cannot be opened, Nasrin is told why
and says so.

Safety rules (server-side request forgery): only `http`/`https` on the normal
ports, no passwords in links, and internal or private addresses are refused,
checked again at the moment of connecting and on every redirect (at most 3).
Pages are cut off at 8 seconds and 1.5 MB, and only text-like pages are read.
`LIMIT_GUEST_WEB_HOUR` / `LIMIT_USER_WEB_HOUR` cap how many reads and
searches one person can trigger per hour. `WEB_LINKS=false` turns it off.

## Web search

Questions that benefit from current facts are answered using OpenRouter's
`openrouter:web_search` server tool through the OpenRouter Responses API.
OpenRouter can choose when to search and can run multiple searches during one
response. The default engine is `auto`: it uses native provider search when
available and falls back to Exa otherwise. Set the server-side
`OPENROUTER_WEB_SEARCH_MODEL` to override the default model
(`openrouter/auto`); leave it empty to disable web search. The server-side
`OPENROUTER_API_KEY` is reused, so no Google Custom Search key or engine ID is
required.

Search results and URL-citation annotations are parsed server-side, validated
to allow only HTTP(S) URLs, and shown as source links. Search failures do not
break ordinary chat; the app falls back to its normal answer path. Browsing
costs depend on the OpenRouter model and search engine selected, in addition
to any model token charges. See the
[OpenRouter Web Search documentation](https://openrouter.ai/docs/guides/features/server-tools/web-search).

The sources stay in the saved reply as a "**Sources**" list of links (so
history, copy, share and Library keep them). The page takes that list out of
the reply text and shows a **Sources** button beside the reply actions. Only
HTTP(S) links are folded; anything else is left in the text as written.

If a question did not look current but the model's draft says it lacks current
facts, Nasrin can trigger web research instead of presenting the uncertainty
as a verified live answer. Questions about browsing itself are answered
without unnecessary search.

## Site logos

Each source in a reply's Sources list, and the badges on the Sources button,
show the site's **real logo**, to credit the source. A line under the list
says the logos and names belong to their sites.

- **Where logos come from:** the browser loads `GET /v1/site-icon?host=…`
  from our own server (`src/web/site-icon.js`), never from the site, so the
  page's strict CSP (`img-src 'self'`) holds and the person's browser contacts
  no one else (`referrerpolicy="no-referrer"`).
- **How our server finds a logo:** it reads the site's home page for its
  declared icon (apple-touch-icon, then the largest `icon`), else
  `/favicon.ico`, with the SSRF-safe reader: public addresses only, checked
  on every redirect, 8 s, 100 KB (`readBytes` in `src/web/read-link.js`).
- **What is passed on:** only real raster images (PNG, ICO, JPEG, GIF, WebP,
  checked by their first bytes). SVG is refused because it can carry scripts.
  The answer is served with `nosniff`,
  `Content-Security-Policy: default-src 'none'; sandbox` and
  `Cross-Origin-Resource-Policy: same-origin`.
- **Caching:** logos are kept in memory for a day (misses for an hour), and
  browsers keep them for a day. Only requests that reach a website count
  against the per-IP limit (300 an hour).
- **No logo found:** the site's first letter shows instead.
- **Privacy:** Privacy Notice 2026-10-13d says our server asks websites for
  their icons. Nothing about the person is sent.


## Visual web previews

When a researched answer includes source links, the chat can show up to three
thumbnail images from those pages' Open Graph or Twitter card metadata. Each
thumbnail links to its cited source; pages without a usable image simply have
no thumbnail. This does not generate replacement pictures and does not change
the cited answer.

Images are fetched through `GET /v1/page-preview?url=…` on the server, never
directly by the browser from third-party hosts. The page and image fetches use
the SSRF-safe reader, which blocks private/internal addresses and revalidates
redirects. The endpoint accepts only validated PNG, JPEG, GIF, and WebP bytes,
rejects SVG and other active content, sets `nosniff` and a sandbox CSP, and
returns same-origin responses. Results are cached in memory (successes for a
day, misses for an hour), capped at 300 page entries, and guarded by the
existing per-IP site-icon request limiter. The UI uses lazy loading, accessible
alt text, responsive cards, and removes broken thumbnails automatically.


## YouTube tutorials in chat

Set the server-side Vercel environment variable `YOUTUBE_DATA_API_KEY` to a Google Cloud API key with the YouTube Data API v3 enabled. Do not use a browser-visible variable or expose this key in client code. If the key is absent or YouTube search fails, chat still works normally and no video cards are shown.

For fresh assistant replies, the UI detects explicit tutorial, walkthrough, demonstration, and directions/navigation intent from the latest user message. It then searches YouTube through authenticated `GET /v1/youtube/search?q=…`, returning up to five relevant video results; the chat renders at most three responsive embedded players. Ordinary replies do not trigger video search. Embeds use `youtube-nocookie.com`, lazy loading, validated 11-character video IDs, and a visible link to open the video on YouTube. The page CSP permits only the YouTube player hosts and its thumbnail host.

The integration uses the **YouTube Data API** for public video search and metadata. The separate YouTube Analytics API is for an authenticated channel owner's private performance reports and is not needed to search or embed public videos. If channel analytics are added later, implement OAuth consent and least-privilege scopes separately; never request channel access just to show tutorials.


## Inline internet image search

When a person explicitly asks for real photos or images from the internet, the chat page calls the authenticated `GET /v1/web-images/search?q=…` endpoint and renders up to five Wikimedia Commons results in a responsive gallery. Results include a caption, original file page, creator when available, and the license label. The upstream search is server-side; the browser only loads validated HTTPS thumbnails from `upload.wikimedia.org`. The strict CSP allows that one image host; scripts and API calls remain same-origin. If search fails or yields no usable results, the chat shows a short fallback rather than claiming that inline images are unsupported.

Wikimedia Commons is the initial provider and results can be incomplete for some queries. Image availability, license terms, and attribution should be checked on the linked file page before reuse. Image-search requests share the existing per-IP web/search rate limiter.


## Broader automatic discovery

Automatic web search is not limited to words such as "today" or "latest". The chat also recognizes common public-information requests where live sources improve coverage: questions about named public entities, reviews, alternatives, pros and cons, official documentation, peer-reviewed papers, market/industry research, statistics, and comparisons of products, models, tools, platforms, or services. It intentionally leaves ordinary timeless questions (for example, "Explain photosynthesis" or "What is a variable?") to the regular answer path unless the person asks for sources or current information. Capability questions such as "Can NasrinAI browse the internet?" do not trigger a paid search.

This is an intent heuristic, not a guarantee that every question is searchable. Search still runs only when the caller's plan/policy, hourly limit, and spending budget allow it; results without usable source links are rejected rather than shown as verified. Existing source display, provider redaction, usage accounting, and privacy protections remain in effect.


## Search-quality controls

Every web-search request now instructs the search model to prioritize directly relevant evidence, prefer primary and authoritative sources when available, cross-check material claims with multiple credible sources when feasible, inspect dates for time-sensitive claims, and clearly report uncertainty or disagreement. These instructions do not treat repeated reporting as independent corroboration and explicitly prohibit invented sources or statistics.

The search context is selected by intent: ordinary lookups use medium context, while research, comparisons, peer-reviewed literature, market analysis, and explicit cross-check requests use high context. The Responses request also asks for the complete set of sources consulted, where supported, in addition to citations. The UI continues to show sources actually cited by the answer; a merely consulted source must not be presented as if it supports a claim. Higher context can increase latency and usage, so it is limited to research-oriented requests and remains subject to existing budget and rate controls.


## YouTube-first discovery routing

Clear requests to find recent or named YouTube videos are routed to the existing authenticated `/v1/youtube/search` endpoint before general AI model/provider selection. This public retrieval path does not call a chat model and can run when general AI routing is unavailable. It still requires the server-side YouTube Data API configuration, quota, and existing session/rate controls. Only server-validated, embeddable, region-available video IDs are rendered. If retrieval fails, the UI offers a direct YouTube search link. Video generation and requests to explain or summarize a video remain on their normal AI routes.
