import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { providerFromConfig } from '../src/ai/registry.js';
import { createRouter } from '../src/ai/router.js';
import { createPolicy } from '../src/ai/policy.js';
import { createBudget } from '../src/ai/budget.js';
import { loadPrices } from '../src/ai/pricing.js';
import { createFakeProvider } from '../src/ai/fake.js';
import { createMemoryStore } from '../src/store/memory-store.js';

const quiet = { info() {}, warn() {}, error() {} };

test('free provider pool enables only keyed providers with pinned models', () => {
  const config = loadConfig({
    AI_PROVIDER: 'none',
    GROQ_API_KEY: 'test-groq-key',
    GROQ_MODEL: 'llama-3.3-70b-versatile',
    GROQ_FREE_MODELS: 'llama-3.3-70b-versatile'
  });
  assert.equal(config.ai.freeProviders.length, 1);
  assert.equal(config.ai.freeProviders[0].id, 'groq');
  assert.deepEqual(config.ai.routing.levels[1][0], {
    provider: 'groq', model: 'llama-3.3-70b-versatile', effort: null
  });
  assert.ok(config.ai.fallback.providers.includes('groq'));
  assert.ok(providerFromConfig(config, { logger: quiet }).providerIds.includes('groq'));
});

test('free model pricing requires an exact allowlist match', async () => {
  const config = loadConfig({
    AI_PROVIDER: 'none',
    GROQ_API_KEY: 'test-groq-key',
    GROQ_MODEL: 'llama-3.3-70b-versatile',
    GROQ_FREE_MODELS: 'llama-3.3-70b-versatile'
  });
  const fake = createFakeProvider({ models: ['llama-3.3-70b-versatile'] });
  fake.id = 'groq';
  fake.capabilities = () => ({ local: false, dataLeavesServer: true, vision: false, pdf: false, tools: false, trainsOnData: false });
  const router = createRouter({ providers: { groq: fake }, config, logger: quiet });
  const store = createMemoryStore();
  const budget = createBudget({ store, config, logger: quiet });
  const policy = createPolicy({ config, provider: router, prices: loadPrices(), budget, logger: quiet, sleep: async () => {} });
  const plan = policy.plan({ tier: 'nasrinai', message: 'hello', history: [] });
  const run = await policy.run(plan, { system: 'S', messages: [{ role: 'user', content: 'hello' }], attachments: [] });
  assert.equal(run.spec.provider, 'groq');
  assert.equal(run.costUsd, 0);

  const paidModelConfig = loadConfig({
    AI_PROVIDER: 'none',
    GROQ_API_KEY: 'test-groq-key',
    GROQ_MODEL: 'llama-3.3-70b-versatile',
    GROQ_FREE_MODELS: 'another-model'
  });
  assert.equal(paidModelConfig.ai.routing.freeModels.groq.includes('llama-3.3-70b-versatile'), false);
  assert.equal(paidModelConfig.ai.routing.levels[1].some((s) => s.provider === 'groq'), false);
});

test('free provider credentials never become available from browser-facing config fields', () => {
  const config = loadConfig({
    AI_PROVIDER: 'none',
    GROQ_API_KEY: 'test-groq-key',
    GROQ_MODEL: 'llama-3.3-70b-versatile',
    GROQ_FREE_MODELS: 'llama-3.3-70b-versatile'
  });
  assert.equal(JSON.stringify(config.ai.routing).includes('test-groq-key'), false);
});

test('Gemini can run as a free-only provider without an OpenAI key', () => {
  const config = loadConfig({ AI_PROVIDER: 'none', GEMINI_API_KEY: 'test-gemini-key' });
  assert.equal(config.ai.routing.mode, 'smart');
  assert.ok(config.ai.routing.levels[1].some((s) => s.provider === 'gemini'));
  assert.ok(providerFromConfig(config, { logger: quiet }).providerIds.includes('gemini'));
});
