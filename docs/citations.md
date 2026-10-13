# Citations (research-friendly sources)

Owner request (2026-10-13): show the author and citation of a source in an
organized format, and let people choose the citation format. It is for
professors, researchers and students, so it must be facts only.

## How people use it

- **From a reply's sources:** open **Sources · n** under a web answer and tap
  **Cite** next to a source.
- **In the chat:** type "cite", "citation", "reference" or "bibtex" with one
  link or DOI, for example `cite https://doi.org/10.1038/s41586-020-2649-2`
  or `citation for 10.1038/s41586-020-2649-2`. The card is shown directly;
  no AI reply is made.

The card shows:

- **The details, organized:**
  - Authors, Title, Published in (journal, site or book)
  - Published date, Volume / issue, Pages
  - Publisher, ISSN / ISBN, DOI (as a link) or the link
  - Accessed date
- **Where the details came from:**
  - "Crossref, the publisher's DOI record", or
  - "the page's own publication information" (with a reminder to check it).
- **Missing details:** when there is no author or date, it says so. None is
  added.
- **A style picker:** APA 7, MLA 9, Chicago (author-date), Harvard, IEEE,
  Vancouver and BibTeX. The choice is remembered on the device.
- **The citation** in that style, with italics, and **Copy citation**. Where
  the browser allows, it copies with italics for Word or Google Docs, with
  plain text as a fallback.

## Facts only

Details are never written by an AI model.

- **Server:** `POST /v1/cite` (`src/web/cite.js`) with `{ url }` or `{ doi }`.
  1. **The page:** opened with the SSRF-safe link reader (`readLink(…, {
     withHtml: true })`, same rules as shared links: public addresses only, 8 s,
     1.5 MB). Its publication tags are read:
     - Highwire / Google Scholar `citation_*` tags;
     - Dublin Core, PRISM, Open Graph / `article:*`;
     - JSON-LD (ScholarlyArticle, Article, Book…).
  2. **Crossref:** when the page or the person gives a DOI,
     `https://api.crossref.org/works/{doi}` is asked. If it answers, its
     record is used, since it is the publisher's own registration.
  3. **Nothing found:** with no title, the request is refused (422), never
     filled in.
- **Formats:** `public/cite.js` only arranges the details:
  - "n.d." (APA, Chicago) or "no date" (Harvard) when there is no date;
  - an author-less entry starts with the title;
  - parts are built as text nodes and `<i>`, never HTML.
- **Prompt:** the system prompt tells the model, for academic or research
  questions, to prefer peer-reviewed, official and primary sources, name
  authors and years only when the source gives them, and never invent
  authors, titles, journals, dates, pages or DOIs.

## Limits and privacy

- Lookups have their own hourly allowance (`LIMIT_GUEST_CITE_HOUR`,
  default 20; `LIMIT_USER_CITE_HOUR`, default 120), separate from web reads
  and searches, so citing many sources never blocks web search.
- Only the page address or DOI leaves our server: to the site and/or Crossref,
  with the user agent `NasrinAI/1.0 (https://nasrinai.com)`.
- Nothing is stored. Privacy Notice version 2026-10-13c covers it.

## Not done

- No reference manager export (RIS / EndNote).
- No in-text citation generator.
- No lookups by title alone (a link or DOI is needed).
- Book chapters and theses use the same formats as articles with their own
  container; style manuals have many more special cases than these.

## Tests

`test/cite.test.js`:

- page tags, JSON-LD and a bare page;
- DOIs, names and Crossref mapping;
- the route: page then Crossref, DOI-only, refusals;
- all 7 styles for a journal article, plus an undated, author-less web page;
- the page wiring.
