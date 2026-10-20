import test from 'node:test';
import assert from 'node:assert/strict';
import { OPENROUTER_SKILL_CATALOG, prioritizeOpenRouterCandidates } from '../src/ai/openrouter-catalog.js';

test('OpenRouter skill catalog records the requested model names and fails closed for unverified IDs', () => {
  assert.equal(OPENROUTER_SKILL_CATALOG.length, 17);
  assert.ok(OPENROUTER_SKILL_CATALOG.some((m) => m.id === 'deepseek/deepseek-v4-flash-0731' && m.status === 'verified'));
  assert.ok(OPENROUTER_SKILL_CATALOG.filter((m) => m.status === 'unverified_exact_id').every((m) => m.id === null));
  assert.ok(OPENROUTER_SKILL_CATALOG.filter((m) => m.status === 'operator_supplied_unverified').every((m) => m.id && m.status !== 'verified'));
  assert.ok(!OPENROUTER_SKILL_CATALOG.some((m) => m.id === 'openai/gpt-6-luna' && m.status === 'verified'), 'operator-supplied IDs must not become eligible before verification');
});

test('task skills prioritize matching configured OpenRouter models without moving non-OpenRouter candidates', () => {
  const candidates = [
    { provider: 'openai', model: 'gpt-5-mini' },
    { provider: 'openrouter', model: 'xiaomi/mimo-v2.6-flash' },
    { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash-0731' },
    { provider: 'gemini', model: 'gemini-3.1-flash-lite' },
    { provider: 'openrouter', model: 'unverified/model' }
  ];
  const routed = prioritizeOpenRouterCandidates('coding', candidates);
  assert.equal(routed[0], candidates[0]);
  assert.equal(routed[3], candidates[3]);
  assert.equal(routed[4], candidates[4]);
  assert.equal(routed[1].model, 'deepseek/deepseek-v4-flash-0731');
  assert.equal(routed[2].model, 'xiaomi/mimo-v2.6-flash');
});
