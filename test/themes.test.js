import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Split a selector list on its top-level commas (not those inside :where()).
function topLevel(sel) {
  const out = []; let depth = 0; let cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  return [...out, cur];
}

const read = (f) => readFile(new URL('../' + f, import.meta.url), 'utf8');

// Owner request (2026-10-12): besides Appearance (Light, Dark, System), a Theme:
// Orange, Charcoal, Galaxy. Mono (the existing look) stays the default.
test('Settings offers Mono, Orange, Charcoal and Galaxy under Theme', async () => {
  const html = await read('public/index.html');
  const values = [...html.matchAll(/<input type="radio" name="palette" value="(\w+)">/g)].map((m) => m[1]);
  assert.deepEqual(values, ['mono', 'orange', 'charcoal', 'galaxy']);
  assert.match(html, /<p class="menu-label" id="paletteLabel">Theme<\/p>/);
});

test('each theme has Light and Dark colours and an accent; Mono is untouched', async () => {
  const css = await read('public/app.css');
  for (const p of ['orange', 'charcoal', 'galaxy']) {
    assert.match(css, new RegExp(`:root\\[data-palette="${p}"\\] \\{[^}]*--paper:[^}]*--accent:`), p + ' light');
    assert.match(css, new RegExp(`:root\\[data-palette="${p}"\\]\\[data-theme="dark"\\] \\{[^}]*--paper:[^}]*--accent:`), p + ' dark');
    assert.match(css, new RegExp(`:root\\[data-palette="${p}"\\]:not\\(\\[data-theme="light"\\]\\) \\{[^}]*--accent:`), p + ' system dark');
  }
  // The accent only applies inside a theme, so Mono looks exactly as before.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const accentRules = [...bare.matchAll(/([^{}]+)\{[^}]*var\(--accent\)/g)].map((m) => m[1]);
  assert.ok(accentRules.length > 0);
  for (const sel of accentRules) {
    for (const part of topLevel(sel)) if (part.trim()) assert.match(part.trim(), /^:root\[data-palette\]/, 'accent outside a theme: ' + part.trim());
  }
});

test('the theme is applied before the page is drawn and saved on this device', async () => {
  const early = await read('public/theme.js');
  assert.match(early, /localStorage\.getItem\('nasrin\.palette'\)/);
  assert.match(early, /c === 'orange' \|\| c === 'charcoal' \|\| c === 'galaxy'/, 'only known themes are applied');
  const js = await read('public/app.js');
  assert.match(js, /palette: 'nasrin\.palette'/);
  assert.match(js, /saved\.set\(KEYS\.palette, r\.value\)/);
  assert.match(js, /const PALETTES = \['orange', 'charcoal', 'galaxy'\];/);
  const privacy = await read('public/legal/privacy.md');
  assert.match(privacy, /your choices \(appearance, theme,/, 'the privacy notice lists the theme as a device choice');
});
