import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

// 2026-10-12 outage: ATTACHMENTS_MAX_MB above 3 in Vercel took the whole site
// down (503 not_configured). A bad optional limit now falls back with a warning.
test('a bad attachment limit uses the default and warns instead of failing start-up', () => {
  const cfg = loadConfig({ NODE_ENV: 'test', ATTACHMENTS_MAX_MB: '25', ATTACHMENTS_MAX_COUNT: 'many' });
  assert.equal(cfg.ai.attachments.maxTotalBytes, 3 * 1024 * 1024);
  assert.equal(cfg.ai.attachments.maxCount, 4);
  const w = cfg.warnings.join(' ');
  assert.match(w, /ATTACHMENTS_MAX_MB: use a whole number from 1 to 3\. Using 3\./);
  assert.match(w, /ATTACHMENTS_MAX_COUNT/);
  assert.doesNotMatch(w, /25|many/, 'the bad value is not echoed');
});

test('a valid attachment limit is kept', () => {
  const cfg = loadConfig({ NODE_ENV: 'test', ATTACHMENTS_MAX_MB: '2', ATTACHMENTS_MAX_COUNT: '6' });
  assert.equal(cfg.ai.attachments.maxTotalBytes, 2 * 1024 * 1024);
  assert.equal(cfg.ai.attachments.maxCount, 6);
});
