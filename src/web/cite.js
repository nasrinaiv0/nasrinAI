import { HttpError } from '../http/errors.js';
import { readLink } from './read-link.js';

// Citation details for one source (docs/citations.md): facts only, never
// written by an AI model.
//
// 1. A web address is opened with the SSRF-safe link reader and its own
//    publication tags are read: Highwire/Google Scholar `citation_*`,
//    Dublin Core, PRISM, Open Graph / article tags and JSON-LD
//    (ScholarlyArticle, Article, Book ...).
// 2. When the page (or the person) gives a DOI, Crossref's public record for
//    that DOI is used instead: it is the publisher's own registration.
// 3. Anything not found is left out, never guessed. `from` says where the
//    details came from.

const DOI = /\b(10\.\d{4,9}\/[^\s"<>]+)/i;
const CROSSREF = 'https://api.crossref.org/works/';
const ISO_DAY = /^(\d{4})(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?/;

const clean = (s, max = 300) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const decode = (s) => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16) % 0x110000))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d) % 0x110000))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

export function doiOf(text) {
  const m = DOI.exec(decodeURIComponent(String(text || '').replace(/%(?![0-9a-f]{2})/gi, '%25')));
  return m ? m[1].replace(/[.,;)\]]+$/, '').toLowerCase() : null;
}

// "Cruz, Ana" / "Ana Cruz" / "Ana B. Cruz" -> { given, family }; a group name stays whole.
export function personOf(raw) {
  const s = clean(raw, 160);
  if (!s) return null;
  if (s.includes(',')) {
    const [family, given] = s.split(',', 2).map((x) => x.trim());
    return given ? { given, family } : { literal: family };
  }
  const parts = s.split(' ');
  if (parts.length === 1 || /\b(university|institute|organization|organisation|association|council|department|ministry|team|staff|inc\.?|ltd\.?|corp\.?)\b/i.test(s)) return { literal: s };
  return { given: parts.slice(0, -1).join(' '), family: parts.at(-1) };
}

function dateOf(raw) {
  const m = ISO_DAY.exec(clean(raw, 40));
  if (!m) {
    const d = new Date(clean(raw, 40));
    return Number.isNaN(d.getTime()) ? null : { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  const year = Number(m[1]);
  if (year < 1400 || year > 2200) return null;
  return { year, ...(m[2] ? { month: Number(m[2]) } : {}), ...(m[2] && m[3] ? { day: Number(m[3]) } : {}) };
}

// The page's own tags -> citation details.
export function metaFromHtml(html, url) {
  const head = String(html || '').slice(0, 400_000);
  const metas = [];
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (/\b(?:name|property|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1];
    const value = (/\bcontent\s*=\s*"([^"]*)"/i.exec(tag) || /\bcontent\s*=\s*'([^']*)'/i.exec(tag) || [])[1];
    if (key && value !== undefined) metas.push([key.toLowerCase(), decode(value)]);
  }
  const all = (...keys) => metas.filter(([k]) => keys.includes(k)).map(([, v]) => clean(v)).filter(Boolean);
  const one = (...keys) => { for (const k of keys) { const v = all(k)[0]; if (v) return v; } return ''; };

  // JSON-LD (the first scholarly or article-like item).
  let ld = null;
  for (const m of head.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const items = [].concat(data['@graph'] || data).flat();
      ld = items.find((x) => x && /ScholarlyArticle|Article|Book|Report|Thesis|Chapter|NewsArticle|BlogPosting|WebPage/i.test([].concat(x['@type'] || '').join(' '))) || ld;
      if (ld) break;
    } catch { /* not JSON */ }
  }
  const ldName = (x) => (typeof x === 'string' ? x : x && (x.name || [x.givenName, x.familyName].filter(Boolean).join(' '))) || '';
  const ldAuthors = ld ? [].concat(ld.author || []).map(ldName).map((s) => clean(s, 160)).filter(Boolean) : [];

  const scholarly = all('citation_title').length > 0;
  const authorNames = all('citation_author').length ? all('citation_author')
    : all('dc.creator', 'dcterms.creator').length ? all('dc.creator', 'dcterms.creator')
      : ldAuthors.length ? ldAuthors
        : all('author', 'article:author').filter((a) => !/^https?:\/\//.test(a));
  const title = one('citation_title', 'dc.title', 'dcterms.title', 'og:title') || clean(ld?.headline || ld?.name) || clean(decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head) || [])[1] || ''));
  const container = one('citation_journal_title', 'citation_conference_title', 'citation_book_title', 'prism.publicationname', 'dc.source')
    || clean(ld?.isPartOf?.name || ld?.isPartOf?.isPartOf?.name) || '';
  const published = dateOf(one('citation_publication_date', 'citation_date', 'citation_online_date', 'dc.date', 'dcterms.issued', 'prism.publicationdate', 'article:published_time') || ld?.datePublished || '');
  const doi = doiOf(one('citation_doi', 'dc.identifier', 'prism.doi', 'bepress_citation_doi')) || doiOf(url);
  const firstPage = one('citation_firstpage', 'prism.startingpage');
  const lastPage = one('citation_lastpage', 'prism.endingpage');
  return {
    type: scholarly || doi ? (one('citation_book_title') ? 'chapter' : one('citation_conference_title') ? 'paper-conference' : one('citation_dissertation_institution') ? 'thesis' : 'article-journal') : (ld && /Book/i.test([].concat(ld['@type']).join(' ')) ? 'book' : 'webpage'),
    title,
    authors: authorNames.slice(0, 50).map(personOf).filter(Boolean),
    container: container || (scholarly ? '' : one('og:site_name') || clean(ld?.publisher?.name)),
    publisher: one('citation_publisher', 'dc.publisher', 'dcterms.publisher') || clean(ld?.publisher?.name) || '',
    published,
    volume: one('citation_volume', 'prism.volume') || clean(ld?.volumeNumber || ld?.isPartOf?.volumeNumber),
    issue: one('citation_issue', 'prism.number') || clean(ld?.issueNumber || ld?.isPartOf?.issueNumber),
    pages: firstPage ? (lastPage && lastPage !== firstPage ? firstPage + '–' + lastPage : firstPage) : clean(ld?.pagination),
    issn: one('citation_issn', 'prism.issn'),
    isbn: one('citation_isbn'),
    doi,
    url
  };
}

const TYPES = { 'journal-article': 'article-journal', 'proceedings-article': 'paper-conference', 'book-chapter': 'chapter', book: 'book', monograph: 'book', 'edited-book': 'book', dissertation: 'thesis', report: 'report', 'posted-content': 'article', dataset: 'dataset' };

// Crossref's record for one DOI -> citation details.
export function metaFromCrossref(w, doi) {
  const date = (w.issued || w.published || w['published-print'] || w['published-online'] || {})['date-parts']?.[0] || [];
  return {
    type: TYPES[w.type] || 'article',
    title: clean([].concat(w.title || [])[0]),
    authors: [].concat(w.author || []).slice(0, 50).map((a) => (a.family ? { given: clean(a.given, 120), family: clean(a.family, 120) } : a.name ? { literal: clean(a.name, 160) } : null)).filter(Boolean),
    container: clean([].concat(w['container-title'] || [])[0]),
    publisher: clean(w.publisher),
    published: date[0] ? { year: date[0], ...(date[1] ? { month: date[1] } : {}), ...(date[1] && date[2] ? { day: date[2] } : {}) } : null,
    volume: clean(w.volume, 40),
    issue: clean(w.issue, 40),
    pages: clean(w.page, 40).replace('-', '–'),
    issn: clean([].concat(w.ISSN || [])[0], 20),
    isbn: clean([].concat(w.ISBN || [])[0], 20),
    doi,
    url: 'https://doi.org/' + doi
  };
}

export function createCite({ limiter, readLinkImpl = readLink, fetchImpl = fetch, now = () => new Date(), timeoutMs = 8000, contact = 'https://nasrinai.com' }) {
  async function crossref(doi) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(CROSSREF + encodeURIComponent(doi), { headers: { 'User-Agent': `NasrinAI/1.0 (${contact})`, Accept: 'application/json' }, signal: ctrl.signal });
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.message ? metaFromCrossref(data.message, doi) : null;
    } catch { return null; } finally { clearTimeout(timer); }
  }

  // body: { url } or { doi }. Answers { citation }.
  async function lookup(caller, body) {
    const url = typeof body?.url === 'string' ? body.url.trim().slice(0, 2000) : '';
    const askedDoi = typeof body?.doi === 'string' ? doiOf(body.doi) : null;
    if (!url && !askedDoi) throw new HttpError(400, 'invalid_request', 'Send a web address (url) or a DOI.');
    if (!(await limiter.web(caller))) throw new HttpError(429, 'web_limit', 'Too many lookups this hour. Please try again later.');
    let fromPage = null;
    let doi = askedDoi || doiOf(url);
    if (url && !askedDoi) {
      const page = await readLinkImpl(url, { withHtml: true, maxChars: 2000 });
      if (page.error && !doi) throw new HttpError(422, 'source_unavailable', 'The source could not be opened: ' + page.error + '.');
      if (!page.error) {
        fromPage = page.html ? metaFromHtml(page.html, page.url) : { type: 'webpage', title: clean(page.title), authors: [], container: '', publisher: '', published: null, url: page.url };
        doi = fromPage.doi || doi;
      }
    }
    const fromCrossref = doi ? await crossref(doi) : null;
    const citation = fromCrossref
      ? { ...fromCrossref, ...(fromPage && !fromCrossref.title ? { title: fromPage.title } : {}), url: fromCrossref.url, from: 'crossref' }
      : fromPage ? { ...fromPage, from: 'page' } : null;
    if (!citation || !citation.title) throw new HttpError(422, 'no_citation', 'No publication details could be found for this source.');
    return { citation: { ...citation, accessed: now().toISOString().slice(0, 10) } };
  }

  return { lookup };
}
