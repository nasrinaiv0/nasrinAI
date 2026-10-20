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
import { createCloudflareWorkersAIProvider } from '../src/ai/cloudflare-workers-ai.js';
import { createCohereProvider } from '../src/ai/cohere.js';

const quiet = { info() {}, warn() {}, error() {} };

test('free provider pool enables only keyed providers with pinned models', () => {
  const config = loadConfig({
    AI_PROVIDER: 'none',
    ROUTE_LEVEL_1: 'openai:gpt-4o-mini',
    GROQ_API_KEY: 'test-groq-key',
    GROQ_MODEL: 'llama-3.3-70b-versatile',
    GROQ_FREE_MODELS: 'llama-3.3-70b-versatile,llama-3.1-8b-instant'
  });
  assert.equal(config.ai.freeProviders.length, 1);
  assert.equal(config.ai.freeProviders[0].id, 'groq');
  assert.ok(!Object.values(config.ai.routing.levels).flat().some((candidate) => candidate.provider === 'groq'), 'free-tier providers stay out of normal routing levels');
  assert.ok(config.ai.fallback.providers.includes('groq'));
  assert.ok(providerFromConfig(config, { logger: quiet }).providerIds.includes('groq'));
});

test('free model pricing requires an exact allowlist match', async () => {
  const config = loadConfig({
    AI_PROVIDER: 'none',
    ROUTE_LEVEL_1: 'groq:llama-3.3-70b-versatile',
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

  // Do not pin an unallowlisted Groq model into ROUTE_LEVEL_1 here: that would
  // test explicit operator routing, not whether the free-model allowlist is exact.
  const paidModelConfig = loadConfig({
    AI_PROVIDER: 'none',
    ROUTE_LEVEL_1: 'openai:gpt-4o-mini',
    GROQ_API_KEY: 'test-groq-key',
    GROQ_MODEL: 'llama-3.3-70b-versatile',
    GROQ_FREE_MODELS: 'another-model'
  });
  assert.equal(paidModelConfig.ai.routing.freeModels.groq.includes('llama-3.3-70b-versatile'), false);
  assert.equal(paidModelConfig.ai.routing.levels[1].some((s) => s.provider === 'groq' && s.model === 'llama-3.3-70b-versatile'), false);
});

test('free provider credentials never become available from browser-facing config fields', () => {
  const config = loadConfig({
    AI_PROVIDER: 'none',
    ROUTE_LEVEL_1: 'openai:gpt-4o-mini',
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

test('Cloudflare Workers AI adapter maps its account-scoped response', async () => {
  let calledUrl = '';
  let sentBody = null;
  const provider = createCloudflareWorkersAIProvider({
    apiKey: 'test-cloudflare-key',
    accountId: 'account-123',
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    fetchImpl: async (url, options) => {
      calledUrl = String(url);
      sentBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ result: { response: 'Cloudflare reply', usage: { prompt_tokens: 2, completion_tokens: 3 } } }), { status: 200 });
    }
  });
  const out = await provider.generate({ system: 'system', messages: [{ role: 'user', content: 'hello' }], maxTokens: 100 });
  assert.ok(calledUrl.includes('/accounts/account-123/ai/run/'));
  assert.ok(calledUrl.includes('llama-3.3-70b-instruct-fp8-fast'));
  assert.equal(sentBody.max_tokens, 100);
  assert.equal(out.text, 'Cloudflare reply');
  assert.equal(out.inputTokens, 2);
  assert.equal(out.outputTokens, 3);
});

test('Cohere v2 adapter maps text and usage without leaking its key', async () => {
  let sentHeaders = null;
  const provider = createCohereProvider({
    apiKey: 'test-cohere-key',
    model: 'command-r7b-12-2024',
    fetchImpl: async (_url, options) => {
      sentHeaders = options.headers;
      return new Response(JSON.stringify({
        message: { content: [{ type: 'text', text: 'Cohere reply' }] },
        usage: { billed_units: { input_tokens: 4, output_tokens: 5 } },
        finish_reason: 'COMPLETE'
      }), { status: 200 });
    }
  });
  const out = await provider.generate({ system: 'system', messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(sentHeaders.Authorization, 'Bearer test-cohere-key');
  assert.equal(out.text, 'Cohere reply');
  assert.equal(out.inputTokens, 4);
  assert.equal(out.outputTokens, 5);
  assert.equal(out.finishReason, 'COMPLETE');
});


test('free-only fallback mode includes only configured, explicitly free-allowlisted providers', () => {
  const config = loadConfig({
    AI_PROVIDER: 'none',
    AI_FALLBACK: 'free',
    GROQ_API_KEY: 'test-groq-key',
    CEREBRAS_API_KEY: 'test-cerebras-key',
    CEREBRAS_MODEL: 'gpt-oss-120b',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    GEMINI_API_KEY: 'test-gemini-key',
    OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30)
  });
  assert.deepEqual(config.ai.fallback.providers, ['cerebras', 'groq', 'openrouter']);
  assert.ok(!config.ai.fallback.providers.includes('openai'));
  assert.ok(!config.ai.fallback.providers.includes('gemini'));
  assert.equal(config.ai.freeProviders.find((p) => p.id === 'openrouter').model, 'openrouter/free');
  assert.ok(config.ai.freeProviders.find((p) => p.id === 'groq').freeModels.includes('openai/gpt-oss-20b'));
  assert.ok(!config.ai.freeProviders.some((p) => p.id === 'z-ai'));
});

test('free provider catalog model defaults can be overridden with explicit environment values', () => {
  const config = loadConfig({
    AI_PROVIDER: 'none',
    GROQ_API_KEY: 'test-groq-key',
    GROQ_MODEL: 'custom-free-model',
    GROQ_FREE_MODELS: 'custom-free-model'
  });
  assert.equal(config.ai.freeProviders[0].model, 'custom-free-model');
  assert.deepEqual(config.ai.freeProviders[0].freeModels, ['custom-free-model']);
});


test('free tier catalog enables Cerebras, Cloudflare and OpenRouter when credentials are configured', () => {
  const config = loadConfig({
    AI_PROVIDER: 'none',
    AI_FALLBACK: 'free',
    CEREBRAS_API_KEY: 'test-cerebras-key',
    CLOUDFLARE_WORKERS_AI_API_KEY: 'test-cloudflare-key',
    CLOUDFLARE_ACCOUNT_ID: 'test-account',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    GROQ_API_KEY: 'test-groq-key'
  });
  const providers = config.ai.freeProviders;
  assert.equal(providers.find((p) => p.id === 'cerebras').model, 'gpt-oss-120b');
  assert.equal(providers.find((p) => p.id === 'cloudflare-workers-ai').model, '@cf/meta/llama-3.1-8b-instruct');
  assert.ok(!providers.some((p) => p.id === 'z-ai'));
  assert.equal(providers.find((p) => p.id === 'openrouter').model, 'openrouter/free');
  assert.deepEqual(config.ai.fallback.providers, ['cerebras', 'cloudflare-workers-ai', 'groq', 'openrouter']);
});
