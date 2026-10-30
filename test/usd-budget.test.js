import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { createBudget } from '../src/ai/budget.js';
import { createProviderSpendHooks } from '../src/ai/provider-billing.js';
import { ProviderError } from '../src/ai/provider.js';
import { createMemoryStore } from '../src/store/memory-store.js';
import { createPolicy } from '../src/ai/policy.js';
import { createRouter } from '../src/ai/router.js';
import { createFakeProvider } from '../src/ai/fake.js';
import { memoryLogger } from './helpers.js';

const caller = { tenantId: '00000000-0000-0000-0000-000000000001', actor: { type: 'user', id: 'u1' } };
const PROD = { NODE_ENV: 'production', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x', SUPABASE_SECRET_KEY: 'sb_secret_y', GUEST_SESSION_SECRET: 'g'.repeat(40), CRON_SECRET: 'c'.repeat(40), PRO_WEEKLY_TOKEN_LIMIT: '1000000', MAX_WEEKLY_TOKEN_LIMIT: '5000000', ULTRA_WEEKLY_TOKEN_LIMIT: '10000000' };
const LIMITS = { AI_BUDGET_DAILY_USD: '10', AI_BUDGET_WEEKLY_USD: '50', AI_BUDGET_MONTHLY_USD: '150', AI_BUDGET_REQUEST_LIMIT_ENABLED: 'false' };
const budgetConfig = (b) => ({ isProduction: true, ai: { routing: { budget: { enforced: true, requestLimitEnabled: false, maxRequestUsd: null, reserveUsd: 0.05, dailyUsd: null, weeklyUsd: null, monthlyUsd: null, ...b }, freeModels: { groq: ['free-direct-model'] } } } });

test('config: production needs the three period limits; missing never means unlimited', () => {
  assert.throws(() => loadConfig(PROD), /AI_BUDGET_DAILY_USD, AI_BUDGET_WEEKLY_USD, AI_BUDGET_MONTHLY_USD, AI_BUDGET_MAX_REQUEST_USD/);
  const ok = loadConfig({ ...PROD, ...LIMITS });
  assert.deepEqual({ ...ok.ai.routing.budget }, { enforced: true, dailyUsd: 10, weeklyUsd: 50, monthlyUsd: 150, requestLimitEnabled: false, maxRequestUsd: null, reserveUsd: 0.05 });
  assert.throws(() => loadConfig({ ...PROD, ...LIMITS, AI_BUDGET_REQUEST_LIMIT_ENABLED: 'true' }), /AI_BUDGET_MAX_REQUEST_USD/, 'the request ceiling is on by default and then needs a value');
  assert.equal(loadConfig({ ...PROD, ...LIMITS, AI_BUDGET_REQUEST_LIMIT_ENABLED: 'true', AI_BUDGET_MAX_REQUEST_USD: '0.5' }).ai.routing.budget.maxRequestUsd, 0.5);
  assert.equal(loadConfig({ ...PROD, ...LIMITS, AI_BUDGET_MAX_REQUEST_USD: '0.5' }).ai.routing.budget.maxRequestUsd, null, 'toggle off: only the request ceiling is off');
  for (const bad of ['0', '-1', 'ten', '100001']) assert.throws(() => loadConfig({ ...PROD, ...LIMITS, AI_BUDGET_DAILY_USD: bad }), /AI_BUDGET_DAILY_USD/);
  assert.throws(() => loadConfig({ ...PROD, ...LIMITS, AI_BUDGET_REQUEST_LIMIT_ENABLED: 'maybe' }), /AI_BUDGET_REQUEST_LIMIT_ENABLED/);
  assert.throws(() => loadConfig({ ...PROD, ...LIMITS, AI_BUDGET_REQUEST_LIMIT_ENABLED: 'true', AI_BUDGET_MAX_REQUEST_USD: '0.01', AI_BUDGET_RESERVE_USD: '0.05' }), /AI_BUDGET_RESERVE_USD/);
  assert.equal(loadConfig({ NODE_ENV: 'test' }).ai.routing.budget.enforced, false, 'development without limits holds nothing');
});

test('each period blocks on its own, also with the request ceiling off', async () => {
  for (const [period, limit] of [['dailyUsd', 0.12], ['weeklyUsd', 0.12], ['monthlyUsd', 0.12]]) {
    const store = createMemoryStore();
    const budget = createBudget({ store, config: budgetConfig({ [period]: limit }), logger: memoryLogger() });
    const hooks = createProviderSpendHooks({ config: budgetConfig({ [period]: limit }), budget, caller });
    const r1 = await hooks.reserve({ provider: 'openrouter', model: 'openai/gpt-6' });
    const r2 = await hooks.reserve({ provider: 'openrouter', model: 'openai/gpt-6' });
    assert.ok(r1.hold && r2.hold);
    await assert.rejects(hooks.reserve({ provider: 'openrouter', model: 'openai/gpt-6' }), { code: 'budget_reached' }, period);
  }
});

test('concurrent requests cannot overspend the shared limit', async () => {
  const store = createMemoryStore();
  const cfg = budgetConfig({ dailyUsd: 0.2 });
  const budget = createBudget({ store, config: cfg, logger: memoryLogger() });
  const hooks = createProviderSpendHooks({ config: cfg, budget, caller });
  const out = await Promise.allSettled(Array.from({ length: 10 }, () => hooks.reserve({ provider: 'openai', model: 'gpt-6' })));
  assert.equal(out.filter((x) => x.status === 'fulfilled').length, 4, 'only 4 holds of $0.05 fit in $0.20');
});

test('settle: reported cost replaces the hold; unknown cost keeps it; refused calls release; timeouts keep', async () => {
  const store = createMemoryStore();
  const cfg = budgetConfig({ dailyUsd: 0.2 });
  const budget = createBudget({ store, config: cfg, logger: memoryLogger() });
  const hooks = createProviderSpendHooks({ config: cfg, budget, caller });
  const a = await hooks.reserve({ provider: 'openai', model: 'gpt-6' });
  assert.deepEqual(await hooks.settle(a, { actualCostUsd: 0.001 }), { costUsd: 0.001, spendReservationId: a.hold.id });
  const b = await hooks.reserve({ provider: 'openai', model: 'gpt-6' });
  assert.equal((await hooks.settle(b, { text: 'ok' })).costUsd, null, 'unknown stays unknown in reports');
  const c = await hooks.reserve({ provider: 'openai', model: 'gpt-6' });
  await hooks.settle(c, null, new ProviderError('unavailable', 'down', 503));
  const d = await hooks.reserve({ provider: 'openai', model: 'gpt-6' });
  await hooks.settle(d, null, new ProviderError('timeout', 'slow'));
  // Spent now: 0.001 + 0.05 (unknown) + 0 (released) + 0.05 (timeout) = 0.101; one more hold fits, a second does not.
  await hooks.reserve({ provider: 'openai', model: 'gpt-6' });
  await assert.rejects(hooks.reserve({ provider: 'openai', model: 'gpt-6' }), { code: 'budget_reached' });
});

test('free models hold nothing; a broken ledger is "unavailable", never "limit reached"', async () => {
  const cfg = budgetConfig({ dailyUsd: 10 });
  const store = createMemoryStore();
  const budget = createBudget({ store, config: cfg, logger: memoryLogger() });
  const hooks = createProviderSpendHooks({ config: cfg, budget, caller });
  assert.equal((await hooks.reserve({ provider: 'openrouter', model: 'nvidia/x:free' })).hold, null);
  assert.equal((await hooks.reserve({ provider: 'groq', model: 'free-direct-model' })).hold, null);
  const broken = createBudget({ store: { ...store, reserveGlobalSpend: async () => { throw new Error('db down'); } }, config: cfg, logger: memoryLogger() });
  await assert.rejects(createProviderSpendHooks({ config: cfg, budget: broken, caller }).reserve({ provider: 'openai', model: 'gpt-6' }), { code: 'budget_unavailable' });
  const odd = createBudget({ store: { ...store, reserveGlobalSpend: async () => ({ allowed: false, reason: 'invalid_reservation', reservationId: null }) }, config: cfg, logger: memoryLogger() });
  await assert.rejects(createProviderSpendHooks({ config: cfg, budget: odd, caller }).reserve({ provider: 'openai', model: 'gpt-6' }), { code: 'budget_unavailable' });
});

test('policy: a paid model is not called once the daily limit is used up', async () => {
  const config = loadConfig({ NODE_ENV: 'test', AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30), ROUTING: 'smart', AI_BUDGET_DAILY_USD: '0.05', AI_BUDGET_REQUEST_LIMIT_ENABLED: 'false' });
  const store = createMemoryStore();
  const logger = memoryLogger();
  const raw = createFakeProvider({ models: ['gpt-5.4-nano'], dataLeavesServer: true, reply: () => 'answer' });
  const provider = createRouter({ providers: { openai: raw }, config, logger });
  const budget = createBudget({ store, config, logger });
  const policy = createPolicy({ config, provider, budget, logger });
  const plan = policy.plan({ tier: 'pro', message: 'Explain recursion' });
  const req = { system: 's', messages: [{ role: 'user', content: 'Explain recursion' }] };
  const first = await policy.run(plan, req, { caller });
  assert.equal(first.result.text, 'answer');
  assert.ok(first.spendReservationId, 'the paid call held budget');
  await assert.rejects(policy.run(plan, req, { caller }), { code: 'budget_reached' });
  assert.equal(raw.calls.length, 1, 'no provider call after the limit');
});
