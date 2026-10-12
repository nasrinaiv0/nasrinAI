import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// F3 (docs/feature-audit.md): signed out, Settings > Billing showed plain text
// "Sign in to see billing." with no way forward and an empty Payments box, after
// a request the server refuses (403). Now: no request, a Sign in button, and the
// empty Payments section is hidden.
test('signed-out Billing offers Sign in and hides the empty Payments box', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /<p class="menu-label" id="billingPaymentsLabel">Payments<\/p>/);
  const fn = /async function loadBilling\(\) \{([\s\S]*?)\n  \}\n/.exec(js);
  assert.ok(fn, 'loadBilling exists');
  const body = fn[1];
  const guard = body.indexOf('if (!account)');
  assert.ok(guard > -1, 'signed-out branch exists');
  assert.ok(guard < body.indexOf("api('/v1/billing')"), 'checked before calling the server');
  assert.match(body, /\$\('billingPaymentsLabel'\)\.hidden = hist\.hidden = !account;/);
  assert.match(body, /closeSettings\(\);\s*openSignIn\(\);/);
});
