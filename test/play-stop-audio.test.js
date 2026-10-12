import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Backlog item 6: the reply's "Listen / Loading / Pause / Resume" pill and the
// separate Stop button become one simple play/stop icon button, the same size
// as the other reply actions, with an accessible label that says what it does.
test('reply audio is one play/stop button with clear labels', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  const make = /if \(canSpeakAnything\(\)\) \{([\s\S]*?)row\.appendChild\(b\);/.exec(js);
  assert.ok(make, 'the button is made in replyActions');
  assert.match(make[1], /b\.className = 'act listen';/);
  assert.match(make[1], /setAttribute\('aria-label', 'Play reply aloud'\)/);
  assert.doesNotMatch(make[1], /'Listen'/, 'no text label');
  assert.match(make[1], /if \(playing && playing\.button === b\) \{ stopSpeaking\(\); return; \}/, 'tap again stops');
  const sp = /function setPlaying\(button, on, loading = false\) \{([\s\S]*?)\n  \}/.exec(js);
  assert.ok(sp, 'setPlaying has two states');
  assert.match(sp[1], /'Stop reading aloud'/);
  assert.match(sp[1], /'Play reply aloud'/);
  assert.doesNotMatch(sp[1], /listen-stop|Resume|Pause listening/);
  assert.doesNotMatch(js, /stop\.className = 'act listen-stop'/);
  assert.match(css, /\.act\.listen \{[^}]*border: 0;/);
});
