import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Redesign R2 (docs/redesign.md): phones and tablets get an iOS-style bottom
// tab bar (Chat, Library, Projects, Settings) that opens the existing screens;
// desktop keeps its side rail. No duplicate screens.
test('tab bar markup: four labelled tabs, Chat current by default', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const nav = /<nav class="tabbar" id="tabbar" aria-label="Main">([\s\S]*?)<\/nav>/.exec(html);
  assert.ok(nav, 'tab bar exists');
  const tabs = [...nav[1].matchAll(/<button type="button" class="tab-item[^"]*" data-tab="(\w+)"[^>]*>[\s\S]*?<span class="tab-label">([^<]+)<\/span>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(tabs, [['chat', 'Chat'], ['library', 'Library'], ['projects', 'Projects'], ['settings', 'Settings']]);
  assert.match(nav[1], /data-tab="chat"[^>]*aria-current="page"/);
  assert.equal((nav[1].match(/<svg[^>]*aria-hidden="true"/g) || []).length, 4, 'icons are hidden from screen readers');
});

test('tabs reuse the existing screens and follow what is open', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const block = /\/\/ Phone tab bar \(docs\/redesign\.md R2\)([\s\S]*?)\/\/ End tab bar/.exec(js);
  assert.ok(block, 'tab bar script block');
  const b = block[1];
  assert.match(b, /if \(tab === 'settings'\) \{ openSettings\(\); return; \}/);
  assert.match(b, /openHistory\(tab\);/);
  assert.match(b, /closeSettings\(\); closeHistory\(\);/);
  assert.match(b, /new MutationObserver\(syncTabs\)/, 'the current tab follows the open sheet');
  assert.match(b, /setAttribute\('aria-current', 'page'\)/);
  assert.match(b, /classList\.toggle\('is-typing'/, 'hidden while typing so the keyboard has room');
  // Regression: removing the class at once on blur moved Send away mid-tap.
  assert.match(b, /addEventListener\('blur', \(\) => \{[\s\S]*?setTimeout\(\(\) => \{ if \(document\.activeElement !== input\) document\.body\.classList\.toggle\('is-typing', false\); \}, 300\)/);
});

test('tab bar layout: phones and tablets only, clear of the home indicator, composer above it', async () => {
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.tabbar \{ display: none; \}/);
  const m = /@media \(max-width: 69\.99rem\) \{\s*\/\* Tab bar([\s\S]*?)\n\}/.exec(css);
  assert.ok(m, 'phone/tablet tab bar rules');
  const r = m[1];
  assert.match(r, /--tabbar-h: calc\(3\.4rem \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(r, /\.tabbar \{[^}]*position: fixed;[^}]*bottom: 0;/);
  assert.match(r, /padding-bottom: env\(safe-area-inset-bottom\)/);
  assert.match(r, /\.dock \{[^}]*bottom: var\(--tabbar-h\);/);
  assert.match(r, /\.log \{[^}]*var\(--tabbar-h\)/);
  assert.match(r, /#settingsBtn \{ display: none; \}/, 'Settings moves from the header to the tab bar');
  assert.doesNotMatch(r, /body\.is-typing/, 'a keyboard-equipped tablet keeps its tabs');
  assert.match(css, /@media \(max-width: 69\.99rem\) and \(pointer: coarse\) \{\s*body\.is-typing \.tabbar \{ display: none; \}/);
});
