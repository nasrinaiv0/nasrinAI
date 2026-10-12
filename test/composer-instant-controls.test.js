import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Owner (2026-10-12): the composer buttons show with the composer, with no
// loading or delay; they never wait for the model or professional lists.
test('the tier bars and the Automatic face render without waiting for the network', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const model = /<button[^>]*id="modelBtn"[^>]*>([\s\S]*?)<\/button>/.exec(html)[1];
  assert.match(model, /<rect class="on" x="4" y="13"/, 'the first bar is filled in the HTML');
  const face = /<span class="pro-ico" id="proBtnIcon" aria-hidden="true">([\s\S]*?)<\/span>/.exec(html)[1];
  assert.match(face, /class="nb-ball"/, 'the face is in the HTML');
  assert.equal((face.match(/class="nb-eye"/g) || []).length, 2);
  // The saved tier is shown before loadModels() runs.
  const early = js.indexOf("const level = LEVEL[saved.get(KEYS.model)] || 1;");
  assert.ok(early > 0 && early < js.indexOf('loadingModels = loadModels()'));
});
