import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (f) => readFile(new URL('../public/' + f, import.meta.url), 'utf8');
const GEAR = /<path d="M19\.22 10\.39L21\.17 10\.43A9\.3 9\.3[^"]*Z"\/><circle cx="12" cy="12" r="3\.1"\/>/;
const CLOCK = '<path d="M3.6 12.6A8.5 8.5 0 1 0 6 6"/><path d="M6.4 2.9 6 6l3.1.5"/><path d="M12 7.6V12l3 1.8"/>';

// Owner request (2026-10-12): iOS-like header icons. Settings is a gear,
// history a clock with a back arrow, New chat the "compose" square and pencil.
// The same icons are used in the header, the desktop rail and the tab bar.
test('header uses iOS-style icons, the same everywhere', async () => {
  const html = await read('index.html');
  const header = /<header class="bar">([\s\S]*?)<\/header>/.exec(html)[1];
  const btn = (id) => new RegExp('<button[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</button>').exec(html)[1];
  assert.ok(btn('historyBtn').includes(CLOCK));
  assert.ok(btn('desktopHistoryBtn').includes(CLOCK));
  assert.match(btn('settingsBtn'), GEAR);
  assert.match(btn('desktopSettingsBtn'), GEAR);
  assert.match(/data-tab="settings">([\s\S]*?)<\/button>/.exec(html)[1], GEAR);
  assert.match(btn('newChat'), /<path d="M11\.5 4\.5H7a2\.5 2\.5[^"]*"\/><path d="M17\.8 3\.8a1\.85[^"]*"\/>/);
  assert.doesNotMatch(html, /M4 7h9M17 7h3/, 'the old sliders icon is gone');
  assert.doesNotMatch(header, /Sign in/);
});

// Owner request (2026-10-12): a guest's Sign in sits just above the message box.
test('guest Sign in sits above the message box and only shows to guests', async () => {
  const html = await read('index.html');
  const js = await read('app.js');
  const css = await read('app.css');
  const dock = /<footer class="dock">([\s\S]*?)<form class="composer"/.exec(html)[1];
  assert.match(dock, /<button type="button" class="guest-signin" id="guestSignIn" hidden>[\s\S]*?<span>Sign in<\/span><\/button>\s*<p class="notice"/);
  assert.match(js, /guestSignIn\.addEventListener\('click', \(\) => openSignIn\(\)\)/);
  assert.match(js, /guestSignIn\.hidden = Boolean\(account\) \|\| !can;/, 'hidden when signed in or when sign-in is off');
  assert.doesNotMatch(js, /headerSignIn/);
  assert.match(css, /\.guest-signin\[hidden\] \{ display: none; \}/);
  assert.match(css, /@media \(pointer: coarse\) \{ \.guest-signin \{ min-height: 2\.75rem; \} \}/, '44 pt on touch');
  assert.match(css, /body\.is-typing \.guest-signin \{ display: none; \}/, 'steps aside for the keyboard');
});
