import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, google] = await Promise.all([
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/google/index.js', import.meta.url), 'utf8')
]);

test('Settings exposes Google Team contacts with To, CC and BCC roles', () => {
  assert.match(html, /data-page="team"/);
  assert.match(html, /id="pageTeam"/);
  assert.match(html, /id="googleTeamEmail"/);
  assert.match(html, /<option value="to">To<\/option>/);
  assert.match(html, /<option value="cc">CC<\/option>/);
  assert.match(html, /<option value="bcc">BCC<\/option>/);
  assert.match(app, /team: \['pageTeam', 'Team'\]/);
});

test('Google Team contacts are account-scoped, editable and not capped by a fixed count', () => {
  assert.match(app, /identityKey\('nasrin\.google-team\.v1'\)/);
  assert.match(app, /googleTeamContacts\.push\(/);
  assert.match(app, /googleTeamContacts\.filter\(/);
  assert.match(html, /Remove all team members/);
  assert.doesNotMatch(app, /googleTeamContacts\.length\s*[><=]+\s*\d+/);
});

test('Google Drive remains registered in Plugins after Team settings changes', () => {
  assert.match(app, /makeGooglePlugin\('drive', 'Google Drive', 'team'\)/);
  assert.match(google, /name: 'google_drive_search'/);
});

test('Team page wiring is additive and core Settings navigation remains wired', () => {
  assert.match(app, /querySelectorAll\('#settings \[data-page\]'\)/);
  assert.match(app, /\$\('settingsBack'\)\.addEventListener\('click'/);
  assert.match(html, /id="settingsBack"/);
  assert.match(html, /id="settings"/);
});

test('Google Team email validation uses a normal JavaScript email regex', () => {
  assert.match(app, /if \(!\/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$\/\.test\(email\)\)/);
  assert.doesNotMatch(app, /\[\^\\\\\\\\s@\]/);
});

test('Google Team initialization is deferred until shared DOM helpers exist', () => {
  assert.match(app, /queueMicrotask\(initGoogleTeamSettings\)/);
  assert.doesNotMatch(app, /\n  initGoogleTeamSettings\(\);/);
});

test('Google Drive plugin uses an existing glyph key', () => {
  assert.match(app, /makeGooglePlugin\('drive', 'Google Drive', 'team'\)/);
});
