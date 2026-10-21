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
  assert.equal(cfg.video.tierRoutes.pro.resolution, '720p');
  assert.equal(cfg.video.tierRoutes.pro.allow4kAddon, false);
  assert.equal(cfg.video.tierRoutes.max.resolution, '1080p');
  assert.equal(cfg.video.tierRoutes.max.model, null);
  assert.equal(cfg.video.tierRoutes.ultra.resolution, '1080p');
  assert.equal(cfg.video.tierRoutes.ultra.allow4kAddon, true);
  assert.equal(cfg.video.tierRoutes.ultra.model, null);
});
