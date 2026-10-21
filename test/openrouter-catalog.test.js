import test from 'node:test';
import assert from 'node:assert/strict';
import { OPENROUTER_SKILL_CATALOG, prioritizeOpenRouterCandidates } from '../src/ai/openrouter-catalog.js';

test('OpenRouter skill catalog records the requested model names and fails closed for unverified IDs', () => {
  assert.equal(OPENROUTER_SKILL_CATALOG.length, 17);
  assert.ok(OPENROUTER_SKILL_CATALOG.some((m) => m.id === 'deepseek/deepseek-v4-flash-0731' && m.status === 'verified'));
  assert.ok(OPENROUTER_SKILL_CATALOG.filter((m) => m.status === 'unverified_exact_id').every((m) => m.id === null));
  assert.ok(OPENROUTER_SKILL_CATALOG.filter((m) => m.status === 'operator_supplied_unverified').every((m) => m.id && m.status !== 'verified'));
  assert.ok(OPENROUTER_SKILL_CATALOG.some((m) => m.id === 'qwen/qwen3.8-27b' && m.status === 'operator_supplied_unverified'), 'high-output-cost model remains excluded from verified low-cost routes');
  assert.ok(!OPENROUTER_SKILL_CATALOG.some((m) => m.id === 'qwen/qwen3.8-27b' && m.status === 'verified'), 'operator-supplied ID must not become eligible before verification');
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

test('operator-supplied unverified models are recorded but never promoted by the skill router', () => {
  const candidates = [
    { provider: 'openrouter', model: 'qwen/qwen3.8-27b' },
    { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash-0731' }
  ];
  const routed = prioritizeOpenRouterCandidates('coding', candidates);
  assert.equal(routed[0].model, 'qwen/qwen3.8-27b', 'unverified candidate keeps its configured slot');
  assert.equal(routed[1].model, 'deepseek/deepseek-v4-flash-0731');
});

test('classifier task aliases prioritize relevant verified models without adding or duplicating calls', () => {
  const candidates = [
    { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash-0731' },
    { provider: 'openrouter', model: 'openai/gpt-6-luna' },
    { provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' },
    { provider: 'openai', model: 'gpt-5-mini' }
  ];
  const planning = prioritizeOpenRouterCandidates('planning', candidates);
  assert.equal(planning.length, candidates.length);
  assert.equal(planning[3], candidates[3], 'non-OpenRouter order and identity remain unchanged');
  assert.deepEqual(new Set(planning), new Set(candidates), 'ranking must neither add nor remove candidates');
  assert.equal(planning[0].model, 'openai/gpt-6-luna', 'planning should rank a verified general chat model ahead of coding-only candidates');
  const writing = prioritizeOpenRouterCandidates('writing', candidates);
  assert.equal(writing.length, candidates.length);
  assert.deepEqual(new Set(writing), new Set(candidates));
  assert.equal(writing[0].model, 'anthropic/claude-haiku-5.5', 'writing aliases should prefer a verified writing-capable model');
});
