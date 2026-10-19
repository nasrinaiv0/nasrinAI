import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildSystemPrompt } from '../src/ai/prompt.js';

// A tiny stand-in for the page's DOM: enough for public/format.js, which only
// builds nodes with createElement / textContent (never innerHTML).
function fakeDom() {
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.dataset = {}; this.attrs = {}; this._text = ''; }
    get classList() { return { add: (c) => { this.className = (this.className + ' ' + c).trim(); } }; }
    removeAttribute(k) { delete this.attrs[k]; }
    appendChild(c) { if (c.isFragment) { this.children.push(...c.children); } else this.children.push(c); return c; }
    append(...cs) { for (const c of cs) this.appendChild(c); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    get textContent() { return this.tagName === '#text' ? this._text : this._text + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._text = String(v); this.children = []; }
    set innerHTML(v) { throw new Error('innerHTML must never be used'); }
    get lastElementChild() { return this.children.at(-1) || null; }
    querySelector() { return null; }
    all(tag) { const out = []; const walk = (n) => { for (const c of n.children) { if (c.tagName === tag) out.push(c); walk(c); } }; walk(this); return out; }
  }
  const document = {
    createElement: (t) => new Node(t.toUpperCase()),
    createElementNS: (ns, t) => new Node(t.toUpperCase()),
    createTextNode: (t) => { const n = new Node('#text'); n._text = String(t); return n; },
    createDocumentFragment: () => { const n = new Node('#fragment'); n.isFragment = true; return n; }
  };
  return { document, location: { origin: 'https://nasrinai.com' }, URL };
}

async function format() {
  const src = await readFile(new URL('../public/format.js', import.meta.url), 'utf8');
  const sandbox = fakeDom(); sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox);
  return sandbox.window.NasrinFormat;
}

test('Markdown tables render as a real table, built safely, inside a scroll box', async () => {
  const { render, plain } = await format();
  const { node } = render('Here is a comparison.\n\n| Plan | Price | **Best for** |\n|---|:---:|---|\n| Free | ₱0 | Trying it |\n| Max | `₱199` | Daily work |\n\nPick Max.');
  const wrap = node.children.find((c) => c.className === 'table-wrap');
  assert.ok(wrap, 'table wrapper');
  assert.equal(wrap.attrs.role, 'region');
  assert.equal(wrap.attrs.tabindex, '0', 'scrollable on keyboard');
  const [table] = node.all('TABLE');
  assert.deepEqual(table.all('TH').map((c) => c.textContent), ['Plan', 'Price', 'Best for']);
  assert.deepEqual(table.all('TD').map((c) => c.textContent), ['Free', '₱0', 'Trying it', 'Max', '₱199', 'Daily work']);
  assert.equal(table.all('CODE')[0].textContent, '₱199', 'inline formatting in cells');
  assert.equal(node.children.at(-1).textContent, 'Pick Max.');
  assert.equal(plain('| A | B |\n|---|---|\n| 1 | 2 |'), 'A · B\n1 · 2');
});

test('a pipe line without a separator row stays text; huge tables are capped', async () => {
  const { render } = await format();
  assert.equal(render('a | b | c').node.all('TABLE').length, 0);
  const rows = Array.from({ length: 80 }, (_, i) => `| ${i} | x |`).join('\n');
  const t = render(`| n | v |\n|---|---|\n${rows}`).node.all('TABLE')[0];
  assert.equal(t.all('TR').length, 51, 'header + 50 rows');
  const wide = render('| ' + Array.from({ length: 12 }, (_, i) => 'c' + i).join(' | ') + ' |\n|' + '---|'.repeat(12)).node.all('TH');
  assert.equal(wide.length, 8, 'at most 8 columns');
});

test('code still gets a Copy box with the exact code', async () => {
  const { render } = await format();
  const { node } = render('Run:\n\n```bash\nnpm test\n```');
  const block = node.children.find((c) => c.className === 'code-block');
  const copy = block.all('BUTTON')[0];
  assert.equal(copy.className, 'code-copy');
  assert.equal(copy.dataset.copy, 'npm test');
});

test('reply rules: tables only for comparisons, code always in a fenced block, depth follows the person', () => {
  const p = buildSystemPrompt({});
  assert.doesNotMatch(p, /No tables/);
  assert.match(p, /Markdown table only to compare/);
  assert.match(p, /code, command, configuration or data the person may copy goes in a ``` block with its language/);
  assert.match(p, /explain simply/);
  assert.match(p, /never HTML/);
});

// 2026-10-12: coding replies end with a simple status summary; status emoji
// become outline icons (done, failed, warning, secured, note, action).
test('[[checks]] renders a status list with icons and badges, and reads plainly', async () => {
  const { render, plain } = await format();
  const text = 'Fixed.\n\n[[checks title="Summary"]]\nok | Tests (`npm test`) | Passed\nfail | Vercel preview | Failed\nsecure | Anonymous access | Blocked\ntodo | Turn on leaked-password protection\n[[/checks]]';
  const { node } = render(text);
  const card = node.children.find((c) => c.className === 'checks');
  assert.ok(card, 'a checks card');
  assert.equal(card.children[0].textContent, 'Summary');
  const rows = card.all('LI');
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.className), ['check st-row-ok', 'check st-row-fail', 'check st-row-secure', 'check st-row-key']);
  assert.equal(rows[0].children[0].attrs.class, 'st-ico st-ok');
  assert.equal(rows[0].children[0].attrs['aria-label'], 'Done');
  assert.equal(rows[1].children.at(-1).textContent, 'Failed');
  assert.equal(rows[1].children.at(-1).className, 'check-badge st-badge-fail');
  assert.equal(rows[3].children.length, 2, 'no badge when none is given');
  assert.ok(rows[0].all('CODE').length === 1, 'inline code inside a row');
  const said = plain(text);
  assert.match(said, /Summary\n• Tests \(npm test\) — Passed\n• Vercel preview — Failed/);
  assert.doesNotMatch(said, /\[\[|ok \||\| Passed/);
});

test('a status emoji at the start of a heading, item or paragraph becomes an icon', async () => {
  const { render } = await format();
  const { node } = render('## ✅ Login fixed\n\n- ⚠️ Leaked-password protection is off\n\n❌ Build failed');
  const [h, ul, p] = node.children;
  assert.equal(h.children[0].attrs.class, 'st-ico st-ok');
  assert.equal(h.textContent, 'Login fixed');
  assert.equal(ul.children[0].children[0].attrs.class, 'st-ico st-warn');
  assert.equal(p.children[0].attrs.class, 'st-ico st-fail');
  assert.match(h.className, /st-line/);
});

test('every assistant reply wires Sources & Resources even when no links were found', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(js, /sourcesToggle\(actions, cited\.links\);/);
  assert.doesNotMatch(js, /if \(cited\.links\.length\) sourcesToggle/);
  assert.match(js, /No external sources were consulted for this reply\./);
});

test('web sources are taken out of the reply text and listed separately (only http links)', async () => {
  const F = await format();
  const reply = 'It is sunny in Cebu.\n\n**Sources**\n- [Cebu weather](<https://weather.example.com/cebu>)\n- [PAGASA](<https://www.pagasa.dost.gov.ph/x?y=1>)';
  const { text, links } = F.sources(reply);
  assert.equal(text, 'It is sunny in Cebu.');
  assert.deepEqual(JSON.parse(JSON.stringify(links.map((l) => [l.title, l.url, l.host]))), [
    ['Cebu weather', 'https://weather.example.com/cebu', 'weather.example.com'],
    ['PAGASA', 'https://www.pagasa.dost.gov.ph/x?y=1', 'pagasa.dost.gov.ph']
  ]);
  // A reply without the block, or with a non-web link, is left exactly as written.
  assert.deepEqual(JSON.parse(JSON.stringify(F.sources('No sources here.'))), { text: 'No sources here.', links: [] });
  const bad = 'Hi.\n\n**Sources**\n- [x](<javascript:alert(1)>)';
  assert.deepEqual(JSON.parse(JSON.stringify(F.sources(bad))), { text: bad, links: [] });
  // A Markdown link outside a terminal Sources block is still collected as a resource.
  const mid = '**Sources**\n- [a](https://a.example)\n\nMore text after.';
  assert.equal(F.sources(mid).links.length, 1);
  assert.equal(F.sources(mid).links[0].title, 'a');
});

test('external links are collected into Sources & Resources instead of shown inline', async () => {
  const F = await format();
  const reply = 'Watch [How to do a PERFECT Push Up](https://www.youtube.com/watch?v=IODxDxX7oi4) or visit https://example.com/guide for details.';
  const result = F.sources(reply);
  assert.equal(result.text, 'Watch How to do a PERFECT Push Up or visit for details.');
  assert.deepEqual(JSON.parse(JSON.stringify(result.links.map((l) => [l.title, l.url, l.host]))), [
    ['How to do a PERFECT Push Up', 'https://www.youtube.com/watch?v=IODxDxX7oi4', 'youtube.com'],
    ['example.com', 'https://example.com/guide', 'example.com']
  ]);
  const rendered = F.render(result.text).node;
  assert.equal(rendered.all('A').length, 0, 'external destinations are not left inline');
});

test('same-site links stay inline, code URLs are not misclassified, and duplicate sources are removed', async () => {
  const F = await format();
  const reply = 'See [FAQ](https://nasrinai.com/?faq=1).\n\n\x60\x60\x60js\nconst docs = "https://example.com/docs";\n\x60\x60\x60\n\nSource: [Docs](https://example.com/docs)';
  const result = F.sources(reply);
  assert.match(result.text, /\[FAQ\]\(https:\/\/nasrinai\.com\/\?faq=1\)/);
  assert.match(result.text, /https:\/\/example\.com\/docs/);
  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].url, 'https://example.com/docs');
});

test('unsafe source URLs are not treated as trusted citations', async () => {
  const F = await format();
  const reply = 'Answer.\n\n**Sources**\n- [unsafe](<javascript:alert(1)>)';
  const result = F.sources(reply);
  assert.equal(result.links.length, 0);
  assert.match(result.text, /javascript:alert/);
});
