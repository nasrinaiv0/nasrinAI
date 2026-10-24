import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_CAPABILITIES, modelsForCapability, getModelCapability, assertCapabilityRoute } from '../src/ai/model-capabilities.js';

test('capability registry has unique model IDs and explicit endpoint/integration metadata', () => {
  const ids = MODEL_CAPABILITIES.map((model) => model.id);
  assert.equal(new Set(ids).size, ids.length, 'model IDs must be unique');
  for (const model of MODEL_CAPABILITIES) {
    assert.ok(model.id && model.name && model.modality && model.endpoint, model.name);
    assert.ok(Array.isArray(model.tierAccess) && model.tierAccess.length > 0, model.name);
    assert.ok(model.integrationStatus && model.verificationStatus, model.name);
  }
});

test('tier assignments keep free-only catalog models out of paid tier model selection', () => {
  for (const model of MODEL_CAPABILITIES.filter((item) => item.id.endsWith(':free') && item.modality === 'text')) {
    assert.ok(model.tierAccess.includes('guest') || model.tierAccess.includes('quick-free'), model.name);
    assert.ok(!model.tierAccess.includes('pro') && !model.tierAccess.includes('max') && !model.tierAccess.includes('ultra'), model.name);
  }
  assert.ok(modelsForCapability('image-generation', 'ultra').length > 0);
  assert.ok(modelsForCapability('video-generation', 'ultra').length > 0);
});

test('specialized endpoints are categorized separately from chat and must fail closed until verified', () => {
  for (const category of ['image-generation', 'video-generation', 'text-to-speech', 'speech-to-text', 'embeddings', 'reranking', 'structured-decisions']) {
    const models = MODEL_CAPABILITIES.filter((model) => model.modality === category);
    assert.ok(models.length > 0, category);
    for (const model of models) {
      assert.notEqual(model.endpoint, 'openrouter-chat', model.name);
      assert.throws(() => assertCapabilityRoute(model, category, model.tierAccess[0]), /not verified/);
    }
  }
});

test('capability guard rejects mismatched modality and disallowed tiers', () => {
  const model = getModelCapability('openai/gpt-6-luna-decisions');
  assert.ok(model);
  assert.throws(() => assertCapabilityRoute(model, 'text', 'pro'), /not registered/);
  assert.throws(() => assertCapabilityRoute(model, 'structured-decisions', 'guest'), /not eligible/);
  assert.equal(getModelCapability('not-a-real-model'), null);
});
