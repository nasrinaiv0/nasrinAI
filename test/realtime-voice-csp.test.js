import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_CSP } from '../src/http/headers.js';

// Realtime voice connects straight from the browser to the provider with a
// short-lived token; the page policy must allow exactly those hosts.
test('page CSP lets the browser reach the realtime voice providers', () => {
  const connect = PAGE_CSP.split('; ').find((d) => d.startsWith('connect-src '));
  assert.ok(connect.split(' ').includes('https://api.openai.com'));
  assert.ok(connect.split(' ').includes('wss://generativelanguage.googleapis.com'));
  assert.doesNotMatch(connect, /\*\s|\s\*$/, 'no wildcard connect-src');
});
