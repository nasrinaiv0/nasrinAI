import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Video Studio keeps creation, timeline, and export visible in one workspace', async () => {
  const html = await readFile(new URL('../public/video-studio.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/video-studio.css', import.meta.url), 'utf8');

  for (const id of ['createPanel', 'editPanel', 'exportPanel', 'generate', 'timeline', 'renderTimeline']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(js, /\$\('createPanel'\)\.hidden=false;\$\('editPanel'\)\.hidden=false;\$\('exportPanel'\)\.hidden=false/);
  assert.match(js, /const targets=\{create:\$\('createPanel'\),edit:\$\('editPanel'\),export:\$\('exportPanel'\)\}/);
  assert.match(js, /target\.scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/);
  assert.match(css, /body\.editor-mode #editPanel\{display:grid;grid-template-columns:minmax\(180px,230px\) minmax\(0,1fr\) minmax\(190px,240px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
});

test('unified workspace does not claim full CapCut parity or guaranteed MP4 from browser renderer', async () => {
  const spec = await readFile(new URL('../docs/video-studio-unified-editor.md', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  assert.match(spec, /not a claim of feature parity/i);
  assert.match(spec, /entire composed multi-track timeline/i);
  assert.match(spec, /Do not claim MP4 if the actual encoder only outputs WebM/i);
  assert.match(js, /const extension=mime\.includes\('mp4'\)\?'mp4':'webm'/);
});
