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
  assert.match(js, /state\.clips\.length>40/);
  assert.match(js, /video\/webm/);
  assert.match(js, /video\/mp4/);
  assert.match(js, /audioDestination/);
  assert.match(js, /A timeline clip could not be loaded/);
  assert.match(js, /Math\.abs\(\(r\.media\.currentTime\|\|0\)-target\)>.35/);
  assert.match(js, /r\.media\.currentTime=target/);
  assert.match(css, /\.timeline-render/);
});

test('browser renderer audio stream declarations remain valid source lines', async () => {
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  assert.match(js, /audioDestination=audioContext\?audioContext\.createMediaStreamDestination\(\):null;/);\n  assert.match(js, /const output=new MediaStream\(\[\.\.\.canvasStream\.getVideoTracks\(\)/);
  assert.doesNotMatch(js, /null;\\\\n\s*const output=new MediaStream/);
});


test('browser renderer records clip audio and draws the current clip title', async () => {
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  assert.match(js, /createMediaElementSource\(media\);item\.gainNode=audioContext\.createGain\(\)/);\n  assert.match(js, /item\.gainNode\.connect\(audioDestination\)/);
  assert.doesNotMatch(js, /createMediaElementSource\(media\);source\.connect\(audioContext\.destination\)/);
  assert.match(js, /if\(r\.clip\.title&&r\.clip\.track!==\'audio\'\)/);
  assert.doesNotMatch(js, /const selected=state\.clips\.find\(c=>c\.id===state\.selected\);\s*if\(selected\?\.title\)/);
});


test('browser renderer refuses more than 30 clips rather than silently omitting the rest', async () => {
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  assert.match(js, /state\.clips\.length>40/);
  assert.match(js, /browser renderer supports up to 40 clips per export/);
  const renderer = js.slice(js.indexOf('async function renderTimelineVideo'), js.indexOf("$('renderTimeline').addEventListener"));
  assert.doesNotMatch(renderer, /state\.clips\.slice\(0,30\)/);
});

test('CapCut-style editor has unique IDs and working media, text, audio, save, and export controls', async () => {
  const html = await readFile(new URL('../public/video-studio.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/video-studio.css', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'HTML IDs must be unique for reliable editor controls');
  for (const id of ['editPanel','mediaBinItems','importMediaBin','binImportButton','previewFrame','timeline','editorInspector','toolText','toolAudio','toolExport','editorSave']) {
    if (id === 'editorInspector') continue; // Inspector is class-scoped rather than ID-scoped.
    assert.ok(ids.includes(id), 'missing editor control: '+id);
  }
  assert.match(js, /data-editor-tool/);
  assert.match(js, /assetId:c\.assetId\|\|null/);
  assert.ok(js.includes("$('mediaInput').click()"), 'import actions must open the media picker');
  assert.match(css, /\.capcut-editor/);
  assert.match(css, /\.media-bin/);
  assert.match(css, /\.timeline-section/);
  assert.match(css, /@media\(max-width:760px\)/);
});


test('Video Studio controls use consistent hit areas and responsive padding', async () => {
  const css = await readFile(new URL('../public/video-studio.css', import.meta.url), 'utf8');
  assert.match(css, /button:focus-visible,a:focus-visible/);
  assert.match(css, /\.project-actions \.quiet-button\{[^}]*min-width:0/);
  assert.match(css, /\.primary-button\{min-height:42px/);
  assert.match(css, /\.tabs\{align-items:stretch/);
  assert.match(css, /body\.editor-mode \.editor-tool\{min-height:38px/);
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /body\.editor-mode \.editor-inspector input\{min-height:38px/);
});

test('Video Studio icon buttons use fixed square sizing and responsive padding', async () => {
  const css = await readFile(new URL('../public/video-studio.css', import.meta.url), 'utf8');
  assert.match(css, /\.media-bin \.bin-add[\s\S]*?inline-size:40px/);
  assert.match(css, /\.preview-caption \.icon-button[\s\S]*?inline-size:34px/);
  assert.match(css, /\.import-drop[\s\S]*?inline-size:100%/);
  assert.match(css, /box-sizing:border-box/);
  assert.match(css, /@media\(max-width:360px\)/);
});
