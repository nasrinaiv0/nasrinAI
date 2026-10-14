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


## Research orchestration v2

The agent builds a bounded plan before web discovery. Focused questions use one
search; complex questions use up to three parallel searches: the original
question, domain-appropriate primary evidence, and counterarguments/limitations.
Academic questions prioritize peer-reviewed and primary research; technical
questions prioritize official documentation, standards and benchmarks; industry
questions prioritize credible reports and primary company sources.

Discovered URLs still pass the existing public-address/SSRF-safe reader and
robots.txt policy before page content is read. Page reads and fact extraction run
in parallel, bounded by the existing maximum page count. A failure on one source
does not fail the whole scan.

The evidence ledger normalizes duplicate facts, keeps source provenance, marks
facts as single-source or corroborated, and flags possible polarity conflicts for
review. These are review signals, not claims of independent verification. Each
fact remains attached to its source page. Responses add plan/evidence metadata
while retaining the existing facts and sources fields.

This increment does not bypass paywalls, authenticate to sites, scrape Scholar,
or claim citations were verified when the source does not provide them. Existing
privacy, retention, budget, rate-limit and SSRF controls remain in force.

## Phase 3 — Extensible source integrations

Research source discovery uses a provider-agnostic registry (`src/research-sources.js`). Adapters expose `id`, optional `kinds`/`enabled`, and `discover({ query, searchQueries, plan, signal })`; they return candidate URLs and metadata, never trusted facts. The registry normalizes candidates, rejects unsafe URL forms, deduplicates URLs, bounds result counts, applies timeouts/retries, and isolates adapter failures.

Adapters in this phase:
- `web-search`: existing web search, including focused/deep subquestions; can discover public technical documentation and industry reports.
- `crossref`: public Crossref metadata lookup only when the question explicitly includes a DOI; only that DOI is sent to Crossref, consistent with the privacy notice. General scholarly discovery uses the existing web-search adapter.
- User-supplied public URLs remain a separate explicit input path and are still checked by `checkUrl`, the SSRF-safe reader and robots.txt policy before reading.

Future scholarly indexes, official documentation catalogs, industry data feeds, and user-provided document sources can register adapters without changing the research loop. Do not send the full research question to Crossref or another new provider without a reviewed privacy disclosure. A candidate or Crossref record is discovery metadata, not proof that a claim is supported. Do not bypass logins, paywalls, CAPTCHA or robots exclusions.

## Phase 4 — Evidence-grounded synthesis and citation integrity

Each scan now includes a structured `report` built from extracted evidence, not
free-form generated prose. Findings keep stable report-local IDs, bounded text,
source links, and a conservative confidence label. Citations are included only
when their URLs match a source that was successfully read during the scan.
Skipped or unread sources cannot be presented as supporting citations.

The report surfaces findings with no readable-source citation, single-source
findings, and possible conflicts needing review. “Corroborated” means the same
normalized statement was extracted from multiple source URLs; it does not mean
the sources are independent or that the claim is proven. The existing `facts`,
`sources`, `plan`, and `evidence` response fields remain available. A saved
scan reconstructs the report from its stored facts and sources.

## Roadmap

- **Phase 1 — Bounded research planning:** focused/deep plans and domain-aware
  subquestions.
- **Phase 2 — Evidence ledger:** deduplication, provenance, cautious
  corroboration labels, and conflict review signals.
- **Phase 3 — Extensible source integrations:** provider-agnostic adapters,
  bounded retries/timeouts, source isolation, and privacy-preserving DOI lookup.
- **Phase 4 — Evidence-grounded synthesis:** structured findings, source-bound
  citations, and explicit limitations/conflict signals.
- **Phase 5 — Evaluation and operational hardening:** repeatable fixture-based
  end-to-end tests, quality metrics for citation coverage and source failures,
  and verified CI/deployment checks before release.
- **Phase 6 — Research experience:** user-facing report rendering, export, and
  optional Library saving only after the user explicitly confirms.

Phases 1–4 are implemented on the research-orchestration feature branch. They
are not considered release-complete until tests and required CI/deployment
checks pass and the pull request is reviewed.
