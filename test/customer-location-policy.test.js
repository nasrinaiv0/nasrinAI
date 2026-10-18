import test from 'node:test';
import assert from 'node:assert/strict';
import { setBaseHeaders } from '../src/http/headers.js';

test('page security policy permits first-party geolocation while leaving camera disabled', () => {
  const headers = new Map();
  const res = { setHeader(name, value) { headers.set(name.toLowerCase(), value); } };
  setBaseHeaders(res, { isProduction: false });
  assert.equal(headers.get('permissions-policy'), 'camera=(), geolocation=(self), microphone=(self)');
});
