import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Owner (2026-10-12): on desktop, Enter sends and Shift+Enter starts a new
// line. On phones and tablets (touch), Enter still only starts a new line and
// the Send button sends (owner's 2026-10-07 rule). Typing in another script
// with an input method (IME) never sends early.
test('desktop Enter sends; Shift+Enter, touch and IME keep the new line', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const h = /input\.addEventListener\('keydown', \(e\) => \{([\s\S]*?)\n  \}\);/.exec(js);
  assert.ok(h, 'the message box has a keydown handler');
  const body = h[1];
  assert.match(body, /e\.key !== 'Enter'/);
  assert.match(body, /e\.shiftKey/);
  assert.match(body, /e\.isComposing \|\| e\.keyCode === 229/);
  assert.match(body, /!desktopKeys\.matches/);
  assert.match(body, /e\.preventDefault\(\);/);
  assert.match(body, /if \(!turn\) send\(input\.value\);/, 'Enter never stops a reply that is being written');
  assert.match(js, /const desktopKeys = window\.matchMedia\('\(hover: hover\) and \(pointer: fine\)'\);/);
});
