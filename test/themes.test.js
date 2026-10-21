import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (f) => readFile(new URL('../' + f, import.meta.url), 'utf8');
const palettes = ['mono', 'orange', 'charcoal', 'galaxy', 'rose-quartz', 'ocean', 'forest', 'sunset', 'midnight'];

test('Settings offers the original and five additional premium themes', async () => {
  const html = await read('public/index.html');
  const values = [...html.matchAll(/<input type="radio" name="palette" value="([\w-]+)">/g)].map((m) => m[1]);
  assert.deepEqual(values, palettes);
  assert.match(html, /<p class="menu-label" id="paletteLabel">Theme<\/p>/);
});

test('all non-Mono palettes define light, dark, and system-dark tokens', async () => {
  const css = await read('public/app.css');
  for (const p of palettes.slice(1)) {
    assert.ok(css.includes(`data-palette="${p}"`), p + ' selector exists');
    assert.match(css, new RegExp(`:root\\[data-palette="${p}"\\][^{}]*\\{[^}]*--paper:[^}]*--accent:`), p + ' light colors/accent');
    assert.match(css, new RegExp(`:root\\[data-palette="${p}"\\]\\[data-theme="dark"\\]\\s*\\{[^}]*--paper:[^}]*--accent:`), p + ' dark colors/accent');
    assert.match(css, new RegExp(`:root\\[data-palette="${p}"\\]:not\\(\\[data-theme="light"\\]\\)\\s*\\{[^}]*--accent:`), p + ' system-dark accent');
  }
  assert.match(css, /:root\[data-palette="galaxy"\] body\s*\{\s*background:/, 'Galaxy renders its subtle celestial background');
  assert.match(css, /:root\[data-palette="orange"\][^{]*\{[^}]*--paper:\s*#F7F7F5/i, 'Orange uses a neutral light background');
  assert.match(css, /:root\[data-palette="orange"\][^{]*\{[^}]*--accent:\s*#F2B184/i, 'Orange uses pastel orange actions');
});

test('palette is applied before first paint and saved on this device', async () => {
  const early = await read('public/theme.js');
  assert.match(early, /localStorage\.getItem\('nasrin\.palette'\)/);
  assert.match(early, /rose-quartz.*ocean.*forest.*sunset.*midnight/, 'early theme bootstrap accepts all new palettes');
  const js = await read('public/app.js');
  assert.match(js, /palette: 'nasrin\.palette'/);
  assert.match(js, /saved\.set\(KEYS\.palette, r\.value\)/);
  assert.match(js, /const PALETTES = \['orange', 'charcoal', 'galaxy', 'rose-quartz', 'ocean', 'forest', 'sunset', 'midnight'\];/);
  const privacy = await read('public/legal/privacy.md');
  assert.match(privacy, /your choices \(appearance, theme,/i, 'privacy notice lists theme as a device choice');
});


test('Galaxy solar play scene is isolated to the empty welcome state', async () => {
  const html = await read('public/index.html');
  assert.match(html, /<script src="\/galaxy-scene\.js" defer><\/script>/);
  const scene = await read('public/galaxy-scene.js');
  assert.match(scene, /data-palette.*galaxy/);
  assert.match(scene, /welcome\.hidden/);
  assert.match(scene, /has-chat/);
  assert.match(scene, /setTimeout\(revealSun, 6200\)/);
  assert.match(scene, /Nasrin\.mood\('concerned'/);
  assert.match(scene, /MutationObserver/);
  const css = await read('public/app.css');
  assert.match(css, /\.galaxy-play-sun\.is-arriving/);
  assert.match(css, /\.planet-saturn/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
