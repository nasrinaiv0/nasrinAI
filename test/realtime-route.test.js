import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, serve, bearer, postJson } from './helpers.js';
import { createFakeProvider } from '../src/ai/fake.js';

const geminiRealtime = {
  async session(opts) {
    return { value: 'ephemeral-test', expiresAt: 123, model: opts.model, voice: opts.voice, maxSeconds: opts.maxSeconds };
  }
};

test('realtime session follows the selected NasrinAI tier and never accepts a raw model id', async () => {
  const built = buildTestApp({
    provider: createFakeProvider({ models: ['gpt-4o-mini', 'gpt-5-mini', 'gpt-5', 'gpt-5.4-nano', 'gpt-realtime-2.1-mini', 'gpt-realtime-2.1'], reply: () => 'ok' }),
    geminiRealtime,
    env: { GEMINI_API_KEY: 'test-gemini-key', DAILY_BUDGET_USD: '3', WEEKLY_BUDGET_USD: '5', MONTHLY_BUDGET_USD: '10' }
  });
  const srv = await serve(built.app);
  try {
    const token = (await (await fetch(srv.url + '/v1/guest/sessions', { method: 'POST' })).json()).token;
    const quick = await (await postJson(srv.url + '/v1/realtime/session', { model: 'nasrinai', voice: 'coral' }, bearer(token))).json();
    assert.equal(quick.tier, 'nasrinai');
    assert.equal(quick.model, 'gemini-3.8-live');
    assert.equal(quick.effort, 'low');

    const pro = await postJson(srv.url + '/v1/realtime/session', { model: 'pro', voice: 'coral' }, bearer(token));
    assert.equal(pro.status, 400, 'Pro realtime is not offered to guest sessions');

    const raw = await postJson(srv.url + '/v1/realtime/session', { model: 'gpt-realtime-2.1', voice: 'coral' }, bearer(token));
    assert.equal(raw.status, 400);
  } finally {
    await srv.close();
  }
});


test('realtime session refuses to mint credentials when its maximum-duration reservation exceeds the shared budget', async () => {
  let calls = 0;
  const built = buildTestApp({
    provider: createFakeProvider({ models: ['gpt-realtime-2.1-mini'], reply: () => 'ok' }),
    geminiRealtime: { async session() { calls++; return { value: 'must-not-escape' }; } },
    env: { GEMINI_API_KEY: 'test-gemini-key', DAILY_BUDGET_USD: '0.05', WEEKLY_BUDGET_USD: '0.1', MONTHLY_BUDGET_USD: '0.2' }
  });
  const srv = await serve(built.app);
  try {
    const token = (await (await fetch(srv.url + '/v1/guest/sessions', { method: 'POST' })).json()).token;
    const response = await postJson(srv.url + '/v1/realtime/session', { model: 'nasrinai', voice: 'coral' }, bearer(token));
    assert.equal(response.status, 503);
    assert.notEqual(response.status, 200, 'a budget too small for the conservative Gemini session reservation must refuse the session');
    assert.equal(calls, 0, 'provider credentials must not be minted before a reservation succeeds');
  } finally {
    await srv.close();
  }
});


test('default global budgets permit Quick realtime up to its five-minute daily allowance', async () => {
  let receivedOptions;
  const built = buildTestApp({
    provider: createFakeProvider({ models: ['gpt-realtime-2.1-mini'], reply: () => 'ok' }),
    geminiRealtime: { async session(opts) { receivedOptions = opts; return { value: 'ephemeral-test', model: opts.model, maxSeconds: opts.maxSeconds }; } },
    env: { GEMINI_API_KEY: 'test-gemini-key' }
  });
  const srv = await serve(built.app);
  try {
    const token = (await (await fetch(srv.url + '/v1/guest/sessions', { method: 'POST' })).json()).token;
    const response = await postJson(srv.url + '/v1/realtime/session', { model: 'nasrinai', voice: 'coral' }, bearer(token));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(receivedOptions.maxSeconds, 300);
    assert.equal(body.max_seconds, 300);
    assert.ok(0.06 * (body.max_seconds / 60) <= 3, 'reservation fits the configured $3 default daily ceiling');
  } finally {
    await srv.close();
  }
});


test('Quick realtime allowance is cumulative across repeated sessions and blocks after exhaustion', async () => {
  let calls = 0;
  const built = buildTestApp({
    provider: createFakeProvider({ models: ['gpt-realtime-2.1-mini'], reply: () => 'ok' }),
    geminiRealtime: { async session(opts) { calls++; return { value: 'ephemeral-test', model: opts.model, maxSeconds: opts.maxSeconds }; } },
    env: { GEMINI_API_KEY: 'test-gemini-key' }
  });
  const srv = await serve(built.app);
  try {
    const token = (await (await fetch(srv.url + '/v1/guest/sessions', { method: 'POST' })).json()).token;
    const first = await postJson(srv.url + '/v1/realtime/session', { model: 'nasrinai', voice: 'coral' }, bearer(token));
    assert.equal(first.status, 200);
    assert.equal((await first.json()).max_seconds, 300);

    const second = await postJson(srv.url + '/v1/realtime/session', { model: 'nasrinai', voice: 'coral' }, bearer(token));
    assert.equal(second.status, 429);
    assert.equal((await second.json()).error.code, 'daily_voice_limit');
    assert.equal(calls, 1, 'provider credential must not be minted after the allowance is exhausted');
  } finally {
    await srv.close();
  }
});


test('realtime voice ignores the legacy guest token quota while retaining shared reservation checks', async () => {
  let calls = 0;
  const built = buildTestApp({
    provider: createFakeProvider({ models: ['gpt-realtime-2.1-mini'], reply: () => 'ok' }),
    geminiRealtime: { async session() { calls++; return { value: 'must-not-escape' }; } },
    env: { GEMINI_API_KEY: 'test-gemini-key', GUEST_DAILY_TOKEN_CEILING: '10000' }
  });
  const srv = await serve(built.app);
  try {
    const token = (await (await fetch(srv.url + '/v1/guest/sessions', { method: 'POST' })).json()).token;
    const response = await postJson(srv.url + '/v1/realtime/session', { model: 'nasrinai', voice: 'coral' }, bearer(token));
    assert.equal(response.status, 200, 'the legacy guest token ceiling must not block realtime by itself');
    assert.equal(calls, 1, 'realtime session is created when shared tenant and voice reservations allow it');
  } finally {
    await srv.close();
  }
});
