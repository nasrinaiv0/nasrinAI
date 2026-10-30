import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProviderSpendHooks } from '../src/ai/provider-billing.js';

test('without configured USD limits, provider-reported cost is recorded and nothing is held', async () => {
  let reserveCalls = 0;
  const legacyBudget = {
    async reserveSpend() { reserveCalls++; throw new Error('local USD reservation must not run'); },
    async settleSpend() { throw new Error('local USD settlement must not run'); }
  };
  const hooks = createProviderSpendHooks({
    budget: legacyBudget,
    config: { isProduction: true },
    caller: { tenantId: 'tenant-1', actor: { type: 'user', id: 'user-1' } },
    tier: 'ultra'
  });
  const reservation = await hooks.reserve({ provider: 'openai', model: 'provider/model-without-local-price', request: {} });
  assert.deepEqual(reservation, { provider: 'openai', model: 'provider/model-without-local-price', providerBilling: true, hold: null });
  const settled = await hooks.settle(reservation, { inputTokens: 10, outputTokens: 5, actualCostUsd: 0.0123 });
  assert.equal(settled.costUsd, 0.0123);
  assert.equal(settled.spendReservationId, null);
  assert.equal(reserveCalls, 0);
});

test('missing or invalid provider cost remains unknown, never estimated', async () => {
  const hooks = createProviderSpendHooks({ config: { isProduction: true } });
  const reservation = await hooks.reserve({ provider: 'anthropic', model: 'claude-current', request: {} });
  for (const result of [{ inputTokens: 10, outputTokens: 20 }, { actualCostUsd: -1 }, { actualCostUsd: 'unknown' }, { actualCostUsd: 100001 }]) {
    const settled = await hooks.settle(reservation, result);
    assert.equal(settled.costUsd, null);
    assert.equal(settled.spendReservationId, null);
  }
});

test('development fake-provider calls do not invent provider costs', async () => {
  const hooks = createProviderSpendHooks({ config: { isProduction: false } });
  assert.equal(await hooks.reserve({ provider: 'fake', model: 'fake-model', request: {} }), null);
  assert.deepEqual(await hooks.settle(null, { costUsd: 1 }), { costUsd: null, spendReservationId: null });
});
