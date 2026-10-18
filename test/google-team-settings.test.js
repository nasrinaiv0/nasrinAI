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
  assert.match(google, /\['gmail','calendar','drive','meet','keep'\]\.includes\(service\)/);
  assert.match(google, /DRIVE_SCOPE = 'https:\/\/www\.googleapis\.com\/auth\/drive\.readonly'/);
  assert.match(google, /state\.s === 'drive' \? 'drive'/);
  assert.match(google, /tokenFor\(w, 'drive'\)/);
  assert.match(app, /await Promise\.all\(\['gmail','calendar','drive','meet','keep','search','maps'\]/);
  assert.match(app, /'Google Drive': \{ service: 'drive', readService: 'drive', supported: true/);
  assert.match(app, /disconnectGoogle\(service\)/);
});

test('Google Meet, Keep, Search, and Maps are explicitly supported in the catalog', () => {
  assert.match(app, /'Google Meet': \{ service: 'meet'.*supported: true/s);
  assert.match(app, /'Google Keep': \{ service: 'keep'.*supported: true/s);
  assert.match(app, /'Google Maps': \{ service: 'maps', supported: true, siteConfigured: true/);
});

test('Google catalog exposes server-backed Meet, Keep, Search, and Maps integrations', () => {
  for (const [name, service] of [['Google Meet', 'meet'], ['Google Keep', 'keep'], ['Google Maps', 'maps']]) {
    assert.match(app, new RegExp("'" + name + "': \\{ service: '" + service + "',"));
  }
  assert.match(app, /'Google Meet': \{ service: 'meet'.*supported: true/s);
  assert.match(app, /'Google Keep': \{ service: 'keep'.*supported: true/s);
  assert.match(app, /'Google Maps': \{ service: 'maps', supported: true, siteConfigured: true/);
});

test('Google Meet and Keep use independent OAuth scopes and service records', () => {
  assert.match(google, /MEET_SCOPE = 'https:\/\/www\.googleapis\.com\/auth\/meetings\.space\.created'/);
  assert.match(google, /KEEP_SCOPE = 'https:\/\/www\.googleapis\.com\/auth\/keep\.readonly'/);
  assert.match(google, /\['gmail','calendar','drive','meet','keep'\]\.includes\(service\)/);
  assert.match(google, /\['drive','meet','keep'\]\.includes\(state\.s\)/);
  assert.match(google, /tokenFor\(w, 'meet'\)/);
  assert.match(google, /tokenFor\(w,'keep'\)/);
  assert.match(google, /name: 'google_meet_create_space'/);
  assert.match(google, /name: 'google_keep_list_notes'/);
});

test('Google Maps fleet routing uses Directions URLs without a Maps API key', () => {
  assert.match(google, /const mapsAvailable = true/);
  assert.match(google, /name: 'google_maps_fleet_route'/);
  assert.match(google, /https:\/\/www\.google\.com\/maps\/dir\//);
  assert.match(google, /apiKeyRequired:false/);
  assert.doesNotMatch(google, /GOOGLE_MAPS_API_KEY|google_maps_places_search/);
  assert.doesNotMatch(app, /GOOGLE_SEARCH_API_KEY|GOOGLE_SEARCH_ENGINE_ID|GOOGLE_MAPS_API_KEY/);
});
