import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, script, styles] = await Promise.all([
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/app.css', import.meta.url), 'utf8')
]);

test('Research workspace is reachable from mobile and desktop navigation', () => {
  assert.match(html, /id="drawerResearch"/);
  assert.match(html, /id="desktopResearchBtn"/);
  assert.match(html, /id="researchOverlay"[^>]*role="dialog"/);
});

test('Research workspace exposes its existing query, URL, report, history and export controls', () => {
  for (const id of ['researchForm', 'researchQuery', 'researchUrls', 'researchResult', 'researchFindings', 'researchSources', 'researchHistory', 'researchSave']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  for (const format of ['markdown', 'html', 'json']) assert.ok(html.includes('data-research-export="' + format + '"'));
  assert.match(script, /api\('\/v1\/research'/);
  assert.match(script, /api\('\/v1\/research\/' \+ encodeURIComponent\(scan\.id\)/);
});

test('Research citations are rendered as safe external links and findings use text nodes', () => {
  assert.match(script, /a\.rel = 'noopener noreferrer'/);
  assert.match(script, /a\.referrerPolicy = 'no-referrer'/);
  assert.match(script, /researchNode\('p', 'research-finding-text', item\.finding\)/);
  assert.match(script, /\['http:', 'https:'\]\.includes\(url\.protocol\)/);
});

test('Saving to Library is a separate signed-in, explicit confirmation action', () => {
  assert.match(script, /if \(!account\).*Sign in before saving research to your Library/s);
  assert.match(script, /window\.confirm\('Save this research report to your Library\?/);
  assert.match(script, /JSON\.stringify\(\{ confirmed: true \}\)/);
  assert.match(script, /button\.disabled = !account/);
});

test('Research workspace has responsive mobile and visible keyboard focus styles', () => {
  assert.match(styles, /@media\(max-width:38rem\)/);
  assert.match(styles, /research-overlay button:focus-visible/);
  assert.match(styles, /\.research-overlay\[hidden\]\{display:none\}/);
});

test('professional job discovery is wired to the public-web endpoint and renders detailed scrollable cards', () => {
  for (const id of ['professionalSearchForm', 'professionalSearchQuery', 'professionalSearchLocation', 'professionalSearchDate', 'professionalSearchResult', 'professionalSearchCards', 'professionalSearchMore', 'professionalSearchStatus']) assert.match(html, new RegExp('id="' + id + '"'));
  assert.ok(script.includes("api('/v1/professional-search'"));
  assert.match(script, /category: 'jobs_hiring', source: 'public_web'/);
  assert.match(script, /View original listing/);
  assert.match(script, /Not disclosed/);
  assert.match(script, /professionalSearchMore/);
  assert.match(styles, /\.professional-search-cards[^}]*overflow-y:auto/);
  assert.match(styles, /\.professional-job-card/);
  assert.match(script, /noopener noreferrer/);
});

test('chat job-search requests use the professional search workflow instead of generic advice', () => {
  assert.match(script, /const isJobSearchRequest =/);
  assert.ok(script.includes('const topic =') && script.includes('job openings?') && script.includes('career opportunities'));
  assert.match(script, /if \(!imageMode && !editing && !pending\.length && isJobSearchRequest\(text\)\) return runChatJobSearch\(text\)/);
  assert.match(script, /api\('\/v1\/professional-search'/);
  assert.match(script, /Do not respond with instructions telling the user to search manually/);
  assert.match(script, /No results were fabricated/);
  assert.match(script, /Not disclosed/);
});
