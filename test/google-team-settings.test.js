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

test('Google integrations catalog replaces Google Cloud with Meet, Keep, Search and Maps', () => {
  const catalog = app.slice(app.indexOf('const MORE_PLUGINS'), app.indexOf('const MORE_PLUGINS') + 700);
  assert.match(catalog, /Google Maps/);
  assert.doesNotMatch(catalog, /Google Team/);
  assert.doesNotMatch(catalog, /Google Cloud/);
});

test('Every new Google catalog item has a defined glyph', () => {
  const glyphs = app.slice(app.indexOf('const PLUGIN_GLYPHS'), app.indexOf('const MORE_PLUGINS'));
  for (const glyph of ['video:', 'note:', 'search:', 'map:']) assert.ok(glyphs.includes(glyph), 'missing plugin glyph: ' + glyph);
});


test('Gmail, Calendar, and Drive have independent OAuth status and disconnect services', () => {
  assert.match(google, /\['gmail','calendar','drive'\]\.includes\(service\)/);
  assert.match(google, /DRIVE_SCOPE = 'https:\/\/www\.googleapis\.com\/auth\/drive\.readonly'/);
  assert.match(google, /state\.s === 'drive' \? 'drive'/);
  assert.match(google, /tokenFor\(w, 'drive'\)/);
  assert.match(app, /await Promise\.all\(\['gmail','calendar','drive'\]/);
  assert.match(app, /'Google Drive': \{ service: 'drive', readService: 'drive', supported: true/);
  assert.match(app, /disconnectGoogle\(service\)/);
});

test('Google Meet, Keep, Search, and Maps are not falsely shown as connected', () => {
  for (const name of ['Google Meet', 'Google Keep', 'Google Search', 'Google Maps']) {
    assert.match(app, new RegExp("'" + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "': \\{ supported: false \\}"));
  }
});
