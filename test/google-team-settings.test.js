import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app] = await Promise.all([
  readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/app.js', import.meta.url), 'utf8')
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
  assert.match(app, /makeGooglePlugin\('drive', 'Google Drive', 'folder'\)/);
  assert.match(app, /google_drive_search/);
});

test('Team page wiring is additive and core navigation controls remain present', () => {
  assert.match(app, /querySelectorAll\('#settings \\[data-page\\]'\)/);
  for (const id of ['chatSend', 'newChat', 'settingsButton', 'composerPlus']) {
    assert.ok(html.includes('id="' + id + '"') || app.includes("'" + id + "'"), 'expected existing control wiring: ' + id);
  }
});
