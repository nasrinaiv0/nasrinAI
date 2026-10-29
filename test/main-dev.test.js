import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/main.js';
import { testConfig, memoryLogger } from './helpers.js';

test('the app starts without a database (local development with the in-memory store)', () => {
  const app = buildApp({ config: testConfig({ AI_PROVIDER: 'fake' }), logger: memoryLogger() });
  assert.equal(typeof app, 'function');
});
