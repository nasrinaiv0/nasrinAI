import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

// 2026-10-12 outage: ATTACHMENTS_MAX_MB above 3 in Vercel took the whole site
// down (503 not_configured). A bad optional limit now falls back with a warning.
test('a bad attachment limit uses the default and warns instead of failing start-up', () => {
  const cfg = loadConfig({ NODE_ENV: 'test', ATTACHMENTS_MAX_MB: '25', ATTACHMENTS_MAX_COUNT: 'many' });
  assert.equal(cfg.ai.attachments.maxTotalBytes, 3 * 1024 * 1024);
  assert.equal(cfg.ai.attachments.maxCount, 4);
  const w = cfg.warnings.join(' ');
  assert.match(w, /ATTACHMENTS_MAX_MB: use a whole number from 1 to 3\. Using 3\./);
  assert.match(w, /ATTACHMENTS_MAX_COUNT/);
  assert.doesNotMatch(w, /25|many/, 'the bad value is not echoed');
});

test('a valid attachment limit is kept', () => {
  const cfg = loadConfig({ NODE_ENV: 'test', ATTACHMENTS_MAX_MB: '2', ATTACHMENTS_MAX_COUNT: '6' });
  assert.equal(cfg.ai.attachments.maxTotalBytes, 2 * 1024 * 1024);
  assert.equal(cfg.ai.attachments.maxCount, 6);
});

test('Ultra and Max coding use their requested OpenRouter Sol models', () => {
  const cfg = loadConfig({
    NODE_ENV: 'test',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    CODING_MAX_MODEL: 'openrouter:openai/gpt-6-sol',
    CODING_ULTRA_MODEL: 'openrouter:openai/gpt-6.1-sol',
    CODING_ULTRA_DEEP_MODEL: 'openrouter:openai/gpt-6.1-sol'
  });
  assert.equal(cfg.ai.routing.coding.max.model, 'openai/gpt-6-sol');
  assert.equal(cfg.ai.routing.coding.ultra.model, 'openai/gpt-6.1-sol');
  assert.equal(cfg.ai.routing.coding.ultraDeep.model, 'openai/gpt-6.1-sol');
});

test('OpenRouter TTS pins the configured Google Vertex provider and requested model', () => {
  const cfg = loadConfig({
    NODE_ENV: 'test',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    SPEECH_PROVIDER: 'openrouter',
    OPENROUTER_TTS_MODEL: 'google/gemini-3.8-flash-lite-tts'
  });
  assert.equal(cfg.ai.speech.provider, 'openrouter');
  assert.equal(cfg.ai.speech.openrouterModel, 'google/gemini-3.8-flash-lite-tts');
  assert.equal(cfg.ai.speech.openrouterProvider, 'Google AI Studio');
});


test('OpenRouter video routes support Pro 720p, Max 1080p and Ultra 1080p/4K add-on with optional catalog discovery', () => {
  const disabledByDefault = loadConfig({
    NODE_ENV: 'test',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    VIDEO_PROVIDER: 'openrouter'
  });
  assert.equal(disabledByDefault.video.enabled, false, 'paid video stays opt-in until live billing reconciliation is verified');

  const cfg = loadConfig({
    NODE_ENV: 'test',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    VIDEO_PROVIDER: 'openrouter',
    VIDEO_ENABLED: 'true',
    VIDEO_PRO_WEEKLY_SECONDS: '600',
    VIDEO_MAX_WEEKLY_SECONDS: '1800',
    VIDEO_ULTRA_WEEKLY_SECONDS: '3600'
  });
  assert.equal(cfg.video.enabled, true);
  assert.deepEqual(Object.keys(cfg.video.tierRoutes), ['pro', 'max', 'ultra']);
  assert.equal(cfg.video.tierRoutes.pro.resolution, null, 'quality is selected from live provider capabilities at request time');
  assert.equal(cfg.video.tierRoutes.pro.allow4kAddon, false);
  assert.equal(cfg.video.tierRoutes.max.resolution, null, 'quality is selected from live provider capabilities at request time');
  assert.equal(cfg.video.tierRoutes.max.model, 'heygen/heygen-video-1');
  assert.equal(cfg.video.tierRoutes.ultra.resolution, null, 'quality is selected from live provider capabilities at request time');
  assert.equal(cfg.video.tierRoutes.ultra.allow4kAddon, true);
  assert.equal(cfg.video.tierRoutes.ultra.model, 'heygen/heygen-video-1');
});


test('OpenRouter image routing is enabled for every tier without local price metadata', () => {
  const cfg = loadConfig({
    NODE_ENV: 'test',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    IMAGE_TIER_1_PRIMARY_PRICE: 'unverified',
    IMAGE_TIER_2_PRIMARY_PRICE: '',
    IMAGE_TIER_3_PRIMARY_PRICE: '0',
    IMAGE_TIER_4_PRIMARY_PRICE: '999999'
  });
  assert.deepEqual(Object.keys(cfg.images.tiers), ['1', '2', '3', '4']);
  for (const tier of ['1', '2', '3', '4']) {
    assert.equal(cfg.images.tiers[tier].primary.provider, 'openrouter');
    assert.equal(cfg.images.tiers[tier].primary.model, 'openai/gpt-image-2');
  }
  assert.doesNotMatch(cfg.warnings.join(' '), /PRICE|price/i);
});

test('OpenAI direct image routing is enabled without a local price when OpenRouter and Gemini are absent', () => {
  const cfg = loadConfig({ NODE_ENV: 'test', OPENAI_API_KEY: 'sk-test-key' });
  assert.deepEqual(Object.keys(cfg.images.tiers), ['1', '2', '3', '4']);
  assert.equal(cfg.images.tiers['1'].primary.provider, 'openai');
  assert.equal(cfg.images.tiers['1'].primary.model, 'gpt-image-1');
});


test('image routing chooses a configured backup provider without price metadata', () => {
  const cfg = loadConfig({
    NODE_ENV: 'test',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    OPENAI_API_KEY: 'sk-test-key',
    IMAGE_TIER_1_PRIMARY_PRICE: 'not-verified'
  });
  for (const tier of ['1', '2', '3', '4']) {
    assert.equal(cfg.images.tiers[tier].primary.provider, 'openrouter');
    assert.equal(cfg.images.tiers[tier].fallback.provider, 'openai');
    assert.equal(cfg.images.tiers[tier].fallback.model, 'gpt-image-1');
  }
});
