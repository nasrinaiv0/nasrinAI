import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('desktop navigation is accessible and delegates to existing controls', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const id of ['desktopNewChat', 'desktopSettingsBtn']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /class="desktop-rail" aria-label="NasrinAI desktop navigation"/);
  assert.match(css, /@media \(min-width: 70rem\)/);
  assert.match(css, /max-aspect-ratio: 4\/3/);
  assert.match(js, /desktopNewChat'\)\?\.addEventListener\('click', \(\) => \$\('newChat'\)\?\.click\(\)/);
  assert.match(js, /desktopHistoryBtn'\)\?\.addEventListener\('click', \(\) => \$\('historyBtn'\)\?\.click\(\)/);
  assert.match(js, /desktopSettingsBtn'\)\?\.addEventListener\('click', \(\) => \$\('settingsBtn'\)\?\.click\(\)/);
  assert.doesNotMatch(html, /\son(?:click|load|error)\s*=/i);
});



test('desktop composer spacing and navigation are clean and non-duplicated', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  const railStart = html.indexOf('<aside class="desktop-rail"');
  const railEnd = html.indexOf('<header class="bar">');
  assert.ok(railStart >= 0 && railEnd > railStart, 'desktop rail markup should exist');
  const rail = html.slice(railStart, railEnd);
  assert.equal(rail.split('id="desktopCodeBtn"').length - 1, 1);
  assert.equal(rail.split('id="desktopResearchBtn"').length - 1, 0);
  assert.equal(rail.split('id="desktopHistoryBtn"').length - 1, 0);
  assert.ok(!rail.includes('<button type="button" class="desktop-rail-action" id="desktopCodeBtn">\n    <button'));
  assert.ok(css.includes('body:not(.has-chat) .dock { bottom: 150px; }'));
  assert.ok(css.includes('body.has-chat .dock { bottom: 50px; }'));
  assert.ok(css.includes('.bar-actions > #historyBtn,'));
  assert.ok(css.includes('.bar-actions > #settingsBtn,'));
  assert.ok(css.includes('.bar-actions > #newChat { display: none !important; }'));
});

test('desktop navigation omits standalone Research and Your chats entries', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const rail = html.slice(html.indexOf('<aside class="desktop-rail"'), html.indexOf('<header class="bar">'));
  assert.doesNotMatch(rail, /id="desktopResearchBtn"|id="desktopHistoryBtn"|<span>Research<\/span>|<span>Your chats<\/span>/);
  assert.match(rail, /id="desktopCodeBtn"/);
  assert.match(rail, /desktop-rail-studio/);
});
