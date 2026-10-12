import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// F1 (docs/feature-audit.md): on phones up to 390 px a signed-out chat made the
// header 404 px wide (brand, two icons, "New chat", "Sign in"), so the page
// scrolled sideways and Sign in was cut off. On phones "New chat" becomes an
// icon (its name stays for screen readers) and, while Sign in shows, the
// wordmark gives way below 400 px.
test('phone header fits: New chat is an icon, wordmark yields to Sign in', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  const btn = /<button[^>]*id="newChat"[^>]*>([\s\S]*?)<\/button>/.exec(html);
  assert.ok(btn, 'New chat button exists');
  assert.match(btn[0], /aria-label="New chat"/, 'keeps its accessible name');
  assert.match(btn[1], /<svg class="new-chat-ico"[^>]*aria-hidden="true"/);
  assert.match(btn[1], /<span class="new-chat-label">New chat<\/span>/);
  const phone = /@media \(max-width: 430px\) \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(phone, 'phone header rules exist');
  assert.match(phone[1], /#newChat \.new-chat-label \{ display: none; \}/);
  assert.match(phone[1], /#newChat \.new-chat-ico \{ display: block; \}/);
  // Sign in moved above the message box (test/ios-header-icons.test.js), so the wordmark no longer has to give way.
  assert.doesNotMatch(html, /<header class="bar">[\s\S]*?Sign in[\s\S]*?<\/header>/);
  assert.match(css, /\.new-chat-ico \{ display: none;/, 'icon hidden on wider screens');
});
