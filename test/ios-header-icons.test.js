import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (f) => readFile(new URL('../public/' + f, import.meta.url), 'utf8');
const GEAR = /<path d="M19\.22 10\.39L21\.17 10\.43A9\.3 9\.3[^"]*Z"\/><circle cx="12" cy="12" r="3\.1"\/>/;
const CLOCK = '<path d="M3.6 12.6A8.5 8.5 0 1 0 6 6"/><path d="M6.4 2.9 6 6l3.1.5"/><path d="M12 7.6V12l3 1.8"/>';

// Owner request (2026-10-12): iOS-like header icons. Settings is a gear,
// history a clock with a back arrow, New chat the "compose" square and pencil.
// The same icons are used in the header and the desktop rail.
test('header uses iOS-style icons, the same everywhere', async () => {
  const html = await read('index.html');
  const header = /<header class="bar">([\s\S]*?)<\/header>/.exec(html)[1];
  const btn = (id) => new RegExp('<button[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</button>').exec(html)[1];
  assert.ok(btn('historyBtn').includes(CLOCK));
  assert.ok(btn('desktopHistoryBtn').includes(CLOCK));
  assert.match(btn('settingsBtn'), GEAR);
  assert.match(btn('desktopSettingsBtn'), GEAR);
  assert.match(btn('newChat'), /<path d="M11\.5 4\.5H7a2\.5 2\.5[^"]*"\/><path d="M17\.8 3\.8a1\.85[^"]*"\/>/);
  assert.doesNotMatch(html, /M4 7h9M17 7h3/, 'the old sliders icon is gone');
  assert.match(header, /<button type="button" class="btn header-signin" id="headerSignIn" hidden>Sign in<\/button>/, 'desktop Sign in stays in the header');
});

// Owner (2026-10-12): no Sign in button above the message box; Sign in stays
// in the header on every screen size.
test('Sign in is only in the header, never above the message box', async () => {
  const html = await read('index.html');
  const js = await read('app.js');
  const css = await read('app.css');
  assert.doesNotMatch(html + js + css, /guestSignIn|guest-signin/);
  assert.match(html, /<button type="button" class="btn header-signin" id="headerSignIn" hidden>Sign in<\/button>/);
  assert.match(js, /headerSignIn\.hidden = Boolean\(account\) \|\| !can;/);
  // Owner (2026-10-12): Sign in must not vanish when /v1/status is slow or
  // fails; only the server saying sign-in is off hides it.
  assert.match(js, /const can = signInMethods\.email \|\| signInMethods\.google \|\| !authMethodsLoaded;/);
  assert.match(js, /if \(authMethodsLoaded && !\(signInMethods\.email \|\| signInMethods\.google\)\) return;/);
  assert.match(js, /\$\('logoutMenu'\)\.hidden = !account;/, 'Log out is offered whenever signed in');
  assert.doesNotMatch(css, /\.header-signin \{ display: none; \}/, 'shown on phones too');
});
