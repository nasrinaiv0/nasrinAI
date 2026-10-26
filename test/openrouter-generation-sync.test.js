import test from 'node:test';
import assert from 'node:assert/strict';
import { runOpenRouterGenerationSync } from '../src/ai/openrouter-generation-sync.js';

test('OpenRouter sync discovers generation IDs from telemetry logs and stores authoritative details', async () => {
  const calls = [];
  const env = {
    OPENROUTER_API_KEY: 'inference-key-not-for-github-123456',
    SUPABASE_URL: 'https://project.example.supabase.co',
    SUPABASE_SECRET_KEY: 'supabase-service-secret-123456789'
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/rest/v1/openrouter_logs?')) {
      return {
        ok: true, status: 200,
        json: async () => [
          { openrouter_generation_id: 'gen-abc-123', provider_request_id: 'http-request-1', created_at: '2026-10-26T00:30:00.000Z' },
          { openrouter_generation_id: null, provider_request_id: 'gen-legacy-456', created_at: '2026-10-26T00:40:00.000Z' },
          { openrouter_generation_id: null, provider_request_id: 'http-request-not-a-generation', created_at: '2026-10-26T00:50:00.000Z' },
          { openrouter_generation_id: 'invalid-id', provider_request_id: null, created_at: '2026-10-26T00:55:00.000Z' }
        ]
      };
    }
    if (String(url).includes('/generation?id=')) {
      const id = new URL(String(url)).searchParams.get('id');
      return {
        ok: true, status: 200,
        json: async () => ({ data: {
          id, created_at: '2026-10-26T00:30:00.000Z',
          model: 'openai/gpt-6-luna', provider_name: 'OpenAI',
          total_cost: 0.0123, tokens_prompt: 100, tokens_completion: 25,
          native_tokens_reasoning: 5, native_tokens_cached: 10,
          generation_time: 800, latency: 900, native_finish_reason: 'stop',
          finish_reason: 'stop', prompt: 'must not be stored', completion: 'must not be stored'
        } })
      };
    }
    if (String(url).includes('/rest/v1/openrouter_generations?on_conflict=generation_id')) {
      return { ok: true, status: 201 };
    }
    throw new Error('unexpected URL: ' + url);
  };
  const result = await runOpenRouterGenerationSync({ env, fetchImpl, now: () => Date.parse('2026-10-26T01:00:00.000Z'), lookbackHours: 24 });
  assert.equal(result.source, 'openrouter_logs_and_generation_api');
  assert.equal(result.discovered, 2);
  assert.equal(result.fetched, 2);
  assert.equal(result.saved, 2);
  assert.equal(result.unavailable, 0);
  assert.equal(result.failed, 0);

  const logs = calls.find((call) => call.url.includes('/rest/v1/openrouter_logs?'));
  assert.equal(logs.options.headers.Authorization, 'Bearer ' + env.SUPABASE_SECRET_KEY);
  assert.match(logs.url, /openrouter_generation_id/);
  assert.equal(calls.some((call) => call.url.endsWith('/analytics/query')), false);
  const generation = calls.find((call) => call.url.includes('/generation?id='));
  assert.equal(generation.options.headers.Authorization, 'Bearer ' + env.OPENROUTER_API_KEY);
  const upsert = calls.find((call) => call.url.includes('/rest/v1/openrouter_generations'));
  assert.equal(upsert.options.headers.Authorization, 'Bearer ' + env.SUPABASE_SECRET_KEY);
  assert.match(upsert.options.headers.Prefer, /resolution=merge-duplicates/);
  const stored = JSON.parse(upsert.options.body);
  assert.equal(stored.length, 2);
  assert.equal(stored[0].generation_id, 'gen-abc-123');
  assert.equal(stored[0].cost_total, 0.0123);
  assert.equal(stored[0].tokens_prompt, 100);
  assert.equal(stored[0].tokens_completion, 25);
  assert.equal(stored[0].tokens_cached, 10);
  assert.equal(stored[0].generation_time_ms, 800);
  assert.equal(stored[0].latency_ms, 900);
  assert.equal(stored[0].finish_reason, 'stop');
  assert.equal(Object.hasOwn(stored[0], 'raw'), false);
  assert.equal(JSON.stringify(stored).includes('must not be stored'), false);
});

test('OpenRouter sync fails safely when Supabase log discovery is unauthorized', async () => {
  const env = {
    OPENROUTER_API_KEY: 'inference-key-not-for-github-123456',
    SUPABASE_URL: 'https://project.example.supabase.co',
    SUPABASE_SECRET_KEY: 'supabase-service-secret-123456789'
  };
  await assert.rejects(
    runOpenRouterGenerationSync({
      env,
      fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'private database detail' }),
      now: () => Date.parse('2026-10-26T01:00:00.000Z')
    }),
    (error) => error.message === 'supabase_logs_forbidden' && !error.message.includes('private database detail')
  );
});
