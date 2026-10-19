import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Video Studio workspace includes project, audio, timeline, and MP4 export surfaces', async () => {
  const html = await readFile(new URL('../public/studio/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/studio/studio.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/studio/studio.css', import.meta.url), 'utf8');
  for (const id of ['signinPanel', 'emailForm', 'codeForm', 'studioApp', 'projectSelect', 'videoForm', 'voiceForm', 'effectForm', 'assetList', 'timeline', 'exportVideo']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(js, /\/v1\/auth\/email\/start/);
  assert.match(js, /\/v1\/auth\/email\/verify/);
  assert.match(js, /\/v1\/auth\/refresh/);
  assert.match(js, /\/v1\/video-studio\/timeline/);
  assert.match(js, /\/v1\/video-studio\/export/);
  assert.match(js, /credentials: 'same-origin'/);
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:560px\)/);
});

test('Studio host redirect preserves same-origin HttpOnly authentication cookies', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const redirect = config.redirects.find(r => r.has?.some(h => h.value === 'studio.nasrinai.com'));
  assert.equal(redirect?.destination, 'https://nasrinai.com/studio/');
});
