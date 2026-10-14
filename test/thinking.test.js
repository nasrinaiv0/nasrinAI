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

test('in the coding chat, "Almost done" is a different sign: the dots swirl into a spiral', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /ch\.finishing\(document\.body\.classList\.contains\('coding-mode'\) && \/\^Almost done\/\.test\(words\)\);/);
  const fn = app.slice(app.indexOf('function dotSphere('), app.indexOf('function showThinking('));
  assert.match(fn, /const x = sx \+ \(rx - sx\) \* swirl/, 'sphere and spiral blend');
  assert.match(fn, /const th = d\.arm \+ d\.u \* 3\.4 \+ t \* TAU/, 'three arms turning together');
  assert.doesNotMatch(fn, /ring/, 'no ring');
  assert.match(fn, /if \(still\) \{ swirl = goal; draw\(0\); \}/, 'reduced motion: shown still');
});
