import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, readLink } from '../src/web/read-link.js';

// Pages that used to make the cleaner scan to the end again and again (the
// closing tag never comes). Each must now be handled in well under a second;
// before the fix a 360 KB version blocked the server for several seconds.
const MB = 1_400_000;
const hostile = {
  'unclosed form tags': '<form>'.repeat(Math.floor(MB / 6)),
  'unclosed script tags': '<script>x'.repeat(Math.floor(MB / 9)),
  'unclosed nav, aside and header': '<nav><aside><header>'.repeat(Math.floor(MB / 20)),
  'unterminated comments': '<!--'.repeat(Math.floor(MB / 4)),
  'meta tags that never close': '<meta name="a" '.repeat(Math.floor(MB / 15)),
  'link tags that never close': '<link rel="canonical" '.repeat(Math.floor(MB / 22)),
  'article starts with no end': '<article>'.repeat(Math.floor(MB / 9)),
  'angle brackets without end': '<'.repeat(MB),
  'title with no end': '<title>'.repeat(Math.floor(MB / 7))
};
for (const [name, html] of Object.entries(hostile)) {
  test('htmlToText stays fast on ' + name, () => {
    const started = Date.now();
    htmlToText('<html><body>' + html);
    assert.ok(Date.now() - started < 1500, name + ' took ' + (Date.now() - started) + ' ms');
  });
}

test('htmlToText still removes scripts, styles, navigation and tags, and keeps the words and structure', () => {
  const out = htmlToText('<html><head><title>My page</title><meta name="description" content="About tea"><meta property="og:site_name" content="Tea Co"><link rel="canonical" href="https://example.com/tea"></head><body><nav>Menu</nav><script>alert(1)</script><style>p{}</style><main><h1>Tea</h1><p>Green &amp; black tea.</p><ul><li>One</li><li>Two</li></ul></main><footer>Contact</footer></body></html>');
  assert.equal(out.title, 'My page');
  assert.equal(out.description, 'About tea');
  assert.equal(out.siteName, 'Tea Co');
  assert.equal(out.canonical, 'https://example.com/tea');
  assert.match(out.text, /Tea\nGreen & black tea\./);
  assert.match(out.text, /- One\n- Two/);
  assert.doesNotMatch(out.text, /Menu|alert|p\{\}|Contact/);
});

test('htmlToText keeps text around a stray less-than sign and ignores an unclosed script safely', () => {
  assert.match(htmlToText('<p>3 < 5 and 7 > 2</p>').text, /3 < 5 and 7 > 2/);
  const out = htmlToText('<p>Before</p><script>never closed <p>After</p>');
  assert.match(out.text, /Before/);
});

test('htmlToText prefers the article, then main, and is case-insensitive', () => {
  assert.equal(htmlToText('<BODY>noise<ARTICLE>The story</ARTICLE>more noise</BODY>').text, 'The story');
});

// --- character sets ---
function pageWith(type, bytes) {
  return async () => ({
    statusCode: 200, headers: { 'content-type': type },
    async *[Symbol.asyncIterator]() { yield bytes; },
    resume() {}, destroy() {}
  });
}

test('pages in other character sets are decoded with the declared charset', async () => {
  // "café" in windows-1252 and in Shift_JIS ("日本語")
  const latin = Buffer.from([0x3c, 0x70, 0x3e, 0x63, 0x61, 0x66, 0xe9, 0x3c, 0x2f, 0x70, 0x3e]);
  const a = await readLink('https://example.com/a', { getImpl: pageWith('text/html; charset=windows-1252', latin) });
  assert.match(a.text, /café/);
  const sjis = Buffer.concat([Buffer.from('<p>'), Buffer.from([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]), Buffer.from('</p>')]);
  const b = await readLink('https://example.com/b', { getImpl: pageWith('text/html; charset=Shift_JIS', sjis) });
  assert.match(b.text, /日本語/);
});

test('a charset declared only inside the page is honoured, and unknown ones fall back to UTF-8', async () => {
  const html = Buffer.concat([Buffer.from('<html><head><meta charset="iso-8859-1"></head><body><p>caf'), Buffer.from([0xe9]), Buffer.from('</p></body></html>')]);
  assert.match((await readLink('https://example.com/c', { getImpl: pageWith('text/html', html) })).text, /café/);
  const odd = await readLink('https://example.com/d', { getImpl: pageWith('text/html; charset=not-a-charset', Buffer.from('<p>plain ascii</p>')) });
  assert.match(odd.text, /plain ascii/);
});

import { metaFromHtml } from '../src/web/cite.js';

test('citation details from a page full of unclosed JSON-LD scripts stay fast', () => {
  const html = '<html><head><title>T</title>' + '<script type="application/ld+json">{'.repeat(10_000) + '<meta name="a" '.repeat(20_000);
  const started = Date.now();
  metaFromHtml(html, 'https://example.com/');
  assert.ok(Date.now() - started < 1500, 'took ' + (Date.now() - started) + ' ms');
});
