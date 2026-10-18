import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function paste() {
  const src = await readFile(new URL('../public/paste.js', import.meta.url), 'utf8');
  const window = {};
  vm.runInNewContext(src, { window });
  return window.NasrinPaste;
}

test('exactly 2,000 characters stays text; 2,001 becomes a file', async () => {
  const P = await paste();
  assert.equal(P.LIMIT, 2000);
  assert.equal(P.shouldAttach('a'.repeat(2000)), false);
  assert.equal(P.shouldAttach('a'.repeat(2001)), true);
  assert.equal(P.shouldAttach(''), false);
  assert.equal(P.shouldAttach(null), false);
});

test('characters are counted as Unicode code points (emoji and non-Latin text)', async () => {
  const P = await paste();
  assert.equal(P.count('😀'), 1, 'an emoji is one character, not two UTF-16 units');
  assert.equal(P.count('مرحبا'), 5);
  assert.equal(P.count('日本語'), 3);
  assert.equal(P.shouldAttach('😀'.repeat(2000)), false);
  assert.equal(P.shouldAttach('😀'.repeat(2001)), true);
});

test('line breaks count as characters and multiline text is judged as a whole', async () => {
  const P = await paste();
  assert.equal(P.shouldAttach('x\n'.repeat(1000)), false);
  assert.equal(P.shouldAttach('x\n'.repeat(1001)), true);
});

test('file names are predictable and never reuse one already attached', async () => {
  const P = await paste();
  assert.equal(P.fileName([]), 'pasted-text.txt');
  assert.equal(P.fileName(['photo.jpg']), 'pasted-text.txt');
  assert.equal(P.fileName(['pasted-text.txt']), 'pasted-text-2.txt');
  assert.equal(P.fileName(['Pasted-Text.txt', 'pasted-text-2.txt']), 'pasted-text-3.txt');
});
