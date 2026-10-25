import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class FakeNode {
  constructor(tag, text = '') {
    this.tagName = tag;
    this.textContent = text;
    this.children = [];
    this.attributes = {};
    this.className = '';
    this.classList = { add: (...names) => { this.className = [this.className, ...names].filter(Boolean).join(' '); } };
  }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  get innerHTML() { return ''; }
  set innerHTML(_) { throw new Error('unsafe innerHTML must never be used'); }
  get text() { return this.textContent + this.children.map((child) => child.text || child.textContent || '').join(''); }
}
function loadFormatter() {
  const window = {};
  const document = {
    createElement: (tag) => new FakeNode(tag),
    createElementNS: (_ns, tag) => new FakeNode(tag),
    createDocumentFragment: () => new FakeNode('#fragment'),
    createTextNode: (text) => new FakeNode('#text', String(text))
  };
  vm.runInNewContext(awaitableSource, { window, document, location: { origin: 'https://nasrinai.com' }, URL });
  return window.NasrinFormat;
}
const awaitableSource = await readFile(new URL('../public/format.js', import.meta.url), 'utf8');

function flatten(node, out = []) {
  out.push(node);
  for (const child of node.children || []) flatten(child, out);
  return out;
}

test('rich reply renderer supports inline emphasis, strike-through and section dividers safely', () => {
  const format = loadFormatter();
  const result = format.render('A **bold** and *italic* and ***strong italic*** and ~~removed~~ word.\n\n---\n\nUse `npm test`.');
  const nodes = flatten(result.node);
  assert.ok(nodes.some((n) => n.tagName === 'strong' && n.text.includes('bold')));
  assert.ok(nodes.some((n) => n.tagName === 'em' && n.text.includes('italic')));
  assert.ok(nodes.some((n) => n.tagName === 'del' && n.text.includes('removed')));
  assert.ok(nodes.some((n) => n.tagName === 'hr'));
  assert.ok(nodes.some((n) => n.tagName === 'code' && n.text === 'npm test'));
});

test('rich reply renderer presents task lists as accessible, read-only checkboxes', () => {
  const format = loadFormatter();
  const nodes = flatten(format.render('- [x] Verified\n- [ ] Still pending').node);
  const boxes = nodes.filter((n) => n.tagName === 'input');
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0].type, 'checkbox');
  assert.equal(boxes[0].checked, true);
  assert.equal(boxes[0].disabled, true);
  assert.equal(boxes[1].checked, false);
  assert.equal(boxes[1].disabled, true);
});

test('rich reply renderer never parses model output as HTML', () => {
  const format = loadFormatter();
  const result = format.render('<img src=x onerror=alert(1)>');
  const nodes = flatten(result.node);
  assert.equal(nodes.some((n) => n.tagName === 'img'), false);
  assert.ok(nodes.some((n) => n.tagName === '#text' && n.text.includes('<img')));
});
