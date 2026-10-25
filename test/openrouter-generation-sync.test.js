import test from 'node:test';
import assert from 'node:assert/strict';
import { runOpenRouterGenerationSync } from '../src/ai/openrouter-generation-sync.js';

test('OpenRouter sync discovers generation IDs with management key and stores details with inference key', async () => {
  const calls = [];
  const env = {
    OPENROUTER_MANAGEMENT_KEY: 'management-key-not-for-generation-123456',
    OPENROUTER_API_KEY: 'inference-key-not-for-analytics-123456',
    SUPABASE_URL: 'https://project.example.supabase.co',
    SUPABASE_SECRET_KEY: 'supabase-service-secret-123456789'
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/analytics/query')) {
      return {
        ok: true, status: 200,
        json: async () => ({ data: { data: [
          { generation_id: 'gen-abc-123' },
          { dimensions: { generation_id: 'gen-abc-123' } },
          { generation_id: 'not-a-generation-id' }
        ] } })
      };
    }
    if (String(url).includes('/generation?id=')) {
      return {
        ok: true, status: 200,
        json: async () => ({ data: {
          id: 'gen-abc-123', created_at: '2026-10-26T00:00:00.000Z',
          model: 'openai/gpt-6-luna', provider_name: 'OpenAI',
          total_cost: 0.0123, tokens_prompt: 100, tokens_completion: 25,
          native_tokens_reasoning: 5, native_tokens_cached: 10,
          generation_time: 800, latency: 900, native_finish_reason: 'stop',
          prompt: 'must not be stored', completion: 'must not be stored'
        } })
      };
    }
    if (String(url).includes('/rest/v1/openrouter_generations?on_conflict=generation_id')) {
      return { ok: true, status: 201 };
    }
    throw new Error('unexpected URL');
  };
  const result = await runOpenRouterGenerationSync({ env, fetchImpl, now: () => Date.parse('2026-10-26T01:00:00.000Z'), lookbackHours: 24 });
  assert.equal(result.discovered, 1);
  assert.equal(result.fetched, 1);
  assert.equal(result.saved, 1);
  assert.equal(result.unavailable, 0);
  assert.equal(result.failed, 0);

  const analytics = calls.find((call) => call.url.endsWith('/analytics/query'));
  assert.equal(analytics.options.headers.Authorization, 'Bearer ' + env.OPENROUTER_MANAGEMENT_KEY);
  const generation = calls.find((call) => call.url.includes('/generation?id='));
  assert.equal(generation.options.headers.Authorization, 'Bearer ' + env.OPENROUTER_API_KEY);
  const upsert = calls.find((call) => call.url.includes('/rest/v1/openrouter_generations'));
  assert.equal(upsert.options.headers.Authorization, 'Bearer ' + env.SUPABASE_SECRET_KEY);
  assert.match(upsert.options.headers.Prefer, /resolution=merge-duplicates/);
  const stored = JSON.parse(upsert.options.body)[0];
  assert.equal(stored.generation_id, 'gen-abc-123');
  assert.equal(stored.cost_total, 0.0123);
  assert.equal(stored.tokens_cached, 10);
  assert.equal(stored.generation_time_ms, 800);
  assert.equal(Object.hasOwn(stored, 'raw'), false);
  assert.equal(JSON.stringify(stored).includes('must not be stored'), false);
});

test('OpenRouter sync refuses analytics authorization failure without leaking provider body', async () => {
  const env = {
    OPENROUTER_MANAGEMENT_KEY: 'management-key-not-for-generation-123456',
    OPENROUTER_API_KEY: 'inference-key-not-for-analytics-123456',
    SUPABASE_URL: 'https://project.example.supabase.co',
    SUPABASE_SECRET_KEY: 'supabase-service-secret-123456789'
  };
  await assert.rejects(
    runOpenRouterGenerationSync({
      env,
      fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'private provider detail' }),
      now: () => Date.parse('2026-10-26T01:00:00.000Z')
    }),
    (error) => error.message === 'analytics_forbidden' && !error.message.includes('private provider detail')
  );
});
