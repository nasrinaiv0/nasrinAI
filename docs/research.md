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


### Phase 5 — Evaluation and operational hardening (in progress)

The API now returns deterministic per-scan quality indicators alongside the
report: source read rate, failed/skipped source count, citation coverage,
uncited findings, single-source findings, conflict-review count, and adapter
failures. Empty denominators are reported as `null`, not misleading zeroes.
These are operational diagnostics, not a truth score or proof of independent
corroboration.

The fixture-based test suite includes assertions for these metrics. Phase 5
remains open until the full repository test suite, secret/dependency audits,
database checks, and the Vercel deployment status are reviewed and passing.
The workflow must be treated as failed if any required job fails; do not merge
or deploy on the basis of source changes alone.


## Phase 6 — Report presentation, export, and explicit Library save

A research scan includes a structured `report`; clients can present its findings,
confidence labels, source links, limitations, and potential conflicts. The API
also exposes download endpoints for a caller-owned scan:

- `GET /v1/research/:id/export?format=markdown` — Markdown report.
- `GET /v1/research/:id/export?format=html` — standalone responsive HTML report.
- `GET /v1/research/:id/export?format=json` — JSON scan/report data.

Exports are private, non-cacheable downloads. HTML escapes untrusted finding and
source text and uses a restrictive content security policy. Only these formats
are supported; unsupported formats return `400 invalid_export_format`.

Saving to the Library is a separate action, never an automatic side effect of
research or export:

- `POST /v1/research/:id/save-to-library` with `{ "confirmed": true }`.
- The client must first ask the person and call this endpoint only after an
  affirmative confirmation. Missing confirmation is rejected.
- The person must be signed in; guest sessions cannot save into a personal
  Library. The report is saved as a Markdown file under the caller's own
  tenant/user scope, with the Library's existing quotas and validation.
- The endpoint returns the saved Library item metadata. A scan is still kept
  under the existing research retention policy independently of Library saving.

This phase adds API rendering/export and the explicit save contract; it does not
by itself establish that a frontend confirmation dialog has shipped. Full CI,
database, dependency/secret audit, and deployment verification remain required
before merge or production release.

## Research workspace UI

The main app exposes **Research** from both the desktop rail and the mobile/tablet drawer. It supports a research question, optional public URLs (one per line), a structured findings view, recent caller-owned scans, source status, and quality/limitation signals. Findings and source titles are inserted as text, and external citations are restricted to HTTP(S) links with opener/referrer protections.

Reports can be exported as Markdown, HTML, or JSON. Export is a download only; it does not create a Library item. **Save to Library** is a separate action, asks for explicit confirmation, and is available only for a signed-in user. The server independently enforces both the confirmation flag and user ownership. A research scan never saves a report to Library automatically.

Before relying on a report, review each source, single-source labels, conflict flags, and the quality/limitations section. Corroboration is a matching-extraction signal, not proof that sources are independent or claims are true.
