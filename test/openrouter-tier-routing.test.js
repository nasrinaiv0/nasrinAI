import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENROUTER_MODEL_ROUTING, getOpenRouterModel, eligibleOpenRouterModels,
  canFallbackToOpenRouterModel, tierIsFreeOnly
} from '../src/ai/openrouter-tier-routing.js';

test('model IDs are unique and all registry entries have explicit routing metadata', () => {
  const ids = OPENROUTER_MODEL_ROUTING.map((model) => model.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const model of OPENROUTER_MODEL_ROUTING) {
    assert.ok(model.name && model.id && model.category && model.endpoint);
    assert.ok(Array.isArray(model.tiers) && model.tiers.length);
    assert.ok(Array.isArray(model.input) && model.input.length);
    assert.ok(Array.isArray(model.output) && model.output.length);
  }
});

test('Guest and free Quick cannot select paid-only entries', () => {
  for (const tier of ['guest', 'quick-free']) {
    const models = eligibleOpenRouterModels({ tier });
    assert.ok(models.length > 0);
    assert.ok(models.every((model) => model.tiers.includes(tier)));
    assert.ok(models.every((model) => model.id.endsWith(':free') || model.category === 'embeddings' || model.category === 'reranking' || model.category === 'decisions' || model.category === 'safety' || model.category === 'text'));
    assert.ok(!models.some((model) => ['image','video','speech','audio'].includes(model.category)), 'Guest/free Quick must not get media generation');
  }
});

test('paid Quick uses only explicit quick-paid entries and never free-only routing by default', () => {
  const models = eligibleOpenRouterModels({ tier: 'quick-paid' });
  assert.ok(models.length > 0);
  assert.ok(models.every((model) => model.tiers.includes('quick-paid')));
  assert.ok(!models.some((model) => model.tiers.includes('guest') && !model.tiers.includes('quick-paid')));
});

test('paid tiers follow the source document assignments', () => {
  assert.deepEqual(getOpenRouterModel('anthropic/claude-opus-5.5').tiers, ['max','ultra']);
  assert.deepEqual(getOpenRouterModel('openai/gpt-6.1-sol-pro').tiers, ['ultra']);
  assert.deepEqual(getOpenRouterModel('heygen/heygen-video-1').tiers, ['max']);
  assert.deepEqual(getOpenRouterModel('alibaba/wan-3.0').tiers, ['max','ultra']);
  assert.deepEqual(getOpenRouterModel('qwen/qwen-image-2.1-pro').tiers, ['pro']);
});

test('inferred model IDs are excluded until explicitly verified', () => {
  const inferred = OPENROUTER_MODEL_ROUTING.find((model) => model.inferred);
  assert.ok(inferred);
  assert.equal(eligibleOpenRouterModels({ tier: inferred.tiers[0] }).includes(inferred), false);
  assert.equal(eligibleOpenRouterModels({ tier: inferred.tiers[0], verifiedIds: [inferred.id] }).includes(inferred), true);
});

test('fallbacks cannot cross output category or tier entitlement', () => {
  const image = getOpenRouterModel('google/gemini-3.1-flash-lite-image');
  const text = getOpenRouterModel('openai/gpt-6-luna');
  assert.equal(canFallbackToOpenRouterModel({ from: image, to: text, tier: 'quick-paid' }), false);
  assert.equal(canFallbackToOpenRouterModel({ from: image, to: image, tier: 'guest' }), false);
  assert.equal(canFallbackToOpenRouterModel({ from: text, to: text, tier: 'pro' }), true);
});

test('free-only tier helper is explicit and stable', () => {
  assert.equal(tierIsFreeOnly('guest'), true);
  assert.equal(tierIsFreeOnly('quick-free'), true);
  assert.equal(tierIsFreeOnly('quick-paid'), false);
  assert.equal(tierIsFreeOnly('pro'), false);
});
