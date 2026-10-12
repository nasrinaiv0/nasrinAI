import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (f) => readFile(new URL('../public/' + f, import.meta.url), 'utf8');

// Owner (2026-10-12): a top bar with a menu button on phones and tablets that
// opens the content (Library, Projects, chats, New chat, Settings); the
// bottom tab bar becomes an option.
test('menu button opens a drawer with the space, recent chats, New chat and Settings', async () => {
  const html = await read('index.html');
  assert.match(html, /<header class="bar">\s*<button type="button" class="icon-btn menu-btn" id="menuBtn" aria-haspopup="dialog" aria-expanded="false" aria-controls="drawer"/);
  const d = /<aside class="drawer" id="drawer"[^>]*>([\s\S]*?)<\/aside>/.exec(html)[1];
  for (const id of ['drawerSearch', 'drawerLibrary', 'drawerProjects', 'drawerChats', 'drawerSeeAll', 'drawerNewChat', 'drawerSettings']) assert.match(d, new RegExp('id="' + id + '"'));
  const js = await read('app.js');
  assert.match(js, /openHistory\(b\.dataset\.open\)/, 'drawer links reuse the existing screens');
  assert.match(js, /\.slice\(0, 8\)/, 'up to 8 recent chats');
  const css = await read('app.css');
  assert.match(css, /\.menu-btn \{ display: none; \}\n\.drawer, \.drawer-scrim \{ display: none; \}\n@media \(max-width: 69\.99rem\) \{\n  \.menu-btn \{ display: inline-flex;/, 'phones and tablets only');
});

test('the bottom tab bar is an option, off by default', async () => {
  const html = await read('index.html');
  assert.match(html, /<nav class="tabbar" id="tabbar" aria-label="Main">/);
  assert.match(html, /<input type="checkbox" role="switch" class="switch" id="tabbarOn">/);
  const css = await read('app.css');
  const block = css.slice(css.indexOf('/* Optional bottom tab bar'), css.indexOf('/* Menu button and drawer'));
  // Every rule that shows the bar or moves the page needs the opt-in.
  for (const line of block.split('\n').filter((l) => /^\s{2}\S.*\{/.test(l))) assert.match(line, /:root\[data-tabbar="on"\]/, line.trim());
  const early = await read('theme.js');
  assert.match(early, /localStorage\.getItem\('nasrin\.tabbar'\)\) === true\) document\.documentElement\.setAttribute\('data-tabbar', 'on'\)/);
  const js = await read('app.js');
  assert.match(js, /tabbarBox\.checked = saved\.get\(KEYS\.tabbar\) === true;/);
});
