import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// F2 (docs/feature-audit.md): on touch screens every control is at least
// 44 x 44 pt (Apple's minimum). Mouse layouts keep their compact sizes.
test('touch screens: controls are at least 44 x 44', async () => {
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  const block = /\/\* Touch targets[^]*?@media \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(block, 'a pointer: coarse block exists');
  const body = block[1];
  for (const sel of ['.icon-btn', '#newChat', '.tool', '.mic', '.send', '.act', '.starter', '.btn', '.listen', '.composer .pro-btn', '.rich .code-copy', '.msg.problem .retry', '.edit-msg']) {
    assert.ok(body.includes(sel), `${sel} is covered`);
  }
  assert.match(body, /min-width: 2\.75rem/);
  assert.match(body, /min-height: 2\.75rem/);
  assert.match(body, /\.reply-actions \{ flex-wrap: wrap; \}/, 'reply actions wrap instead of overflowing');
  // It must come after the rules it raises, so it wins at equal specificity.
  assert.ok(css.lastIndexOf('@media (pointer: coarse)') > css.indexOf('.composer .pro-btn { flex: 0 1 auto'));
});
