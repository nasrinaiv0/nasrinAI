import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError } from '../src/config.js';

test('production requires explicit Ultra weekly token quota', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), ConfigError);
});

test('custom Ultra weekly allowance is loaded from the environment', () => {
  const config = loadConfig({ ULTRA_WEEKLY_TOKEN_LIMIT: '25000000' });
  assert.equal(config.limits.ultraWeeklyTokens, 25_000_000);
});

import { buildTestApp, serve, bearer, USER_TOKEN } from './helpers.js';

test('quota diagnostic is hidden unless its separate owner secret is supplied', async () => {
  const { app } = buildTestApp({ env: { OWNER_DIAGNOSTICS_TOKEN: 'o'.repeat(40), ULTRA_WEEKLY_TOKEN_LIMIT: '25000000' } });
  const server = await serve(app);
  try {
    const missing = await fetch(server.url + '/v1/owner/quota-config', { headers: bearer(USER_TOKEN) });
    assert.equal(missing.status, 404);
    const visible = await fetch(server.url + '/v1/owner/quota-config', {
      headers: { ...bearer(USER_TOKEN), 'X-Owner-Diagnostics-Token': 'o'.repeat(40) }
    });
    assert.equal(visible.status, 200);
    const body = await visible.json();
    assert.equal(body.effective_limits.ultra_weekly_tokens, 25_000_000);
    assert.equal(JSON.stringify(body).includes('o'.repeat(40)), false);
  } finally {
    await server.close();
  }
});
