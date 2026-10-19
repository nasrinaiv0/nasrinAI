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

test('browser renderer audio stream declarations remain valid source lines', async () => {
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  assert.match(js, /audioDestination=audioContext\?audioContext\.createMediaStreamDestination\(\):null;\s+const output=new MediaStream/);
  assert.doesNotMatch(js, /null;\\\\n\s*const output=new MediaStream/);
});


test('browser renderer records clip audio and draws the current clip title', async () => {
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  assert.match(js, /createMediaElementSource\(media\);source\.connect\(audioDestination\)/);
  assert.doesNotMatch(js, /createMediaElementSource\(media\);source\.connect\(audioContext\.destination\)/);
  assert.match(js, /if\(clip\?\.title\)/);
  assert.doesNotMatch(js, /const selected=state\.clips\.find\(c=>c\.id===state\.selected\);\s*if\(selected\?\.title\)/);
});


test('browser renderer refuses more than 30 clips rather than silently omitting the rest', async () => {
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  assert.match(js, /state\.clips\.length>30/);
  assert.match(js, /Browser export supports up to 30 clips per render/);
  assert.doesNotMatch(js, /state\.clips\.slice\(0,30\)/);
});
