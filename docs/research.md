# Research agent

`POST /v1/research` `{ query, urls? }` (any session). Off until `RESEARCH_ENABLED=true`.

1. Sources: the `urls` given (up to 5), else OpenAI web search citations
   (needs `WEB_SEARCH_MODEL`). At most `RESEARCH_MAX_PAGES` (default 3) are read.
2. Each page: robots.txt checked first (Disallow skips it; a missing file
   allows). Read with the SSRF-safe link reader (`src/web/read-link.js`):
   public addresses only, size and time caps, no logins, no JavaScript.
   Nothing is done to get past CAPTCHAs, bot blockers or paywalls.
3. The model lists up to 8 facts per page. Page text is passed as data, not
   instructions; the answer is parsed as JSON, cleaned, capped (10–300
   characters) and contact details are removed.
4. Saved:
   - `research_scans`: the question, pages and facts, private to the caller
     (tenant + owner on every read). Guests 24 h, signed in 30 days; purged by
     the hourly clean-up; deleted with the account; included in the export.
   - `research_facts` (shared): fact, source page and title, status. Never the
     question, the person or the session. Duplicates skipped (hash of fact +
     page). New facts are `pending`.

`GET /v1/research` lists the caller's scans; `GET /v1/research/:id` one scan.
Limits: `RESEARCH_PER_HOUR` per caller (default 10), twice that per IP, plus
the usual budget check. Usage is recorded as task `research`.

## Owner steps

1. Supabase (staging first) → SQL editor → run `db/migrations/036_research.sql`.
2. Vercel: `RESEARCH_ENABLED` = `true` (Preview, then Production); redeploy.
3. Review shared facts in Supabase → Table editor → `research_facts`:
   set `status` to `approved` or `rejected`. Approved facts are not yet used
   in chat answers (a later step).
