import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Every browser script the app loads must at least parse. A syntax error in one
// file (for example public/files.js missing a closing bracket) stops that whole
// file from running in the browser, while tests that only check single lines
// stay green.
async function scripts(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + '/' + entry.name;
    if (entry.isDirectory()) out.push(...await scripts(path));
    else if (entry.name.endsWith('.js')) out.push(path);
  }
  return out;
}

test('every public/*.js browser script parses', async () => {
  const root = new URL('../public', import.meta.url).pathname;
  const files = await scripts(root);
  assert.ok(files.some((f) => f.endsWith('/files.js')), 'files.js is checked');
  for (const file of files) {
    const code = await readFile(file, 'utf8');
    assert.doesNotThrow(() => new vm.Script(code, { filename: file }), file.slice(root.length + 1));
  }
});
