import test from 'node:test';
import assert from 'node:assert/strict';
import { isCronAuthorized } from '../src/routes.js';

const secret = 'test-cron-secret-that-is-not-empty';

test('internal cron authorization requires the exact bearer secret', () => {
  assert.equal(isCronAuthorized({ headers: { authorization: 'Bearer ' + secret } }, secret), true);
  assert.equal(isCronAuthorized({ headers: { authorization: 'bearer ' + secret } }, secret), false);
  assert.equal(isCronAuthorized({ headers: { authorization: secret } }, secret), false);
  assert.equal(isCronAuthorized({ headers: { authorization: 'Bearer wrong' } }, secret), false);
});

test('internal cron authorization fails closed for missing, empty, oversized, or query-only credentials', () => {
  assert.equal(isCronAuthorized({ headers: {} }, secret), false);
  assert.equal(isCronAuthorized({ headers: { authorization: 'Bearer ' + secret } }, ''), false);
  assert.equal(isCronAuthorized({ headers: { authorization: 'Bearer ' + 'x'.repeat(600) } }, secret), false);
  assert.equal(isCronAuthorized({ headers: {}, url: '/v1/internal/knowledge-learning?secret=' + secret }, secret), false);
  assert.equal(isCronAuthorized(null, secret), false);
});
