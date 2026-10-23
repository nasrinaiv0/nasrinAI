import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOpenRouterPricingClient,
  estimateOpenRouterTextCost,
  normalizeOpenRouterModelSlug
} from '../src/ai/openrouter-pricing.js';

test('validates OpenRouter model slugs without allowing URL injection', () => {
  assert.equal(normalizeOpenRouterModelSlug('openai/gpt-4o'), 'openai/gpt-4o');
  assert.equal(normalizeOpenRouterModelSlug('google/gemini-2.5-flash'), 'google/gemini-2.5-flash');
  assert.equal(normalizeOpenRouterModelSlug('https://evil.example/openai/gpt-4o'), null);
  assert.equal(normalizeOpenRouterModelSlug('openai/gpt-4o?x=1'), null);
  assert.equal(normalizeOpenRouterModelSlug('../secret'), null);
});

test('fetches and caches live prompt/completion pricing', async () => {
  let calls = 0;
  const client = createOpenRouterPricingClient({
    now: () => 100,
    ttlMs: 1000,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://openrouter.ai/api/v1/model/openai/gpt-4o');
      assert.equal(options.method, 'GET');
      return { ok: true, status: 200, json: async () => ({ data: { pricing: { prompt: '0.0000025', completion: '0.00001' } } }) };
    }
  });
  const first = await client.getModelPrice('openai/gpt-4o');
  const second = await client.getModelPrice('openai/gpt-4o');
  assert.equal(first.ok, true);
  assert.equal(first.pricing.prompt, 0.0000025);
  assert.equal(first.pricing.completion, 0.00001);
  assert.equal(second.source, 'openrouter_catalog_cache');
  assert.equal(calls, 1);
});

test('force refresh bypasses cache', async () => {
  let calls = 0;
  const client = createOpenRouterPricingClient({
    fetchImpl: async () => {
      calls++;
      return { ok: true, status: 200, json: async () => ({ data: { pricing: { prompt: '0', completion: '0' } } }) };
    }
  });
  await client.getModelPrice('openai/gpt-4o');
  await client.getModelPrice('openai/gpt-4o', { forceRefresh: true });
  assert.equal(calls, 2);
});

test('handles missing model and malformed pricing safely', async () => {
  const notFound = createOpenRouterPricingClient({
    fetchImpl: async () => ({ ok: false, status: 404 })
  });
  assert.equal((await notFound.getModelPrice('openai/missing-model')).kind, 'model_not_found');

  const malformed = createOpenRouterPricingClient({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: { pricing: { prompt: 'unknown', completion: '0.1' } } }) })
  });
  assert.equal((await malformed.getModelPrice('openai/gpt-4o')).kind, 'pricing_invalid');
});

test('estimates text cost from token rates but rejects invalid token counts', () => {
  assert.equal(estimateOpenRouterTextCost({ prompt: 0.000001, completion: 0.000002 }, { promptTokens: 1000, completionTokens: 500 }), 0.002);
  assert.equal(estimateOpenRouterTextCost({ prompt: 0.1, completion: 0.1 }, { promptTokens: -1, completionTokens: 2 }), null);
  assert.equal(estimateOpenRouterTextCost(null, { promptTokens: 1, completionTokens: 1 }), null);
});
