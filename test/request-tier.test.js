import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRequestTier, imageRouteCeiling } from '../src/ai/request-tier.js';

test('higher subscription can deliberately select a lower request tier', () => {
  assert.equal(resolveRequestTier('pro', 'ultra'), 'pro');
  assert.equal(resolveRequestTier('pro', 'max'), 'pro');
  assert.equal(resolveRequestTier('ultra', 'ultra'), 'ultra');
});
test('server entitlement rejects tiers above subscription', () => {
  assert.throws(() => resolveRequestTier('ultra', 'pro'), { code: 'tier_not_entitled', status: 403 });
  assert.throws(() => resolveRequestTier('max', 'pro'), { code: 'tier_not_entitled', status: 403 });
  assert.throws(() => resolveRequestTier('pro', 'max', { open: true }), { code: 'tier_not_entitled', status: 403 });
});
test('guest and free accounts remain Quick-only and invalid values fail closed', () => {
  assert.equal(resolveRequestTier(undefined, 'nasrinai', { guest: true }), 'nasrinai');
  assert.throws(() => resolveRequestTier('pro', 'nasrinai', { guest: true }), { code: 'tier_not_entitled', status: 403 });
  assert.throws(() => resolveRequestTier('model-from-client', 'ultra'), { code: 'invalid_tier', status: 400 });
  assert.equal(resolveRequestTier('free', 'free'), 'nasrinai');
});
test('image slots are capped by selected request tier', () => {
  assert.equal(imageRouteCeiling('pro'), 1);
  assert.equal(imageRouteCeiling('max'), 2);
  assert.equal(imageRouteCeiling('ultra'), 3);
  assert.equal(imageRouteCeiling('nasrinai'), 1);
});
