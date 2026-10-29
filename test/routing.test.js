import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/ai/classify.js';
import { answerWithLogic } from '../src/ai/logic.js';
import { createPolicy } from '../src/ai/policy.js';
import { createRouter } from '../src/ai/router.js';
import { createBudget } from '../src/ai/budget.js';
import { createProviderSpendHooks } from '../src/ai/provider-billing.js';
import { loadPrices, priceOf, costOf } from '../src/ai/pricing.js';
import { createFakeProvider } from '../src/ai/fake.js';
import { createMemoryStore } from '../src/store/memory-store.js';
import { ProviderError } from '../src/ai/provider.js';
import { HttpError } from '../src/http/errors.js';
import { loadConfig } from '../src/config.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

const quiet = { info() {}, warn() {}, error() {} };
const ENV = { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30), GEMINI_API_KEY: 'g-key' };
const PLATFORM = '00000000-0000-0000-0000-000000000001';

// A router over pretend providers: gemini (free tier, trains on data) and openai.
function setup({ env = {}, openaiFail = null, geminiFail = null, openrouterFail = null, groqFail = null, reply, liveOpenRouterModels = [] } = {}) {
  const config = loadConfig({ ...ENV, ...env });
  const gemini = createFakeProvider({ models: ['gemini-3.1-flash-lite'], dataLeavesServer: true, failWith: geminiFail, reply });
  gemini.capabilities = () => ({ local: false, dataLeavesServer: true, vision: true, pdf: false, trainsOnData: true });
  const openai = createFakeProvider({ models: ['gpt-5.4-nano'], dataLeavesServer: true, failWith: openaiFail, reply });
  const openrouter = createFakeProvider({ failWith: openrouterFail, models: [
    'nvidia/nemotron-3.5-lightning:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'deepseek/deepseek-v4.1-flash',
    'deepseek/deepseek-v4.1-flash-1017',
    'deepseek/deepseek-v4-flash-0731',
    'deepseek/deepseek-v4-flash-vision-exp',
    'z-ai/glm-5.3-flash',
    'xiaomi/mimo-v2.6-flash',
    'xiaomi/mimo-v2.6-pro',
    'openai/gpt-6-luna',
    'openai/gpt-6-luna-pro',
    'anthropic/claude-haiku-5.5',
    'qwen/qwen3.8-flash',
    'qwen/qwen3.8-27b',
    'inclusionai/ling-3.1-flash'
  ], reply });
  openrouter.listModelsForTask = async () => liveOpenRouterModels;
  const groq = createFakeProvider({ models: ['llama-3.3-70b-versatile'], dataLeavesServer: true, failWith: groqFail, reply });
  groq.capabilities = () => ({ local: false, dataLeavesServer: true, vision: false, pdf: false, tools: false, trainsOnData: true });
  // Keep provider-specific failures independently controllable for failover tests.
  const router = createRouter({ providers: { gemini, openai, openrouter, groq }, config, logger: quiet });
  const store = createMemoryStore();
  const budget = createBudget({ store, config, logger: quiet });
  const policy = createPolicy({ config, provider: router, prices: loadPrices(), budget, logger: quiet, sleep: async () => {} });
  return { config, gemini, openai, openrouter, groq, policy, store };
}
const req = (content) => ({ system: 'S', messages: [{ role: 'user', content }], attachments: [] });

test('intent classification identifies YouTube/video lookup before model routing', () => {
  for (const message of ['youtube video of mr beast', 'show me YouTube videos about NASA', 'find videos from MrBeast']) {
    const plan = classify({ message });
    assert.equal(plan.task, 'research', message);
    assert.equal(plan.level, 2, message);
    assert.ok(plan.reasons.includes('video discovery or media lookup'), message);
  }
  assert.equal(classify({ message: 'hi' }).level, 1);
});

test('logic tier: arithmetic, percentages and email checks need no model', () => {
  assert.equal(answerWithLogic('Calculate 20% of 500').text, '20% of 500 is 100.');
  assert.equal(answerWithLogic('what is (12.5 + 3) * 4?').text, '(12.5 + 3) * 4 = 62');
  assert.equal(answerWithLogic('2^10').text, '2^10 = 1,024');
  assert.match(answerWithLogic('is ana@example.com a valid email?').text, /^Yes/);
  assert.match(answerWithLogic('is ana@@x a valid email').text, /^No/);
  for (const q of ['what is love', 'calculate my taxes for 2025', '2024', 'process.exit(1)', 'what is 1/0']) assert.equal(answerWithLogic(q), null, q);
});

test('classifier: simple, moderate, complex, extreme', () => {
  assert.equal(classify({ message: 'hi!' }).level, 1);
  assert.equal(classify({ message: 'Translate "thank you for waiting" into Bisaya' }).level, 1);
  assert.equal(classify({ message: 'Write a javascript function that sorts names' }).level, 2);
  assert.equal(classify({ message: 'My python code fails with TypeError: NoneType, can you debug it?' }).level, 3);
  assert.equal(classify({ message: 'Design the authentication architecture and database schema for a multi-tenant SaaS' }).level, 4);
  assert.equal(classify({ message: 'Plan an end-to-end architecture redesign of the entire codebase' }).level, 5);
});

test('routing: compatible model; tiers cap the level; private data never goes to a free tier', async () => {
  const a = setup();
  const p = a.policy.plan({ tier: 'nasrinai', message: 'hello', history: [] });
  let run = await a.policy.run(p, req('hello'));
  assert.deepEqual([run.level, run.spec.provider, run.spec.model, run.costUsd], [1, 'gemini', 'gemini-3.1-flash-lite', null], 'free tier first');

  const hard = a.policy.plan({ tier: 'nasrinai', message: 'Design the database schema architecture for a multi-tenant app' });
  assert.equal(hard.wanted, 4);
  assert.equal(hard.level, 2, 'NasrinAI tier goes up to level 2');
  assert.equal(a.policy.plan({ tier: 'ultra', message: 'Design the database schema architecture for a multi-tenant app' }).level, 4);

  const priv = a.policy.plan({ tier: 'nasrinai', message: 'email me at ana@example.com', history: [] });
  assert.equal(priv.sensitive, true);
  run = await a.policy.run(priv, req('email me at [email]'));
  assert.equal(run.spec.provider, 'openai', 'skips the free tier that trains on data');
  assert.equal(a.gemini.calls.length, 1);
});

test('requested OpenRouter chat models are wired into paid-tier routes', () => {
  const config = loadConfig({ OPENROUTER_API_KEY: 'or-test-key', AI_PROVIDER: 'auto' });
  const paid = [2, 3, 4, 5].flatMap((level) => config.ai.routing.levels[level]);
  const requested = ['deepseek/deepseek-v4.1-flash','deepseek/deepseek-v4.1-flash-1017','deepseek/deepseek-v4-flash-0731','deepseek/deepseek-v4-flash-vision-exp','z-ai/glm-5.3-flash','xiaomi/mimo-v2.6-flash','xiaomi/mimo-v2.6-pro','openai/gpt-6-luna','openai/gpt-6-luna-pro','anthropic/claude-haiku-5.5','qwen/qwen3.8-flash','qwen/qwen3.8-27b','inclusionai/ling-3.1-flash'];
  for (const model of requested) assert.ok(paid.some((candidate) => candidate.provider === 'openrouter' && candidate.model === model), model + ' must be active in paid routes');
  assert.ok(config.ai.routing.levels[1].some((candidate) => candidate.provider === 'openrouter' && candidate.model.startsWith('nvidia/nemotron-')));
});

test('paid routing discovers newly listed OpenRouter models as bounded fallback candidates', async () => {
  const dynamicModel = 'provider/newly-listed-text-model';
  const a = setup({
    env: {
      OPENROUTER_API_KEY: 'or-test-key',
      ROUTE_LEVEL_2: 'openrouter:provider/configured-model'
    },
    liveOpenRouterModels: [dynamicModel],
    reply: async () => { throw new ProviderError('unavailable', 'model unavailable'); }
  });
  const plan = a.policy.plan({ tier: 'pro', message: 'Write a JavaScript function to sort a list of names' });
  assert.equal(plan.level, 2);
  await assert.rejects(a.policy.run(plan, req('Write a JavaScript function to sort a list of names')), (e) => e instanceof HttpError || e instanceof ProviderError);
  assert.ok(a.openrouter.calls.some((call) => call.model === dynamicModel), 'tries live-discovered model after configured candidate fails');
});

test('Guest and free Quick: simple chat is free-first; heavy work starts with GPT-6 Luna; no cross-provider fallback', async () => {
  const a = setup({ env: { OPENROUTER_API_KEY: 'or-test-key' } });
  const plan = a.policy.plan({ tier: 'nasrinai', message: 'hello' });
  const run = await a.policy.run(plan, req('hello'));
  assert.equal(run.spec.provider, 'openrouter');
  assert.match(run.spec.model, /:free$/i, 'Guest/Quick must start with an explicitly free model');
  assert.equal(a.openai.calls.length, 0);
  assert.equal(a.gemini.calls.length, 0);

  const heavyMessage = 'Analyze the architecture and debug this complex production failure';
  const down = setup({ env: { OPENROUTER_API_KEY: 'or-test-key' }, reply: async () => { throw new ProviderError('unavailable', 'model unavailable'); } });
  await assert.rejects(down.policy.run(down.policy.plan({ tier: 'nasrinai', message: heavyMessage }), req(heavyMessage)), (e) => e instanceof HttpError || e instanceof ProviderError);
  assert.ok(down.openrouter.calls.length > 0, 'tries configured OpenRouter models');
  assert.ok(down.openrouter.calls.every((call) => /:free$/i.test(call.model) || call.model === 'openai/gpt-6-luna'), 'only free models and the authorized Luna fallback are eligible');
  assert.equal(down.openrouter.calls[0].model, 'openai/gpt-6-luna', 'heavy work starts with Luna, one of the main Quick Free models');
  assert.equal(down.openrouter.calls.filter((call) => call.model === 'openai/gpt-6-luna').length, 1, 'Luna is tried once, then the free models');
  assert.ok(down.openrouter.calls.slice(1).some((call) => /:free$/i.test(call.model)), 'free models still back it up');
  assert.equal(down.openai.calls.length, 0, 'no paid OpenAI fallback for Guest/Quick');
  assert.equal(down.gemini.calls.length, 0, 'no cross-provider fallback for Guest/Quick');

  const overridden = setup({
    env: {
      OPENROUTER_API_KEY: 'or-test-key',
      ROUTE_LEVEL_1: 'openrouter:openai/gpt-6-luna-pro,openrouter:xiaomi/mimo-v2.6-pro,openrouter:nvidia/nemotron-3.5-lightning:free,openrouter:openai/gpt-6-luna,openrouter:deepseek/deepseek-v4.1-flash'
    },
    reply: async () => { throw new ProviderError('unavailable', 'model unavailable'); }
  });
  await assert.rejects(overridden.policy.run(overridden.policy.plan({ tier: 'nasrinai', message: heavyMessage }), req(heavyMessage)), (e) => e instanceof HttpError || e instanceof ProviderError);
  assert.ok(overridden.openrouter.calls.length > 0);
  assert.ok(overridden.openrouter.calls.every((call) => /:free$/i.test(call.model) || call.model === 'openai/gpt-6-luna'), 'custom routes cannot bypass free-first/Luna-only eligibility');
  assert.equal(overridden.openrouter.calls[0].model, 'openai/gpt-6-luna');
  assert.equal(overridden.openai.calls.length, 0);
  assert.equal(overridden.gemini.calls.length, 0);
});
test('Free Quick prefers OpenRouter free models before direct free-provider fallback', async () => {
  const a = setup({
    env: {
      AI_PROVIDER: 'auto',
      AI_FALLBACK: 'none',
      OPENROUTER_API_KEY: 'or-test-key',
      GROQ_API_KEY: 'groq-test-key',
      GROQ_MODEL: 'llama-3.3-70b-versatile',
      GROQ_FREE_MODELS: 'llama-3.3-70b-versatile'
    },
    openrouterFail: () => new ProviderError('unavailable', 'OpenRouter model unavailable')
  });
  const run = await a.policy.run(a.policy.plan({ tier: 'nasrinai', message: 'hello' }), req('hello'));
  assert.equal(run.spec.provider, 'groq');
  assert.equal(run.spec.model, 'llama-3.3-70b-versatile');
  assert.ok(a.openrouter.calls.length > 0, 'OpenRouter free models are attempted first');
  assert.equal(a.groq.calls.length, 1, 'allowlisted direct free provider is the fallback');
  assert.equal(a.openai.calls.length, 0, 'Quick never falls back to a paid OpenAI route');
  assert.equal(a.gemini.calls.length, 0, 'Quick never falls back to an unapproved provider route');
});

test('only Groq, Cerebras, Cloudflare Workers AI, Mistral, and NVIDIA NIM are direct Quick Free providers', () => {
  const config = loadConfig({
    AI_PROVIDER: 'auto',
    OPENROUTER_API_KEY: 'or-test-key',
    GROQ_API_KEY: 'groq-test-key',
    GROQ_MODEL: 'openai/gpt-oss-20b',
    GROQ_FREE_MODELS: 'openai/gpt-oss-20b',
    CEREBRAS_API_KEY: 'cerebras-test-key',
    CEREBRAS_MODEL: 'gpt-oss-120b',
    CEREBRAS_FREE_MODELS: 'gpt-oss-120b',
    CLOUDFLARE_WORKERS_AI_API_KEY: 'cf-test-key',
    CLOUDFLARE_WORKERS_AI_MODEL: '@cf/meta/llama-3.1-8b-instruct',
    CLOUDFLARE_WORKERS_AI_FREE_MODELS: '@cf/meta/llama-3.1-8b-instruct',
    CLOUDFLARE_ACCOUNT_ID: 'cf-account-test',
    MISTRAL_API_KEY: 'mistral-test-key',
    MISTRAL_MODEL: 'mistral-small-latest',
    MISTRAL_FREE_MODELS: 'mistral-small-latest',
    NVIDIA_NIM_API_KEY: 'nim-test-key',
    NVIDIA_NIM_MODEL: 'meta/llama-3.1-8b-instruct',
    NVIDIA_NIM_FREE_MODELS: 'meta/llama-3.1-8b-instruct',
    MODELSCOPE_API_KEY: 'other-test-key',
    MODELSCOPE_MODEL: 'some-model',
    MODELSCOPE_FREE_MODELS: 'some-model'
  });
  const allowed = ['groq', 'cerebras', 'cloudflare-workers-ai', 'mistral', 'nvidia-nim'];
  assert.deepEqual(config.ai.freeProviders.map((p) => p.id).filter((id) => id !== 'openrouter').sort(), allowed.slice().sort());
  assert.deepEqual(Object.keys(config.ai.routing.freeModels).sort(), [...allowed, 'openrouter'].sort());
  assert.ok(!config.ai.fallback.providers.some((id) => allowed.includes(id)), 'direct free providers are not generic cross-tier fallbacks');
  for (const level of [2, 3, 4, 5]) {
    assert.ok(!config.ai.routing.levels[level].some((candidate) => allowed.includes(candidate.provider)),
      'direct free providers must not be configured in paid level ' + level);
  }
});

test('paid Quick skips free OpenRouter models and uses a verified paid-Quick model', async () => {
  const paidQuickModel = 'google/gemini-2.5-flash-lite';
  const a = setup({
    env: { OPENROUTER_API_KEY: 'or-test-key', ROUTE_LEVEL_1: 'openrouter:nvidia/nemotron-3.5-lightning:free,openrouter:google/gemini-2.5-flash-lite' },
    liveOpenRouterModels: [paidQuickModel]
  });
  const plan = a.policy.plan({ tier: 'nasrinai', paidQuick: true, message: 'Hello!' });
  const run = await a.policy.run(plan, req('Hello!'));
  assert.equal(run.spec.model, paidQuickModel);
  assert.ok(a.openrouter.calls.every((call) => !/:free$/i.test(call.model)));
});

test('Guest/Quick ignore live-discovered free models outside the configured NasrinAI catalog', async () => {
  const liveFreeModel = 'deepseek/deepseek-v4.1-flash:free';
  const a = setup({
    env: { OPENROUTER_API_KEY: 'or-test-key' },
    liveOpenRouterModels: [liveFreeModel, 'openai/gpt-6-luna'],
    reply: async () => { throw new ProviderError('unavailable', 'model unavailable'); }
  });
  const heavyMessage = 'Analyze the architecture and debug this complex production failure';
  await assert.rejects(a.policy.run(a.policy.plan({ tier: 'nasrinai', message: heavyMessage }), req(heavyMessage)), (e) => e instanceof HttpError || e instanceof ProviderError);
  const attempted = a.openrouter.calls.map((call) => call.model);
  assert.ok(!attempted.includes(liveFreeModel), 'live discovery must not expand the approved Guest/Quick catalog');
  assert.ok(attempted.every((model) => /:free$/i.test(model) || model === 'openai/gpt-6-luna'), 'paid models must remain filtered except authorized Luna');
  assert.ok(attempted.some((model) => model.startsWith('nvidia/nemotron-3.5-lightning') || model.startsWith('nvidia/nemotron-3-super-120b-a12b')), 'approved catalog free routes remain eligible');
  assert.equal(a.openai.calls.length, 0);
  assert.equal(a.gemini.calls.length, 0);
});

test('Guest/Quick reject operator-configured OpenRouter models outside the approved catalog', async () => {
  const a = setup({
    env: {
      OPENROUTER_API_KEY: 'or-test-key',
      OPENROUTER_FREE_MODELS: 'deepseek/deepseek-v4.1-flash:free;openai/gpt-6-luna;xiaomi/mimo-v2.6-flash:free'
    },
    reply: async () => { throw new ProviderError('unavailable', 'model unavailable'); }
  });
  const heavyMessage = 'Analyze the architecture and debug this complex production failure';
  await assert.rejects(a.policy.run(a.policy.plan({ tier: 'nasrinai', message: heavyMessage }), req(heavyMessage)), (e) => e instanceof HttpError || e instanceof ProviderError);
  const attempted = a.openrouter.calls.map((call) => call.model);
  assert.ok(!attempted.includes('deepseek/deepseek-v4.1-flash:free'), 'operator configuration must not add unapproved free models');
  assert.ok(!attempted.includes('xiaomi/mimo-v2.6-flash:free'), 'operator configuration must not add other unapproved free models');
  assert.ok(attempted.every((model) => /:free$/i.test(model) || model === 'openai/gpt-6-luna'), 'paid IDs are ignored except authorized Luna');
  assert.ok(attempted.some((model) => model.startsWith('nvidia/nemotron-3.5-lightning') || model.startsWith('nvidia/nemotron-3-super-120b-a12b')), 'approved catalog free routes remain eligible');
});

test('Quick free routing never admits paid models when OpenRouter is not the only provider flag', async () => {
  const paidModel = 'deepseek/deepseek-v4.1-flash';
  const a = setup({
    env: {
      OPENROUTER_API_KEY: 'or-test-key',
      ROUTE_LEVEL_1: `openrouter:${paidModel},openrouter:nvidia/nemotron-3.5-lightning:free`,
      ROUTE_LEVEL_2: `openrouter:${paidModel},openrouter:nvidia/nemotron-3.5-lightning:free`,
      ROUTE_LEVEL_3: `openrouter:${paidModel},openrouter:nvidia/nemotron-3.5-lightning:free`,
      ROUTE_LEVEL_4: `openrouter:${paidModel},openrouter:nvidia/nemotron-3.5-lightning:free`,
      ROUTE_LEVEL_5: `openrouter:${paidModel},openrouter:nvidia/nemotron-3.5-lightning:free`
    },
    liveOpenRouterModels: [paidModel, 'nvidia/nemotron-3.5-lightning:free']
  });
  // Simulate a configuration where the legacy provider-presence flag is false.
  // Plan policy, not that flag, must still prevent paid IDs on free Quick.
  const config = { ...a.config, ai: { ...a.config.ai, routing: { ...a.config.ai.routing, quickNemotronOnly: false } } };
  const router = createRouter({ providers: { gemini: a.gemini, openai: a.openai, openrouter: a.openrouter, groq: a.groq }, config, logger: quiet });
  const policy = createPolicy({ config, provider: router, logger: quiet, sleep: async () => {} });
  const plan = policy.plan({ tier: 'nasrinai', paidQuick: false, message: 'Hello!' });
  const run = await policy.run(plan, req('Hello!'));
  assert.equal(run.spec.model, 'nvidia/nemotron-3.5-lightning:free');
  assert.ok(a.openrouter.calls.every((call) => /:free$/i.test(call.model)), 'free Quick must never call paid OpenRouter models');
});

test('paid tiers never use free OpenRouter models, even for simple intent', async () => {
  const paidModels = {
    pro: 'anthropic/claude-sonnet-5.5',
    max: 'openai/gpt-6-luna-pro',
    ultra: 'openai/gpt-6.1-sol-pro'
  };
  for (const tier of ['pro', 'max', 'ultra']) {
    const paidModel = paidModels[tier];
    const a = setup({
      env: {
        OPENROUTER_API_KEY: 'or-test-key',
        ROUTE_LEVEL_1: `openrouter:${paidModel},openrouter:nvidia/nemotron-3.5-lightning:free`,
        ROUTE_LEVEL_2: `openrouter:${paidModel},openrouter:nvidia/nemotron-3.5-lightning:free`,
        ROUTE_LEVEL_3: `openrouter:${paidModel},openrouter:nvidia/nemotron-3.5-lightning:free`,
        ROUTE_LEVEL_4: `openrouter:${paidModel},openrouter:nvidia/nemotron-3.5-lightning:free`,
        ROUTE_LEVEL_5: `openrouter:${paidModel},openrouter:nvidia/nemotron-3.5-lightning:free`
      },
      liveOpenRouterModels: [paidModel]
    });
    const plan = a.policy.plan({ tier, message: 'Hello!' });
    assert.equal(plan.wanted, 1, 'test input should be classified as simple intent');
    const run = await a.policy.run(plan, req('Hello!'));
    assert.equal(run.spec.provider, 'openrouter');
    assert.equal(run.spec.model, paidModel);
    assert.doesNotMatch(run.spec.model, /:free$/i, tier + ' must use a paid model even for simple intent');
    assert.ok(a.openrouter.calls.every((call) => !/:free$/i.test(call.model)), 'paid subscriptions must never try free model IDs');
  }

  const fallback = setup({
    env: {
      OPENROUTER_API_KEY: 'or-test-key',
      ROUTE_LEVEL_1: 'openrouter:nvidia/nemotron-3.5-lightning:free,openrouter:deepseek/deepseek-v4.1-flash'
    },
    liveOpenRouterModels: ['deepseek/deepseek-v4.1-flash'],
    reply: async (spec) => {
      throw new ProviderError('unavailable', spec?.model?.endsWith(':free') ? 'free model unavailable' : 'paid fallback unavailable');
    }
  });
  const fallbackPlan = fallback.policy.plan({ tier: 'pro', message: 'Hello!' });
  await assert.rejects(fallback.policy.run(fallbackPlan, req('Hello!')), (e) => e instanceof HttpError || e instanceof ProviderError);
  assert.ok(fallback.openrouter.calls.length > 0, 'the router attempts an eligible OpenRouter candidate');
  assert.ok(fallback.openrouter.calls.every((call) => !/:free$/i.test(call.model || call.modelId || '')), 'paid subscriptions must never try free model IDs');
});

test('provider-owned billing: local USD limits and spend-read failures do not gate routing', async () => {
  const limited = setup({ env: { GEMINI_API_KEY: '', MAX_REQUEST_COST_ULTRA_USD: '0.05' } });
  const plan = limited.policy.plan({ tier: 'ultra', message: 'Plan an end-to-end architecture redesign of the entire codebase' });
  assert.equal(plan.level, 5);
  const routed = await limited.policy.run(plan, req('x'));
  assert.equal(routed.level, 5, 'configured high-level model remains eligible regardless of local USD estimates');
  assert.ok(routed.spec.provider, 'a configured provider handles billing');

  const zeroDailyBudget = setup({ env: { GEMINI_API_KEY: '', DAILY_BUDGET_USD: '0' } });
  const zeroBudgetRun = await zeroDailyBudget.policy.run(
    zeroDailyBudget.policy.plan({ tier: 'pro', message: 'hello' }),
    req('hello')
  );
  assert.ok(zeroBudgetRun.spec.provider, 'provider billing is not blocked by a local USD budget');

  const unavailableSpendStore = setup({ env: { GEMINI_API_KEY: '' } });
  unavailableSpendStore.store.costSince = async () => { throw new Error('db down'); };
  const highTierPlan = unavailableSpendStore.policy.plan({
    tier: 'ultra',
    message: 'Design a scalable distributed system architecture'
  });
  const highTierRun = await unavailableSpendStore.policy.run(highTierPlan, req('x'));
  assert.equal(highTierRun.level, highTierPlan.level, 'a local spend lookup failure does not force a cheaper model');
});

test('escalation is bounded; failover respects privacy', async () => {
  let n = 0;
  const a = setup({ env: { GEMINI_API_KEY: '' }, reply: async () => (++n === 1 ? '' : 'Here is a full answer.') });
  const run = await a.policy.run(a.policy.plan({ tier: 'pro', message: 'hello' }), req('hello'));
  assert.deepEqual([run.level, run.escalated, run.result.text], [2, true, 'Here is a full answer.']);

  const always = setup({ env: { GEMINI_API_KEY: '', MAX_ESCALATION_DEPTH: '1' }, reply: async () => '' });
  const r2 = await always.policy.run(always.policy.plan({ tier: 'ultra', message: 'hello' }), req('hello'));
  assert.equal(always.openai.calls.length, 3, 'one escalation, one more model for the empty answer, then stop');
  assert.equal(r2.result.text, '');

  const down = setup({ geminiFail: 'unavailable' });
  const f = await down.policy.run(down.policy.plan({ tier: 'nasrinai', message: 'hello' }), req('hello'));
  assert.equal(f.spec.provider, 'openai', 'gemini down -> next candidate');

  const both = setup({ geminiFail: 'unavailable', openaiFail: 'unavailable' });
  await assert.rejects(both.policy.run(both.policy.plan({ tier: 'nasrinai', message: 'hello' }), req('hello')), (e) => e instanceof ProviderError);
  assert.equal(both.gemini.calls.length + both.openai.calls.length, 2, 'retries are limited');
});

test('an empty answer at the top level is retried on another model instead of failing', async () => {
  let n = 0;
  const a = setup({ env: { MAX_ESCALATION_DEPTH: '0' }, reply: async () => (++n === 1 ? '' : 'Here is a full answer.') });
  const run = await a.policy.run(a.policy.plan({ tier: 'nasrinai', message: 'hello' }), req('hello'));
  assert.equal(run.result.text, 'Here is a full answer.');
  assert.equal(n, 2, 'a second model was asked');
});

test('one brief outage does not lock people out: models on cooldown are still tried when nothing else is left', async () => {
  let down = true;
  const fail = () => (down ? new ProviderError('unavailable', 'fake outage') : null);
  const a = setup({ geminiFail: fail, openaiFail: fail });
  await assert.rejects(a.policy.run(a.policy.plan({ tier: 'nasrinai', message: 'hello' }), req('hello')), (e) => e instanceof ProviderError);
  down = false;
  const again = await a.policy.run(a.policy.plan({ tier: 'nasrinai', message: 'hello' }), req('hello'));
  assert.ok(again.result.text.length > 0, 'answered although every model had just failed');
});

test('response cache: same first public question hits; different misses; private never cached', () => {
  const a = setup();
  const plan = a.policy.plan({ tier: 'nasrinai', message: 'What is the capital of Japan?', history: [] });
  const k = a.policy.cacheKey(plan, { history: [{}], attachments: [], message: 'What is the capital of Japan?' });
  a.policy.remember(k, { text: 'Tokyo.', provider: 'gemini', model: 'x' });
  assert.equal(a.policy.cached(a.policy.cacheKey(plan, { history: [{}], attachments: [], message: 'what is the  capital of japan?' })).text, 'Tokyo.');
  assert.equal(a.policy.cached(a.policy.cacheKey(plan, { history: [{}], attachments: [], message: 'What is the capital of Korea?' })), null);
  const priv = a.policy.plan({ tier: 'nasrinai', message: 'call me at 0917 123 4567', history: [] });
  assert.equal(a.policy.cacheKey(priv, { history: [{}], attachments: [], message: 'call me at 0917 123 4567' }), null);
  assert.equal(a.policy.cacheKey(plan, { history: [{}, {}, {}], attachments: [], message: 'x' }), null, 'not mid-conversation');
});

test('pricing: from the price file; unknown models are never assumed free', () => {
  const t = loadPrices();
  assert.equal(costOf(priceOf(t, 'openai', 'gpt-5.4-nano'), { inputTokens: 1_000_000, outputTokens: 1_000_000 }), 1.45);
  assert.equal(priceOf(t, 'openai', 'gpt-9-imaginary'), null);
  assert.equal(priceOf(t, 'gemini', 'gemini-3.1-flash-lite', { freeTier: true }).output, 0);
  assert.equal(priceOf(loadPrices('{"openai":{"gpt-5.4-nano":{"input":1,"output":2}}}'), 'openai', 'gpt-5.4-nano').output, 2);
});

test('end to end: logic answers without a model; smart routing records telemetry', async () => {
  const provider = createFakeProvider({ models: ['gpt-5.4-nano'] });
  const built = buildTestApp({ provider, env: { ROUTING: 'smart', OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30) } });
  const srv = await serve(built.app);
  try {
    const m = await (await postJson(srv.url + '/v1/chat', { message: 'what is 15% of 80?' }, bearer(USER_TOKEN))).json();
    assert.equal(m.message.content, '15% of 80 is 12.');
    assert.equal(provider.calls.length, 0);
    assert.deepEqual([built.store.usage.at(-1).provider, built.store.usage.at(-1).level], ['logic', 0]);

    await postJson(srv.url + '/v1/chat', { message: 'Tell me a fun fact about the sea' }, bearer(USER_TOKEN));
    const e = built.store.usage.at(-1);
    assert.deepEqual([e.model, e.level, e.task, e.outcome], ['gpt-5.4-nano', 1, 'chat', 'ok']);
    assert.equal(provider.calls.at(-1).maxTokens, 700, 'level 1 reply allowance');
    assert.equal(e.costUsd, null, 'provider cost is unknown for this adapter response');

    await postJson(srv.url + '/v1/chat', { message: 'Tell me a fun fact about the sea' }, bearer(USER_TOKEN));
    assert.equal(built.store.usage.at(-1).cacheHit, true);
    assert.equal(provider.calls.length, 1, 'same first question answered from cache');
  } finally { await srv.close(); }
});

test('configured route and tier models remain eligible without local price metadata', async () => {
  const a = setup({ env: {
    GEMINI_API_KEY: '',
    ROUTE_LEVEL_1: 'openai:gpt-6-luna',
    TIER_NASRINAI: 'openai:gpt-6-luna'
  } });
  const plan = { tier: 'nasrinai', task: 'chat', level: 1, floor: 1, ceiling: 1, sensitive: false };
  const run = await a.policy.run(plan, req('Plan a week of meals on a budget'));
  assert.equal(run.spec.provider, 'openai');
  assert.equal(run.spec.model, 'gpt-6-luna', 'the configured tier model is used instead of a local-price-driven fallback');
  assert.equal(run.costUsd, null);
});

test('a brief outage of the only model: one retry after a short wait, then a clear failure', async () => {
  let n = 0;
  const once = setup({ env: { GEMINI_API_KEY: '', ROUTE_LEVEL_1: 'openai:gpt-5.4-nano' }, openaiFail: () => (++n === 1 ? new ProviderError('unavailable', 'blip', 503) : null) });
  const plan = { task: 'chat', level: 1, floor: 1, ceiling: 1, sensitive: false };
  const run = await once.policy.run(plan, req('hello'));
  assert.equal(run.result.text, 'You said: hello');
  assert.equal(n, 2, 'one retry');

  let m = 0;
  const down = setup({ env: { GEMINI_API_KEY: '', ROUTE_LEVEL_1: 'openai:gpt-5.4-nano' }, openaiFail: () => { m++; return new ProviderError('unavailable', 'down', 503); } });
  await assert.rejects(down.policy.run(plan, req('hello')), { kind: 'unavailable' });
  assert.equal(m, 2, 'bounded: no loop');
});


test('OpenRouter is attempted before dedicated coding providers', async () => {
  const env = {
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30),
    OPENROUTER_API_KEY: 'or-test-' + 'r'.repeat(30),
    ANTHROPIC_API_KEY: 'anthropic-test',
    GEMINI_API_KEY: '',
    ROUTE_LEVEL_3: 'openai:gpt-5.4-nano,openrouter:deepseek/deepseek-v4-flash-0731'
  };
  const config = loadConfig(env);
  const openrouter = createFakeProvider({ models: ['deepseek/deepseek-v4-flash-0731'], dataLeavesServer: true });
  openrouter.id = 'openrouter';
  openrouter.capabilities = () => ({ local: false, dataLeavesServer: true, vision: true, pdf: true, tools: true, trainsOnData: false });
  const openai = createFakeProvider({ models: ['gpt-5.4-nano'], dataLeavesServer: true });
  openai.id = 'openai';
  const anthropic = createFakeProvider({ models: ['claude-sonnet-5-5'], dataLeavesServer: true });
  anthropic.id = 'anthropic';
  anthropic.capabilities = () => ({ local: false, dataLeavesServer: true, vision: true, pdf: true, tools: false, trainsOnData: false });
  const router = createRouter({ providers: { openrouter, openai, anthropic }, config, logger: quiet });
  const store = createMemoryStore();
  const budget = createBudget({ store, config, logger: quiet });
  const policy = createPolicy({ config, provider: router, prices: loadPrices(), budget, logger: quiet, sleep: async () => {} });
  const message = 'Fix this TypeScript bug and explain the regression';
  const plan = policy.plan({ tier: 'max', message });
  const run = await policy.run(plan, req(message));
  assert.deepEqual([run.spec.provider, run.spec.model], ['openrouter', 'deepseek/deepseek-v4-flash-0731']);
  assert.equal(openrouter.calls.length, 1, 'OpenRouter gets the first model attempt');
  assert.equal(anthropic.calls.length, 0, 'dedicated coding provider is only used as fallback');
});

test('coding falls back to the dedicated tier provider when OpenRouter is unavailable', async () => {
  const env = {
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30),
    OPENROUTER_API_KEY: 'or-test-' + 'r'.repeat(30),
    ANTHROPIC_API_KEY: 'anthropic-test',
    GEMINI_API_KEY: '',
    ROUTE_LEVEL_3: 'openai:gpt-5.4-nano,openrouter:deepseek/deepseek-v4-flash-0731'
  };
  const config = loadConfig(env);
  const openrouter = createFakeProvider({
    models: ['deepseek/deepseek-v4-flash-0731'],
    dataLeavesServer: true,
    failWith: () => new ProviderError('unavailable', 'OpenRouter unavailable', 503)
  });
  openrouter.id = 'openrouter';
  openrouter.capabilities = () => ({ local: false, dataLeavesServer: true, vision: true, pdf: true, tools: true, trainsOnData: false });
  const openai = createFakeProvider({ models: ['gpt-5.4-nano'], dataLeavesServer: true });
  openai.id = 'openai';
  const anthropic = createFakeProvider({ models: ['claude-sonnet-5-5'], dataLeavesServer: true });
  anthropic.id = 'anthropic';
  anthropic.capabilities = () => ({ local: false, dataLeavesServer: true, vision: true, pdf: true, tools: false, trainsOnData: false });
  const router = createRouter({ providers: { openrouter, openai, anthropic }, config, logger: quiet });
  const store = createMemoryStore();
  const budget = createBudget({ store, config, logger: quiet });
  const policy = createPolicy({ config, provider: router, prices: loadPrices(), budget, logger: quiet, sleep: async () => {} });
  const message = 'Fix this TypeScript bug and explain the regression';
  const run = await policy.run(policy.plan({ tier: 'max', message }), req(message));
  assert.deepEqual([run.spec.provider, run.spec.model], ['openai', 'gpt-5.4-mini']);
  assert.ok(openrouter.calls.length >= 1, 'OpenRouter was attempted before fallback');
  assert.equal(openai.calls.length, 1, 'the router uses the configured compatible provider after OpenRouter fails');
  assert.equal(anthropic.calls.length, 0, 'the router fallback avoids an unnecessary second provider switch');
});

test('transient OpenRouter outage cools down the failed model so the next request falls back without another wait', async () => {
  const env = {
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30),
    OPENROUTER_API_KEY: 'or-test-' + 'r'.repeat(30),
    ANTHROPIC_API_KEY: 'anthropic-test',
    GEMINI_API_KEY: '',
    ROUTE_LEVEL_3: 'openai:gpt-5.4-nano,openrouter:deepseek/deepseek-v4-flash-0731'
  };
  const config = loadConfig(env);
  const openrouter = createFakeProvider({
    models: ['deepseek/deepseek-v4-flash-0731'],
    dataLeavesServer: true,
    failWith: () => new ProviderError('unavailable', 'OpenRouter unavailable', 503)
  });
  openrouter.id = 'openrouter';
  openrouter.capabilities = () => ({ local: false, dataLeavesServer: true, vision: true, pdf: true, tools: true, trainsOnData: false });
  const openai = createFakeProvider({ models: ['gpt-5.4-nano'], dataLeavesServer: true });
  openai.id = 'openai';
  const anthropic = createFakeProvider({ models: ['claude-sonnet-5-5'], dataLeavesServer: true });
  anthropic.id = 'anthropic';
  anthropic.capabilities = () => ({ local: false, dataLeavesServer: true, vision: true, pdf: true, tools: false, trainsOnData: false });
  const router = createRouter({ providers: { openrouter, openai, anthropic }, config, logger: quiet });
  const store = createMemoryStore();
  const budget = createBudget({ store, config, logger: quiet });
  const policy = createPolicy({ config, provider: router, prices: loadPrices(), budget, logger: quiet, sleep: async () => {}, failureCooldownMs: 30_000 });
  const message = 'Fix this TypeScript bug and explain the regression';
  const first = await policy.run(policy.plan({ tier: 'max', message }), req(message));
  assert.equal(first.spec.provider, 'openai');
  assert.equal(openrouter.calls.length, 1, 'the first request tries OpenRouter before fallback');
  const second = await policy.run(policy.plan({ tier: 'max', message }), req(message));
  assert.equal(second.spec.provider, 'openai');
  assert.equal(openrouter.calls.length, 1, 'the next request skips the temporarily unhealthy model');
  assert.equal(openai.calls.length, 2, 'fallback remains available for both requests');
});

test('Claude is isolated to Max/Ultra coding, with Opus reserved for deep Ultra work', async () => {
  const env = {
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30),
    ANTHROPIC_API_KEY: 'anthropic-test',
    GEMINI_API_KEY: ''
  };
  const config = loadConfig(env);
  assert.deepEqual(config.ai.routing.coding.max, { provider: 'anthropic', model: 'claude-sonnet-5-5', effort: null });
  assert.deepEqual(config.ai.routing.coding.ultra, { provider: 'anthropic', model: 'claude-sonnet-5-5', effort: null });
  assert.deepEqual(config.ai.routing.coding.ultraDeep, { provider: 'anthropic', model: 'claude-opus-5-5', effort: null });
  assert.ok(Object.values(config.ai.routing.levels).flat().every((s) => s.provider !== 'anthropic'));

  const anthropic = createFakeProvider({ models: ['claude-sonnet-5-5', 'claude-opus-5-5'], dataLeavesServer: true });
  anthropic.id = 'anthropic';
  anthropic.capabilities = () => ({ local: false, dataLeavesServer: true, vision: true, pdf: true, tools: false, trainsOnData: false });
  const openai = createFakeProvider({ models: ['gpt-5.4-nano', 'gpt-5.6-terra', 'gpt-6.1-sol', 'gpt-6-astra'], dataLeavesServer: true });
  const router = createRouter({ providers: { anthropic, openai }, config, logger: quiet });
  const store = createMemoryStore();
  const budget = createBudget({ store, config, logger: quiet });
  const policy = createPolicy({ config, provider: router, prices: loadPrices(), budget, logger: quiet, sleep: async () => {} });

  const quick = await policy.run(policy.plan({ tier: 'nasrinai', message: 'Write a javascript function that sorts names' }), req('Write a javascript function that sorts names'));
  assert.equal(quick.spec.provider, 'openai');

  const max = await policy.run(policy.plan({ tier: 'max', message: 'Fix this TypeScript bug and explain the regression' }), req('Fix this TypeScript bug and explain the regression'));
  assert.deepEqual([max.spec.provider, max.spec.model], ['anthropic', 'claude-sonnet-5-5']);

  const ultraModerate = await policy.run(policy.plan({ tier: 'ultra', message: 'Fix this TypeScript bug and explain the regression' }), req('Fix this TypeScript bug and explain the regression'));
  assert.deepEqual([ultraModerate.spec.provider, ultraModerate.spec.model], ['anthropic', 'claude-sonnet-5-5']);

  const ultraDeep = await policy.run(policy.plan({ tier: 'ultra', message: 'Perform an end-to-end architecture refactor of the entire codebase and migrate the authentication system' }), req('Perform an end-to-end architecture refactor of the entire codebase and migrate the authentication system'));
  assert.deepEqual([ultraDeep.spec.provider, ultraDeep.spec.model], ['anthropic', 'claude-opus-5-5']);

  const ultraNonCode = await policy.run(policy.plan({ tier: 'ultra', message: 'Write a polished announcement for our new product' }), req('Write a polished announcement for our new product'));
  assert.notEqual(ultraNonCode.spec.provider, 'anthropic');
});

test('coding answers are cached too, but only for the same person, tier and page, and never with secrets', () => {
  const a = setup();
  const deep = a.policy.plan({ tier: 'pro', message: 'My python code fails with TypeError: NoneType, can you debug it?' });
  assert.ok(deep.level >= 3, 'a level above the plain-question cache range');
  const args = (message, variant) => ({ history: [{}], attachments: [], message, variant });
  assert.ok(a.policy.cacheKey(deep, args('x', 'code|user:u1|pro|plain')), 'coding is cacheable at any level');
  assert.notEqual(a.policy.cacheKey(deep, args('x', 'code|user:u1|pro|plain')), a.policy.cacheKey(deep, args('x', 'code|user:u2|pro|plain')), 'not shared between people');
  assert.notEqual(a.policy.cacheKey(deep, args('x', 'code|user:u1|pro|plain')), a.policy.cacheKey(deep, args('x', 'code|user:u1|ultra|plain')), 'not shared between tiers');
  assert.equal(a.policy.cacheKey(deep, { ...args('x', 'v'), history: [{}, {}, {}] }), null, 'not mid-conversation');
  assert.equal(a.policy.cacheKey(deep, { ...args('x', 'v'), attachments: [{ kind: 'pdf' }] }), null, 'not with files');
  const hard = a.policy.plan({ tier: 'ultra', message: 'Design the authentication architecture and database schema for a multi-tenant SaaS' });
  assert.ok(hard.level > 2 && hard.task !== 'coding' && hard.task !== 'debugging');
  assert.equal(a.policy.cacheKey(hard, args('x', '')), null, 'other deep questions are still not cached');

  const off = setup({ env: { CACHE_CODING: 'false' } });
  const deep2 = off.policy.plan({ tier: 'pro', message: 'My python code fails with TypeError: NoneType, can you debug it?' });
  assert.equal(off.policy.cacheKey(deep2, args('x', 'v')), null, 'CACHE_CODING=false turns it off');
});

test('end to end: a repeated coding question is answered from memory, per person; secrets are never cached', async () => {
  const provider = createFakeProvider({ models: ['gpt-4o-mini', 'gpt-5-mini', 'gpt-5.4-nano', 'gpt-5.6-terra'], reply: () => `Answer ${provider.calls.length}` });
  const OTHER = 'other.user.token';
  const verifyUser = async (t) => (t === USER_TOKEN ? { id: 'user-1' } : t === OTHER ? { id: 'user-2' } : null);
  const built = buildTestApp({ provider, verifyUser, env: { ROUTING: 'smart', OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30) } });
  const srv = await serve(built.app);
  const ask = (message, token = USER_TOKEN, extra = {}) => postJson(srv.url + '/v1/chat', { message, model: 'nasrinai', blocks: true, ...extra }, bearer(token)).then((r) => r.json());
  const q = 'My python code fails with TypeError: NoneType, can you debug it?';
  try {
    const first = await ask(q);
    const calls = provider.calls.length;
    assert.equal(calls, 1);
    const again = await ask(q);
    assert.equal(provider.calls.length, calls, 'second ask came from memory');
    assert.equal(again.message.content, first.message.content);
    assert.equal(built.store.usage.at(-1).cacheHit, true);

    await ask(q, OTHER);
    assert.equal(provider.calls.length, calls + 1, 'another person gets their own answer');

    await ask(q, USER_TOKEN, { regenerate: true, conversation_id: first.conversation_id });
    assert.equal(provider.calls.length, calls + 2, 'Regenerate always asks the model again');

    const secret = q + ' OPENAI_API_KEY=sk-proj-' + 'abcdefghijklmnopqrstuvwxyz0123456789';
    await ask(secret); const n = provider.calls.length;
    await ask(secret);
    assert.equal(provider.calls.length, n + 1, 'a message with a secret is never remembered');
  } finally { await srv.close(); }
});


test('planning council is explicitly opt-in and output-token overrides are bounded', async () => {
  assert.equal(loadConfig({ ...ENV }).ai.routing.planningCouncilEnabled, false);
  assert.equal(loadConfig({ ...ENV, PLANNING_COUNCIL_ENABLED: 'true' }).ai.routing.planningCouncilEnabled, true);
  const a = setup({ env: { GEMINI_API_KEY: '' } });
  const p = a.policy.plan({ tier: 'ultra', message: 'Design a secure architecture' });
  const result = await a.policy.run(p, { ...req('Plan'), maxTokens: 128 });
  assert.equal(a.openai.calls.length, 1);
  assert.equal(a.openai.calls[0].maxTokens, 128, 'policy respects the bounded specialist output cap');
  assert.equal(result.result.text.length > 0, true);
});

test('routing excludes models already used by the planning council', async () => {
  const a = setup({ env: { GEMINI_API_KEY: '', ROUTE_LEVEL_1: 'openai:gpt-5.4-nano,openai:gpt-5.4-mini' } });
  const plan = a.policy.plan({ tier: 'ultra', message: 'hello' });
  const result = await a.policy.run(plan, { ...req('review'), excludeModels: ['openai:gpt-5.4-nano'] });
  assert.equal(result.spec.provider, 'openai');
  assert.equal(result.spec.model, 'gpt-5.4-mini');
});


test('OpenRouter model calls do not depend on local price snapshots', () => {
  const prices = loadPrices();
  assert.equal(priceOf(prices, 'openrouter', 'openai/gpt-6-luna'), null);
  assert.equal(priceOf(prices, 'openrouter', 'openrouter:openai/gpt-6-luna'), null);
  assert.equal(priceOf(prices, 'openrouter', 'openrouter:openai/not-a-real-model'), null);
});


test('provider billing records authoritative costs without local reservations', async () => {
  const config = { isProduction: true };
  const hooks = createProviderSpendHooks({ config });
  const reservation = await hooks.reserve({
    provider: 'openrouter', model: 'vendor/new-model-not-in-local-prices',
    request: { system: 'You are helpful', messages: [{ role: 'user', content: 'hello' }], maxTokens: 64 }
  });
  assert.deepEqual(reservation, { provider: 'openrouter', model: 'vendor/new-model-not-in-local-prices', providerBilling: true });
  const result = await hooks.settle(reservation, { inputTokens: 5, outputTokens: 8, actualCostUsd: 0.0017 });
  assert.equal(result.costUsd, 0.0017);
  assert.equal(result.spendReservationId, null);
  const unknown = await hooks.settle(reservation, { inputTokens: 5, outputTokens: 8 });
  assert.equal(unknown.costUsd, null, 'unknown provider cost must not be estimated locally');
});
test('classifier does not mistake a greeting prefix for the whole request', () => {
  const plan = classify({ message: 'Hi, fix the CI failure and investigate the broken build.' });
  assert.equal(plan.task, 'debugging');
  assert.ok(plan.level >= 3);
});

test('classifier routes generic troubleshooting without code keywords', () => {
  for (const message of ['Fix this bug', 'The deployment failed', 'This is not working', 'CI failed']) {
    const plan = classify({ message });
    assert.equal(plan.task, 'debugging', message);
    assert.ok(plan.level >= 3, message);
  }
});

test('classifier inherits intent for short continuation follow-ups', () => {
  const history = [
    { role: 'user', content: 'Audit the entire codebase and design a secure multi-tenant architecture.' },
    { role: 'assistant', content: 'I will break this into phases. Should I continue?' }
  ];
  const plan = classify({ message: 'Yes, continue.', history });
  assert.equal(plan.task, 'design');
  assert.equal(plan.level, 5);
  assert.ok(plan.reasons.includes('continuation inherits previous user task'));
});

test('classifier keeps a standalone greeting simple', () => {
  assert.equal(classify({ message: 'Hi!' }).level, 1);
  assert.equal(classify({ message: 'Hello.' }).level, 1);
});


test('Phase 2 runtime gate enforces registry tier, inferred-ID and endpoint eligibility', async () => {
  const { isOpenRouterChatCandidateEligible } = await import('../src/ai/openrouter-runtime-eligibility.js');
  assert.equal(isOpenRouterChatCandidateEligible({ modelId: 'nvidia/nemotron-3.5-lightning:free', tier: 'nasrinai' }), true);
  assert.equal(isOpenRouterChatCandidateEligible({ modelId: 'openai/gpt-6-luna', tier: 'nasrinai' }), true);
  assert.equal(isOpenRouterChatCandidateEligible({ modelId: 'openai/gpt-6-luna-pro', tier: 'nasrinai' }), false);
  assert.equal(isOpenRouterChatCandidateEligible({ modelId: 'openai/gpt-6-luna-pro', tier: 'max' }), true);
  assert.equal(isOpenRouterChatCandidateEligible({ modelId: 'anthropic/claude-opus-5.5', tier: 'ultra' }), false, 'inferred ID stays disabled until catalog verification');
  assert.equal(isOpenRouterChatCandidateEligible({ modelId: 'anthropic/claude-opus-5.5', tier: 'ultra', verifiedIds: ['anthropic/claude-opus-5.5'] }), true, 'live catalog verification unlocks an otherwise eligible inferred chat model');
  assert.equal(isOpenRouterChatCandidateEligible({ modelId: 'typesafe/jev-1.13', tier: 'pro', task: 'analysis' }), false, 'decision endpoint must not be called as chat');
  assert.equal(isOpenRouterChatCandidateEligible({ modelId: 'google/gemini-nano-banana-2.1', tier: 'ultra', task: 'chat' }), false, 'image endpoint must not be called as chat');
  assert.equal(isOpenRouterChatCandidateEligible({ modelId: 'openai/gpt-5.2-codex', tier: 'pro', task: 'chat' }), false, 'coding-only model must not be used for general chat');
  assert.equal(isOpenRouterChatCandidateEligible({ modelId: 'openai/gpt-5.2-codex', tier: 'pro', task: 'coding' }), false, 'inferred coding ID stays disabled until verified');
  assert.equal(isOpenRouterChatCandidateEligible({ modelId: 'provider/newly-listed-chat', tier: 'pro' }), true, 'legacy dynamic chat discovery remains supported for paid tiers');
  assert.equal(isOpenRouterChatCandidateEligible({ modelId: 'provider/newly-listed-chat', tier: 'nasrinai' }), false, 'free Quick cannot use unmarked paid IDs');
});


test('free Quick: simple chat starts free and falls back to GPT-6 Luna when every free model fails', async () => {
  const a = setup({
    env: { OPENROUTER_API_KEY: 'or-test-key' },
    reply: async (call) => {
      if (/:free$/i.test(call.model || '')) throw new ProviderError('unavailable', 'model unavailable');
      return 'ok from the paid fallback';
    }
  });
  const run = await a.policy.run(a.policy.plan({ tier: 'nasrinai', message: 'hello there' }), req('hello there'));
  const models = a.openrouter.calls.map((call) => call.model);
  assert.ok(/:free$/i.test(models[0]), 'the first model is free');
  assert.equal(models.at(-1), 'openai/gpt-6-luna', 'Luna is the backup, tried last');
  assert.ok(models.slice(0, -1).every((model) => /:free$/i.test(model)), 'nothing else paid is tried');
  assert.equal(run.spec.model, 'openai/gpt-6-luna');
});

test('free Quick uses GPT-6 Luna as a main model for heavy work, pages to scrape, web questions and files', async () => {
  const cases = [
    'Analyze the architecture and debug this complex production failure',
    'Scrape https://example.com/pricing and list every plan',
    'Extract all the product names from this site',
    "What is today's weather forecast and the latest news in Manila?"
  ];
  for (const message of cases) {
    const a = setup({ env: { OPENROUTER_API_KEY: 'or-test-key' } });
    const run = await a.policy.run(a.policy.plan({ tier: 'nasrinai', message }), req(message));
    assert.equal(run.spec.model, 'openai/gpt-6-luna', 'Luna answers first: ' + message);
  }
  const file = setup({ env: { OPENROUTER_API_KEY: 'or-test-key' } });
  const withFile = { ...req('Summarize this'), attachments: [{ kind: 'file', name: 'a.txt', mimeType: 'text/plain', text: 'text' }] };
  const run = await file.policy.run(file.policy.plan({ tier: 'nasrinai', message: 'Summarize this', attachments: withFile.attachments }), withFile);
  assert.equal(run.spec.model, 'openai/gpt-6-luna', 'files go to Luna first');
});

test('heavy free Quick falls back to the free models when Luna fails', async () => {
  const a = setup({
    env: { OPENROUTER_API_KEY: 'or-test-key' },
    reply: async (call) => { if (call.model === 'openai/gpt-6-luna') throw new ProviderError('unavailable', 'model unavailable'); return 'ok'; }
  });
  const message = 'Analyze the architecture and debug this complex production failure';
  const run = await a.policy.run(a.policy.plan({ tier: 'nasrinai', message }), req(message));
  assert.match(run.spec.model, /:free$/i);
  assert.equal(a.openrouter.calls[0].model, 'openai/gpt-6-luna');
});

test('free Quick never uses Luna while a free model answers', async () => {
  const a = setup({ env: { OPENROUTER_API_KEY: 'or-test-key' } });
  const run = await a.policy.run(a.policy.plan({ tier: 'nasrinai', message: 'hello there' }), req('hello there'));
  assert.match(run.spec.model, /:free$/i);
  assert.ok(a.openrouter.calls.every((call) => call.model !== 'openai/gpt-6-luna'));
});

test('paid Quick never uses a free model or the free tier fallback, even when every paid model fails', async () => {
  const a = setup({
    env: { OPENROUTER_API_KEY: 'or-test-key', ROUTE_LEVEL_1: 'openrouter:nvidia/nemotron-3.5-lightning:free,openrouter:google/gemini-2.5-flash-lite' },
    liveOpenRouterModels: ['google/gemini-2.5-flash-lite'],
    reply: async () => { throw new ProviderError('unavailable', 'model unavailable'); }
  });
  await assert.rejects(a.policy.run(a.policy.plan({ tier: 'nasrinai', paidQuick: true, message: 'hello there' }), req('hello there')), (e) => e instanceof HttpError || e instanceof ProviderError);
  assert.ok(a.openrouter.calls.length > 0, 'paid models were tried');
  assert.ok(a.openrouter.calls.every((call) => !/:free$/i.test(call.model) && call.model !== 'openai/gpt-6-luna'), 'no free model and no free-tier Luna for paid Quick');
});

test('free Quick gives heavy, scraping and file answers a bigger reply and history budget than simple chat', async () => {
  const a = setup({ env: { OPENROUTER_API_KEY: 'or-test-key' } });
  const simple = a.policy.plan({ tier: 'nasrinai', message: 'hello there' });
  const heavy = a.policy.plan({ tier: 'nasrinai', message: 'Scrape https://example.com/pricing and compare every plan in detail' });
  assert.ok(heavy.maxTokens > simple.maxTokens, 'longer answers for heavy work');
  assert.ok(heavy.historyChars > simple.historyChars, 'more conversation kept for heavy work');
  const paid = a.policy.plan({ tier: 'nasrinai', paidQuick: true, message: 'Scrape https://example.com/pricing and compare every plan in detail' });
  assert.ok(!paid.lunaPrimary, 'paid Quick never takes the free-tier Luna route');
  const run = await a.policy.run(heavy, req('Scrape https://example.com/pricing and compare every plan in detail'));
  assert.equal(a.openrouter.calls[0].maxTokens, heavy.maxTokens, 'the model is allowed to write that much');
  assert.ok(run.spec);
});

test('failover keeps going while eligible models remain: outages, refusals (config) and adapter bugs all move on', async () => {
  const models = ['deepseek/deepseek-v4.1-flash', 'z-ai/glm-5.3-flash', 'xiaomi/mimo-v2.6-flash', 'qwen/qwen3.8-flash', 'qwen/qwen3.8-27b'];
  const failures = {
    'deepseek/deepseek-v4.1-flash': () => new ProviderError('unavailable', 'down', 503),
    'z-ai/glm-5.3-flash': () => new ProviderError('config', 'model retired', 404),
    'xiaomi/mimo-v2.6-flash': () => new TypeError('Cannot read properties of undefined'),
    'qwen/qwen3.8-flash': () => new ProviderError('busy', 'no credits on this route', 402)
  };
  const tried = [];
  const s = setup({ env: { GEMINI_API_KEY: '', OPENROUTER_API_KEY: 'or-test-key', AI_FALLBACK: 'none', ROUTE_LEVEL_1: models.map((m) => 'openrouter:' + m).join(',') }, openrouterFail: (r) => { tried.push(r.model); return failures[r.model]?.() || null; } });
  const plan = { task: 'chat', level: 1, floor: 1, ceiling: 1, sensitive: false };
  const run = await s.policy.run(plan, req('hello'));
  assert.equal(run.result.text, 'You said: hello', 'answered although four models failed in four different ways');
  assert.deepEqual(tried, models, 'tried in order, each once');
  assert.equal(run.spec.model, 'qwen/qwen3.8-27b');
  assert.equal(new Set(tried).size, tried.length, 'no failed model is tried twice');
});

test('failover is bounded by ROUTE_MAX_FAILOVERS and never retries a refused (config) model', async () => {
  const models = ['deepseek/deepseek-v4.1-flash', 'z-ai/glm-5.3-flash', 'xiaomi/mimo-v2.6-flash', 'qwen/qwen3.8-flash', 'openai/gpt-6-luna'];
  let calls = 0;
  const refuse = () => { calls++; return new ProviderError('config', 'refused', 400); };
  const s = setup({ env: { GEMINI_API_KEY: '', OPENROUTER_API_KEY: 'or-test-key', ROUTE_MAX_FAILOVERS: '2', ROUTE_LEVEL_1: models.map((m) => 'openrouter:' + m).join(',') }, openrouterFail: refuse, openaiFail: refuse, groqFail: refuse });
  await assert.rejects(s.policy.run({ task: 'chat', level: 1, floor: 1, ceiling: 1, sensitive: false }, req('hello')), { kind: 'config' });
  assert.equal(calls, 3, '1 call + 2 failovers');

  let single = 0;
  const only = setup({ env: { GEMINI_API_KEY: '', ROUTE_LEVEL_1: 'openai:gpt-5.4-nano' }, openaiFail: () => { single++; return new ProviderError('config', 'refused', 400); } });
  await assert.rejects(only.policy.run({ task: 'chat', level: 1, floor: 1, ceiling: 1, sensitive: false }, req('hello')), { kind: 'config' });
  assert.equal(single, 1, 'a refused request is not repeated on the same model');
});

test('the person pressing Stop is never failed over', async () => {
  const controller = new AbortController();
  let calls = 0;
  const s = setup({ env: { GEMINI_API_KEY: '' }, openaiFail: () => { calls++; controller.abort(); return new ProviderError('stopped', 'stopped'); } });
  await assert.rejects(s.policy.run({ task: 'chat', level: 1, floor: 1, ceiling: 3, sensitive: false }, { ...req('hello'), signal: controller.signal }), { kind: 'stopped' });
  assert.equal(calls, 1);
});

test('routing failover settings are validated', () => {
  assert.equal(loadConfig({ ...ENV }).ai.routing.maxFailovers, 6);
  assert.equal(loadConfig({ ...ENV }).ai.routing.failoverBudgetMs, 60000);
  assert.throws(() => loadConfig({ ...ENV, ROUTE_MAX_FAILOVERS: '50' }), /ROUTE_MAX_FAILOVERS/);
});
