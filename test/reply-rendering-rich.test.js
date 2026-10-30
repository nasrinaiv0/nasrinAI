import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Minimal DOM stand-in (createElement / createElementNS / textContent only).
function fakeDom() {
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.dataset = {}; this.attrs = {}; this._text = ''; }
    get classList() { return { add: (c) => { this.className = (this.className + ' ' + c).trim(); } }; }
    removeAttribute(k) { delete this.attrs[k]; }
    appendChild(c) { if (c.isFragment) this.children.push(...c.children); else this.children.push(c); return c; }
    append(...cs) { for (const c of cs) this.appendChild(c); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k]; }
    get textContent() { return this.tagName === '#text' ? this._text : this._text + this.children.map((c) => c.textContent).join(''); }
    set textContent(v) { this._text = String(v); this.children = []; }
    set innerHTML(v) { throw new Error('innerHTML must never be used'); }
    get lastElementChild() { return this.children.filter((c) => c.tagName !== '#text').at(-1) || null; }
    querySelector() { return null; }
    all(tag) { const out = []; const walk = (n) => { for (const c of n.children) { if (c.tagName === tag) out.push(c); walk(c); } }; walk(this); return out; }
    byClass(cls) { const out = []; const walk = (n) => { for (const c of n.children) { if (` ${c.className} `.includes(` ${cls} `)) out.push(c); walk(c); } }; walk(this); return out; }
  }
  const document = {
    createElement: (t) => new Node(t.toUpperCase()),
    createElementNS: (ns, t) => { const n = new Node(t.toUpperCase()); n.ns = ns; return n; },
    createTextNode: (t) => { const n = new Node('#text'); n._text = String(t); return n; },
    createDocumentFragment: () => { const n = new Node('#fragment'); n.isFragment = true; return n; }
  };
  return { document, location: { origin: 'https://nasrinai.com' }, URL };
}
async function format() {
  const src = await readFile(new URL('../public/format.js', import.meta.url), 'utf8');
  const sandbox = fakeDom(); sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox);
  const f = sandbox.window.NasrinFormat;
  return { ...f, render: (t) => { const r = f.render(t); const root = sandbox.document.createElement('div'); root.appendChild(r.node); return root; } };
}

test('code blocks are highlighted with token spans and keep the exact source text', async () => {
  const { render } = await format();
  const code = 'const total = sum(1, 2); // add\nreturn "ok";';
  const root = render('```js\n' + code + '\n```');
  const el = root.all('CODE')[0];
  assert.equal(el.textContent, code);
  assert.ok(root.byClass('tok-k').some((n) => n.textContent === 'const'));
  assert.ok(root.byClass('tok-f').some((n) => n.textContent === 'sum'));
  assert.ok(root.byClass('tok-n').some((n) => n.textContent === '1'));
  assert.ok(root.byClass('tok-c').some((n) => n.textContent === '// add'));
  assert.ok(root.byClass('tok-s').some((n) => n.textContent === '"ok"'));
});

test('python, sql and unknown languages', async () => {
  const { render } = await format();
  const py = render('```python\ndef f(x):\n    # note\n    return """doc"""\n```');
  assert.ok(py.byClass('tok-k').some((n) => n.textContent === 'def'));
  assert.ok(py.byClass('tok-c').some((n) => n.textContent === '# note'));
  const sql = render('```sql\nSELECT id FROM users -- all\n```');
  assert.ok(sql.byClass('tok-k').some((n) => n.textContent === 'SELECT'));
  const plain = render('```brainfuck\n+++.\n```');
  assert.equal(plain.byClass('tok-k').length + plain.byClass('tok-s').length, 0);
  assert.equal(plain.all('CODE')[0].textContent, '+++.');
});

test('unclosed strings and comments do not hang or drop text', async () => {
  const { render } = await format();
  const src = '/*'.repeat(4000) + ' "x'.repeat(2000);
  const t0 = Date.now();
  const root = render('```js\n' + src + '\n```');
  assert.ok(Date.now() - t0 < 1500);
  assert.equal(root.all('CODE')[0].textContent, src);
});

test('diff blocks color added and removed lines', async () => {
  const { render } = await format();
  const root = render('```diff\n@@ -1 +1 @@\n-old\n+new\n same\n```');
  assert.equal(root.byClass('tok-add')[0].textContent, '+new');
  assert.equal(root.byClass('tok-del')[0].textContent, '-old');
  assert.equal(root.byClass('tok-meta')[0].textContent, '@@ -1 +1 @@');
  assert.equal(root.all('CODE')[0].textContent, '@@ -1 +1 @@\n-old\n+new\n same\n');
});

test('long code is folded behind a Show all button', async () => {
  const { render } = await format();
  const lines = Array.from({ length: 40 }, (_, i) => 'line' + i).join('\n');
  const root = render('```\n' + lines + '\n```');
  assert.match(root.byClass('code-block')[0].className, /is-long/);
  assert.equal(root.byClass('code-expand')[0].textContent, 'Show all 40 lines');
  const short = render('```\na\nb\n```');
  assert.equal(short.byClass('code-expand').length, 0);
});

test('display and inline math become MathML; prices stay text', async () => {
  const { render } = await format();
  const block = render('$$\n\\frac{a^2}{\\sqrt{b}} = \\alpha\n$$');
  const m = block.all('MATH')[0];
  assert.equal(m.attrs.display, 'block');
  assert.equal(m.ns, 'http://www.w3.org/1998/Math/MathML');
  assert.equal(block.all('MFRAC').length, 1);
  assert.equal(block.all('MSQRT').length, 1);
  assert.ok(block.all('MI').some((n) => n.textContent === 'α'));
  const one = render('$$E = mc^2$$');
  assert.equal(one.all('MSUP').length, 1);
  const inl = render('Area is $\\pi r^2$ and \\(x_1\\).');
  assert.equal(inl.all('MATH').length, 2);
  assert.equal(inl.all('MATH')[0].attrs.display, 'inline');
  const money = render('It costs $5 and $10, or $5-$6 on sale.');
  assert.equal(money.all('MATH').length, 0);
  assert.equal(money.textContent, 'It costs $5 and $10, or $5-$6 on sale.');
});

test('unsupported math falls back to its source text', async () => {
  const { render } = await format();
  const root = render('$$\\begin{matrix} a \\end{matrix}$$');
  assert.equal(root.all('MATH').length, 0);
  assert.equal(root.byClass('math-fallback')[0].textContent, '\\begin{matrix} a \\end{matrix}');
  const deep = render('$' + '{'.repeat(300) + 'x' + '}'.repeat(300) + '$');
  assert.ok(deep.textContent.includes('x'));
});

test('callouts and multi-line quotes', async () => {
  const { render } = await format();
  const root = render('> [!WARNING]\n> Back up first.\n> It cannot be undone.');
  const box = root.byClass('callout')[0];
  assert.match(box.className, /callout-warning/);
  assert.equal(root.byClass('callout-title')[0].textContent, 'Warning');
  assert.match(box.textContent, /Back up first\. It cannot be undone\./);
  const q = render('> one\n>\n> two');
  assert.equal(q.all('BLOCKQUOTE').length, 1);
  assert.equal(q.all('BLOCKQUOTE')[0].all('P').length, 2);
});

test('indented items nest under the item above', async () => {
  const { render } = await format();
  const root = render('- Fruit\n  - Apple\n  - Pear\n- Veg\n1. Step\n   1. Sub');
  const ul = root.all('UL')[0];
  assert.equal(ul.children.length, 2);
  assert.equal(root.byClass('sub-list').length, 2);
  assert.equal(root.byClass('sub-list')[0].children.length, 2);
});

test('h5 and h6 headings render; plain() strips the new syntax', async () => {
  const { render, plain } = await format();
  assert.equal(render('##### Small').all('H4').length, 1);
  assert.equal(plain('> [!TIP] Use it\n$$\nx^2\n$$\nand \\(y\\)'), 'Tip: Use it\n\nx^2\n\nand y');
});
