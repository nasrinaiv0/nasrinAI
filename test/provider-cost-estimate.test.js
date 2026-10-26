import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateProviderRequestCost, PROVIDER_PRICING_VERSION } from '../src/ai/provider-cost-estimate.js';

test('OpenAI direct request estimate accounts for cached input at its separate rate', () => {
  const amount = estimateProviderRequestCost({
    provider: 'openai', model: 'gpt-6-luna',
    inputTokens: 1_000_000, cachedTokens: 100_000, outputTokens: 200_000
  });
  assert.equal(amount, 0.191);
  assert.equal(PROVIDER_PRICING_VERSION, '2026-10-26-v1');
});

test('Anthropic estimate treats cache-read tokens as separate from input_tokens', () => {
  const amount = estimateProviderRequestCost({
    provider: 'anthropic', model: 'claude-sonnet-5.5',
    inputTokens: 1_000, cachedTokens: 2_000, outputTokens: 500
  });
  assert.equal(amount, 0.0072);
});

test('Anthropic Haiku uses its higher rate when total prompt exceeds 100K tokens', () => {
  const amount = estimateProviderRequestCost({
    provider: 'anthropic', model: 'claude-haiku-5-5',
    inputTokens: 100_001, cachedTokens: 0, outputTokens: 1_000
  });
  assert.equal(amount, 0.0525005);
});

test('Gemini direct estimates use the configured paid Standard list price, not a false actual-cost claim', () => {
  const amount = estimateProviderRequestCost({
    provider: 'google', model: 'google/gemini-3.1-flash-lite',
    inputTokens: 1_000_000, cachedTokens: 100_000, outputTokens: 1_000_000
  });
  assert.equal(amount, 1.725);
});

test('unknown providers, unpriced models, and invalid token counts remain unknown', () => {
  assert.equal(estimateProviderRequestCost({ provider: 'openai', model: 'unpriced-model', inputTokens: 10, outputTokens: 10 }), null);
  assert.equal(estimateProviderRequestCost({ provider: 'local', model: 'llama3', inputTokens: 10, outputTokens: 10 }), null);
  assert.equal(estimateProviderRequestCost({ provider: 'openai', model: 'gpt-6-luna', inputTokens: -1, outputTokens: 10 }), null);
  assert.equal(estimateProviderRequestCost({ provider: 'openai', model: 'gpt-6-luna', inputTokens: 1, cachedTokens: 2, outputTokens: 10 }), null);
});
