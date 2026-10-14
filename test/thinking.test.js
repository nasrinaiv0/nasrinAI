import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the thinking sign is the dotted sphere in the normal chat and the coding chat', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const fn = app.slice(app.indexOf('function showThinking('), app.indexOf('function showThinking(') + 1500);
  assert.match(fn, /const ch = dotSphere\(mini\);/);
  assert.doesNotMatch(fn, /code-logo/, 'no robot in the thinking line');
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  assert.match(css, /:root\[data-motion="reduce"\] \.dots \{ animation: soft-pulse/, 'the app’s own reduce-motion setting stops the burst');
});

test('the sphere turns around its upright axis (like a globe), not flat like a wheel', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const fn = app.slice(app.indexOf('function dotSphere('), app.indexOf('function showThinking('));
  assert.match(fn, /const sx = d\.x \* ca \+ d\.z \* sa, z1 = -d\.x \* sa \+ d\.z \* ca;/, 'x and depth turn; height stays');
  assert.match(fn, /cancelAnimationFrame\(frame\)/, 'stops drawing when the line goes away');
  assert.match(fn, /const still = reduced\(\);\n    if \(!still\)/, 'still with reduced motion');
});

test('in every chat, "Putting it together" gathers the dots and "Almost done" makes them beep', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /ch\.stage\(\/\^Almost done\/\.test\(words\) \? 'beep' : \/\^Putting it together\/\.test\(words\) \? 'gather' : null\);/, 'in every chat, not only Code');
  const fn = app.slice(app.indexOf('function dotSphere('), app.indexOf('function showThinking('));
  assert.match(fn, /x \+= \(fx \+ \(sx - fx\) \* p - x\) \* gather/, 'dots fly from far away to their place');
  assert.match(fn, /const flash = Math\.exp\(-\(\(\(Math\.hypot\(sx, sy\) - wave \* 1\.2\) \* 5\) \*\* 2\)\);/, 'flashes ripple out from the middle');
  assert.doesNotMatch(fn, /swirl/, 'no spiral');
  assert.match(fn, /if \(still\) \{ beep = 0; gather = 0; draw\(0\); \}/, 'reduced motion: shown still');
});

test('Thinking expands evenly in every direction and stays a sphere', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const fn = app.slice(app.indexOf('function dotSphere('), app.indexOf('function showThinking('));
  assert.match(fn, /const k = R \* \(1 \+ burst \* 0\.75\)/, 'one scale for every dot');
  assert.doesNotMatch(fn, /d\.push/, 'no dot flies out further than the others');
});

test('the sphere keeps turning at a steady speed, also while it shrinks back', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const fn = app.slice(app.indexOf('function dotSphere('), app.indexOf('function showThinking('));
  assert.match(fn, /const turn = t \* TAU;/, 'no pause at the start or end of a turn');
});
