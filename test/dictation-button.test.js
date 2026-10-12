import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Owner (2026-10-12): "fix the speech to text button make it responsive".
// Regression: while dictating, each recognised word re-ran refreshSendButton,
// which showed the Send arrow and the name "Send message", but tapping it only
// stopped listening (it never sends then). After stopping, the name stayed
// "Dictate message" next to the Send arrow.
test('while dictating the button shows Stop and is named Stop listening', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  const fn = /function refreshSendButton\(\) \{([\s\S]*?)\n  \}/.exec(js)[1];
  assert.match(fn, /sendBtn\.classList\.toggle\('is-listening', listening && !stopping\)/);
  assert.match(fn, /listening \? 'Stop listening' : hasText \? 'Send message' : 'Dictate message'/);
  const set = /function setListening\(on\) \{([\s\S]*?)\n  \}/.exec(js)[1];
  assert.match(set, /refreshSendButton\(\);/, 'the name and icon follow the listening state');
  assert.doesNotMatch(set, /micBtn\.setAttribute\('aria-label'/, 'one place names the button');
  assert.match(css, /\.send\.is-listening \.dictate-ico, \.send\.is-listening \.send-ico \{ display: none; \}/);
  assert.match(css, /\.send\.is-listening \.stop-ico \{ display: block; \}/);
  // The listening rules come after the has-text rule, so they win.
  assert.ok(css.indexOf('.send.is-listening .stop-ico') > css.indexOf('.send.has-text .send-ico { display: block; }'));
});
