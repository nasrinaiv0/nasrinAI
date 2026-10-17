import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError } from '../src/config.js';

test('production requires explicit Ultra weekly token quota', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), ConfigError);
});
