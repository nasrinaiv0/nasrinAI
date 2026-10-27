import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Photos & files menu item opens the native attachment picker', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../public/attachment-picker.js', import.meta.url), 'utf8');

  assert.match(html, /<script src="\/attachment-picker\.js" defer><\/script>/);
  assert.match(script, /pickFiles\.addEventListener\('click',\s*\(\)\s*=>\s*\{/);
  assert.match(script, /fileInput\.click\(\)/);
  assert.match(script, /menu\.hidden = true/);
});
