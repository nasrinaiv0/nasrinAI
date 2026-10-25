import test from 'node:test';
import assert from 'node:assert/strict';
import { OPENROUTER_SKILL_CATALOG, prioritizeOpenRouterCandidates } from '../src/ai/openrouter-catalog.js';

test('catalog separates operator-verified provider identity from NasrinAI integration readiness', () => {
  assert.equal(OPENROUTER_SKILL_CATALOG.length, 20);
  assert.ok(OPENROUTER_SKILL_CATALOG.some((m) => m.id === 'nvidia/nemotron-3.5-lightning:free' && m.integrationStatus === 'chat-route'));
  assert.ok(OPENROUTER_SKILL_CATALOG.some((m) => m.id === 'nvidia/nemotron-3-super-120b-a12b:free' && m.integrationStatus === 'chat-route'));
  assert.ok(OPENROUTER_SKILL_CATALOG.some((m) => m.id === 'nvidia/nemotron-3-ultra-550b-a55b:free' && m.integrationStatus === 'chat-route'));
  assert.ok(OPENROUTER_SKILL_CATALOG.filter((m) => m.integrationStatus !== 'provider-alias-not-chat-model').every((m) => m.id && m.status === 'catalog-listed' && m.verificationStatus === 'not-tested'));
  assert.ok(OPENROUTER_SKILL_CATALOG.some((m) => m.id === 'google-vertex/global' && m.status === 'provider-alias'));
  assert.ok(OPENROUTER_SKILL_CATALOG.some((m) => m.id === 'qwen/qwen3.8-27b' && m.integrationStatus === 'chat-route'));
  assert.ok(OPENROUTER_SKILL_CATALOG.some((m) => m.id === 'openai/gpt-6-luna-decisions' && m.integrationStatus === 'decisions-api-required'));
  assert.ok(OPENROUTER_SKILL_CATALOG.some((m) => m.id === 'deepseek/deepseek-v4-flash-vision-exp' && m.integrationStatus === 'chat-route'));
  assert.ok(OPENROUTER_SKILL_CATALOG.some((m) => m.id === 'google-vertex/global' && m.integrationStatus === 'provider-alias-not-chat-model'));
});

test('task skills prioritize configured chat-route models before other providers', () => {
  const candidates = [
    { provider: 'openai', model: 'gpt-5-mini' },
    { provider: 'openrouter', model: 'xiaomi/mimo-v2.6-flash' },
    { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash-0731' },
    { provider: 'gemini', model: 'gemini-3.1-flash-lite' },
    { provider: 'openrouter', model: 'unverified/model' }
  ];
  const routed = prioritizeOpenRouterCandidates('coding', candidates);
  assert.equal(routed[0].model, 'deepseek/deepseek-v4-flash-0731');
  assert.equal(routed[1].model, 'xiaomi/mimo-v2.6-flash');
  assert.equal(routed[2], candidates[4]);
  assert.equal(routed[3], candidates[0]);
  assert.equal(routed[4], candidates[3]);
});

test('catalog-only decision and provider-alias entries are never prioritized as chat models', () => {
  const candidates = [
    { provider: 'openrouter', model: 'openai/gpt-6-luna-decisions' },
    { provider: 'openrouter', model: 'google-vertex/global' },
    { provider: 'openrouter', model: 'qwen/qwen3.8-27b' },
    { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash-0731' }
  ];
  const routed = prioritizeOpenRouterCandidates('coding', candidates);
  assert.equal(routed[0].model, 'deepseek/deepseek-v4-flash-0731');
  assert.equal(routed[1].model, 'qwen/qwen3.8-27b');
  assert.equal(routed[2].model, 'openai/gpt-6-luna-decisions');
  assert.equal(routed[3].model, 'google-vertex/global');
});

test('task aliases select appropriate verified general chat models', () => {
  const candidates = [
    { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash-0731' },
    { provider: 'openrouter', model: 'openai/gpt-6-luna' },
    { provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' },
    { provider: 'openai', model: 'gpt-5-mini' }
  ];
  const planning = prioritizeOpenRouterCandidates('planning', candidates);
  assert.equal(planning.length, candidates.length);
  assert.equal(planning[3], candidates[3]);
  assert.deepEqual(new Set(planning), new Set(candidates));
  assert.equal(planning[0].model, 'openai/gpt-6-luna');
  const writing = prioritizeOpenRouterCandidates('writing', candidates);
  assert.equal(writing.length, candidates.length);
  assert.deepEqual(new Set(writing), new Set(candidates));
  assert.equal(writing[0].model, 'anthropic/claude-haiku-5.5');
});
