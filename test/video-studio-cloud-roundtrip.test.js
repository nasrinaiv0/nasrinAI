import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('opening a cloud Video Studio project restores its saved prompt', async () => {
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  const hydrate = js.slice(js.indexOf('function applyCloudProject'), js.indexOf('async function saveCloudProject'));
  assert.match(hydrate, /if\(typeof d\.prompt==='string'\)\$\('prompt'\)\.value=d\.prompt\.slice\(0,1800\)/);
  assert.match(js.slice(js.indexOf('function cloudDocument'), js.indexOf('function applyCloudProject')), /prompt:safe\(\$\('prompt'\)\.value\)\.slice\(0,1800\)/);
});
