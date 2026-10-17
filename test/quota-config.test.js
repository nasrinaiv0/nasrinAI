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
