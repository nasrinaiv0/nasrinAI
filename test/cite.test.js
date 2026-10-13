import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { doiOf, personOf, metaFromHtml, metaFromCrossref } from '../src/web/cite.js';
import { buildTestApp, serve, bearer, postJson } from './helpers.js';

const ARTICLE_PAGE = `<html><head><title>Ignore me | Journal site</title>
<meta name="citation_title" content="Mangrove loss and coastal flooding in the Visayas">
<meta name="citation_author" content="Cruz, Ana Beatriz">
<meta name="citation_author" content="Reyes, Jose">
<meta name="citation_journal_title" content="Philippine Journal of Science">
<meta name="citation_publication_date" content="2024/03/05">
<meta name="citation_volume" content="153"><meta name="citation_issue" content="2">
<meta name="citation_firstpage" content="101"><meta name="citation_lastpage" content="118">
<meta name="citation_doi" content="10.1234/pjs.2024.0153">
<meta name="citation_publisher" content="DOST">
</head><body>…</body></html>`;

const WEB_PAGE = `<html><head><title>Weather today</title>
<meta property="og:title" content="Cebu weather this week">
<meta property="og:site_name" content="PAGASA">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","headline":"Cebu weather this week","author":{"@type":"Person","name":"Maria Santos"},"datePublished":"2026-10-12T08:00:00+08:00","publisher":{"@type":"Organization","name":"PAGASA"}}</script>
</head></html>`;

test('a page’s own publication tags give the details; nothing is made up', () => {
  const a = metaFromHtml(ARTICLE_PAGE, 'https://example.org/a');
  assert.equal(a.type, 'article-journal');
  assert.equal(a.title, 'Mangrove loss and coastal flooding in the Visayas');
  assert.deepEqual(a.authors, [{ given: 'Ana Beatriz', family: 'Cruz' }, { given: 'Jose', family: 'Reyes' }]);
  assert.equal(a.container, 'Philippine Journal of Science');
  assert.deepEqual(a.published, { year: 2024, month: 3, day: 5 });
  assert.equal(a.pages, '101–118');
  assert.equal(a.doi, '10.1234/pjs.2024.0153');
  const w = metaFromHtml(WEB_PAGE, 'https://pagasa.example/cebu');
  assert.equal(w.type, 'webpage');
  assert.equal(w.title, 'Cebu weather this week');
  assert.deepEqual(w.authors, [{ given: 'Maria', family: 'Santos' }]);
  assert.equal(w.container, 'PAGASA');
  assert.equal(w.published.year, 2026);
  // A bare page: only what it states (no author, no date).
  const bare = metaFromHtml('<title>Just a page</title>', 'https://x.example');
  assert.deepEqual([bare.title, bare.authors, bare.published], ['Just a page', [], null]);
});

test('DOIs, names and Crossref records', () => {
  assert.equal(doiOf('https://doi.org/10.1038/S41586-020-2649-2.'), '10.1038/s41586-020-2649-2');
  assert.equal(doiOf('no doi here'), null);
  assert.deepEqual(personOf('Ana B. Cruz'), { given: 'Ana B.', family: 'Cruz' });
  assert.deepEqual(personOf('World Health Organization'), { literal: 'World Health Organization' });
  const c = metaFromCrossref({ type: 'journal-article', title: ['A study'], author: [{ given: 'Ana', family: 'Cruz' }, { name: 'The Consortium' }], 'container-title': ['Nature'], publisher: 'Springer', issued: { 'date-parts': [[2020, 9]] }, volume: '585', issue: '7825', page: '357-362', ISSN: ['0028-0836'] }, '10.1038/x');
  assert.deepEqual(c.authors, [{ given: 'Ana', family: 'Cruz' }, { literal: 'The Consortium' }]);
  assert.deepEqual(c.published, { year: 2020, month: 9 });
  assert.equal(c.pages, '357–362');
  assert.equal(c.url, 'https://doi.org/10.1038/x');
});

test('POST /v1/cite: the page, then Crossref for its DOI; a source with no details is refused', async () => {
  const opened = [];
  const crossrefAsked = [];
  const citeReadLink = async (url, opts) => {
    opened.push([url, opts.withHtml]);
    if (url.includes('article')) return { url, title: 'x', text: 'x', html: ARTICLE_PAGE };
    if (url.includes('empty')) return { url, title: '', text: 'x', html: '<p>no title</p>' };
    return { url, error: 'the site answered 404' };
  };
  const citeFetch = async (url, init) => {
    crossrefAsked.push([url, init.headers['User-Agent']]);
    return Response.json({ message: { type: 'journal-article', title: ['Mangrove loss and coastal flooding in the Visayas'], author: [{ given: 'Ana Beatriz', family: 'Cruz' }], 'container-title': ['Philippine Journal of Science'], issued: { 'date-parts': [[2024, 3, 5]] }, volume: '153', issue: '2', page: '101-118', publisher: 'DOST' } });
  };
  const built = buildTestApp({ citeReadLink, citeFetch });
  const srv = await serve(built.app);
  try {
    const g = (await (await fetch(srv.url + '/v1/guest/sessions', { method: 'POST' })).json()).token;
    const r = await postJson(srv.url + '/v1/cite', { url: 'https://journal.example/article/1' }, bearer(g));
    assert.equal(r.status, 200);
    const { citation } = await r.json();
    assert.equal(citation.from, 'crossref');
    assert.equal(citation.doi, '10.1234/pjs.2024.0153');
    assert.equal(citation.pages, '101–118');
    assert.match(citation.accessed, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(opened[0], ['https://journal.example/article/1', true]);
    assert.equal(crossrefAsked[0][0], 'https://api.crossref.org/works/10.1234%2Fpjs.2024.0153');
    assert.match(crossrefAsked[0][1], /NasrinAI/);
    // A DOI alone goes straight to Crossref.
    const d = await postJson(srv.url + '/v1/cite', { doi: 'doi:10.1234/PJS.2024.0153' }, bearer(g));
    assert.equal((await d.json()).citation.from, 'crossref');
    assert.equal(opened.length, 1);
    // Nothing to cite: refused, never invented.
    assert.equal((await postJson(srv.url + '/v1/cite', { url: 'https://site.example/empty' }, bearer(g))).status, 422);
    assert.equal((await postJson(srv.url + '/v1/cite', { url: 'https://site.example/missing' }, bearer(g))).status, 422);
    assert.equal((await postJson(srv.url + '/v1/cite', {}, bearer(g))).status, 400);
  } finally { await srv.close(); }
});

async function citeLib() {
  const src = await readFile(new URL('../public/cite.js', import.meta.url), 'utf8');
  const sandbox = {};
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox);
  return sandbox.window.NasrinCite;
}

const JOURNAL = { type: 'article-journal', title: 'Mangrove loss and coastal flooding in the Visayas', authors: [{ given: 'Ana Beatriz', family: 'Cruz' }, { given: 'Jose', family: 'Reyes' }], container: 'Philippine Journal of Science', published: { year: 2024, month: 3, day: 5 }, volume: '153', issue: '2', pages: '101–118', publisher: 'DOST', doi: '10.1234/pjs.2024.0153', url: 'https://doi.org/10.1234/pjs.2024.0153', accessed: '2026-10-13' };
const UNDATED = { type: 'webpage', title: 'How tides work', authors: [], container: 'Ocean Facts', published: null, url: 'https://ocean.example/tides', accessed: '2026-10-13' };

test('citation styles: APA, MLA, Chicago, Harvard, IEEE, Vancouver, BibTeX', async () => {
  const C = await citeLib();
  const say = (c, s) => C.plain(C.format(c, s));
  assert.equal(say(JOURNAL, 'apa'), 'Cruz, A. B., & Reyes, J. (2024). Mangrove loss and coastal flooding in the Visayas. Philippine Journal of Science, 153(2), 101–118. https://doi.org/10.1234/pjs.2024.0153');
  assert.equal(say(JOURNAL, 'mla'), 'Cruz, Ana Beatriz, and Jose Reyes. “Mangrove loss and coastal flooding in the Visayas.” Philippine Journal of Science, vol. 153, no. 2, 2024, pp. 101–118, https://doi.org/10.1234/pjs.2024.0153.');
  assert.equal(say(JOURNAL, 'chicago'), 'Cruz, Ana Beatriz, and Jose Reyes. 2024. “Mangrove loss and coastal flooding in the Visayas.” Philippine Journal of Science 153 (2): 101–118. https://doi.org/10.1234/pjs.2024.0153.');
  assert.equal(say(JOURNAL, 'harvard'), 'Cruz, A.B. and Reyes, J. (2024) ‘Mangrove loss and coastal flooding in the Visayas’, Philippine Journal of Science, 153(2), pp. 101–118. doi: 10.1234/pjs.2024.0153.');
  assert.equal(say(JOURNAL, 'ieee'), 'A. B. Cruz and J. Reyes, “Mangrove loss and coastal flooding in the Visayas,” Philippine Journal of Science, vol. 153, no. 2, pp. 101–118, Mar. 2024, doi: 10.1234/pjs.2024.0153.');
  assert.equal(say(JOURNAL, 'vancouver'), 'Cruz AB, Reyes J. Mangrove loss and coastal flooding in the Visayas. Philippine Journal of Science. 2024;153(2):101-118. doi:10.1234/pjs.2024.0153');
  const bib = say(JOURNAL, 'bibtex');
  assert.match(bib, /^@article\{cruz2024mangrove,/);
  assert.match(bib, /author = \{Cruz, Ana Beatriz and Reyes, Jose\}/);
  assert.match(bib, /pages = \{101--118\}/);
  // Journal and volume are italic in APA; the page gets parts, never HTML.
  const apa = C.format(JOURNAL, 'apa');
  assert.deepEqual(JSON.parse(JSON.stringify(apa.filter((p) => p.i).map((p) => p.t))), ['Philippine Journal of Science', '153']);
  assert.equal(C.html([{ t: '<b>' }, { t: 'x', i: true }]), '&lt;b&gt;<i>x</i>');
  // No author and no date are never invented.
  assert.equal(say(UNDATED, 'apa'), 'How tides work. (n.d.). Ocean Facts. https://ocean.example/tides');
  assert.equal(say(UNDATED, 'mla'), '“How tides work.” Ocean Facts, ocean.example/tides. Accessed 13 Oct. 2026.');
  assert.equal(say(UNDATED, 'harvard'), '(no date) How tides work. Available at: https://ocean.example/tides (Accessed: 13 October 2026).');
  for (const s of C.STYLES) assert.doesNotMatch(say(UNDATED, s.id), /undefined|null|NaN/, s.id);
});

test('the page: Cite on each source, "cite <link or DOI>" in chat, styles remembered', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="\/cite\.js" defer><\/script>/);
  assert.match(js, /cite\.addEventListener\('click', \(\) => toggleCite\(li, cite, \{ url: l\.url \}\)\);/);
  assert.match(js, /const citeAsk = !editing && !shortcut && !pending\.length && citeTarget\(text\);\s*if \(citeAsk\) return citeMessage\(text, citeAsk\);/);
  const card = js.slice(js.indexOf('function citeCard('), js.indexOf('// ---------- the messy-file cleaner'));
  assert.match(card, /saved\.set\(KEYS\.citeStyle, style\)/);
  assert.match(card, /b\.setAttribute\('role', 'radio'\);/);
  assert.match(card, /a\.rel = 'noopener noreferrer';/);
  assert.doesNotMatch(card, /innerHTML/);
});
