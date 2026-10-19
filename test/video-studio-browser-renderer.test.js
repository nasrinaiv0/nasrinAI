import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Video Studio exposes bounded browser timeline rendering and honest format detection', async () => {
  const html = await readFile(new URL('../public/video-studio.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/video-studio.css', import.meta.url), 'utf8');
  assert.match(html, /id="renderTimeline"/);
  assert.match(html, /id="renderProgress"/);
  assert.match(html, /id="renderDownload"/);
  assert.match(js, /MediaRecorder\.isTypeSupported/);
  assert.match(js, /total>180/);
  assert.match(js, /state\.clips\.slice\(0,30\)/);
  assert.match(js, /video\/webm/);
  assert.match(js, /video\/mp4/);
  assert.match(js, /audioDestination/);
  assert.match(js, /A timeline clip could not be loaded/);
  assert.match(css, /\.timeline-render/);
});
