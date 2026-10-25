import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterClient } from '../src/ai/openrouter.js';
import { createOpenRouterTelemetry } from '../src/ai/openrouter-telemetry.js';

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

test('OpenRouter client emits sanitized success telemetry without prompt or completion text', async () => {
  const events = [];
  const client = createOpenRouterClient({
    apiKey: 'test-key',
    onTelemetry: (event) => events.push(event),
    fetchImpl: async (url, init) => {
      if (String(url).includes('/models?')) {
        return jsonResponse({ data: [{
          id: 'provider/model',
          architecture: { output_modalities: ['text'], input_modalities: ['text'] }
        }] });
      }
      assert.equal(init.method, 'POST');
      return jsonResponse({
        id: 'provider-request-1',
        model: 'provider/model',
        choices: [{ message: { content: 'PRIVATE_COMPLETION_SENTINEL' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, prompt_tokens_details: { cached_tokens: 4 }, completion_tokens: 8, total_tokens: 20, cost: 0.0004 }
      }, 200, { 'x-request-id': 'provider-request-1' });
    }
  });

  const result = await client.chat({
    model: 'provider/model',
    messages: [{ role: 'user', content: 'PRIVATE_PROMPT_SENTINEL' }]
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(result.choices[0].message.content, 'PRIVATE_COMPLETION_SENTINEL');
  const inference = events.find((event) => event.endpoint === '/chat/completions');
  assert.ok(inference);
  assert.equal(inference.status, 'success');
  assert.equal(inference.model, 'provider/model');
  assert.equal(inference.promptTokens, 12);
  assert.equal(inference.cachedTokens, 4);
  assert.equal(inference.completionTokens, 8);
  assert.equal(inference.totalTokens, 20);
  assert.equal(inference.totalCostUsd, 0.0004);
  assert.equal(inference.providerRequestId, 'provider-request-1');
  const serialized = JSON.stringify(inference);
  assert.equal(serialized.includes('PRIVATE_PROMPT_SENTINEL'), false);
  assert.equal(serialized.includes('PRIVATE_COMPLETION_SENTINEL'), false);
});

test('OpenRouter client emits sanitized error telemetry for provider HTTP failures', async () => {
  const events = [];
  const client = createOpenRouterClient({
    apiKey: 'test-key',
    onTelemetry: (event) => events.push(event),
    fetchImpl: async (url) => {
      if (String(url).includes('/models?')) {
        return jsonResponse({ data: [{
          id: 'provider/model',
          architecture: { output_modalities: ['text'], input_modalities: ['text'] }
        }] });
      }
      return jsonResponse({ error: { message: 'PRIVATE_PROVIDER_ERROR_SENTINEL' } }, 429);
    }
  });

  await assert.rejects(client.chat({
    model: 'provider/model',
    messages: [{ role: 'user', content: 'private prompt' }]
  }), /OpenRouter returned HTTP 429/);
  await new Promise((resolve) => setImmediate(resolve));

  const inference = events.find((event) => event.endpoint === '/chat/completions');
  assert.equal(inference.status, 'error');
  assert.equal(inference.httpStatus, 429);
  assert.equal(inference.errorCode, 'rate_limited');
  assert.equal(JSON.stringify(inference).includes('PRIVATE_PROVIDER_ERROR_SENTINEL'), false);
});

test('Supabase telemetry writer stores only summaries and never disrupts callers on database failure', async () => {
  let captured;
  const write = createOpenRouterTelemetry({
    url: 'https://project.supabase.co',
    secretKey: 'server-secret',
    logger: { warn() {} },
    fetchImpl: async (url, init) => {
      captured = { url, init, payload: JSON.parse(init.body) };
      return new Response(null, { status: 201 });
    }
  });

  await write({
    requestId: '7c1a0c17-6a9f-4f32-8e68-3a5ccf4f57ab',
    endpoint: '/chat/completions',
    method: 'POST',
    requestedModel: 'provider/model',
    model: 'provider/model',
    status: 'success',
    httpStatus: 200,
    latencyMs: 31,
    totalCostUsd: null,
    cachedTokens: 4,
    requestSummary: { message_count: 1 },
    responseSummary: { choices_count: 1 }
  });

  assert.match(captured.url, /\/rest\/v1\/openrouter_logs$/);
  assert.equal(captured.payload.total_cost_usd, null);
  assert.equal(captured.payload.cached_tokens, 4);
  assert.equal(captured.payload.status, 'success');
  assert.equal(captured.payload.request_summary.message_count, 1);
  assert.equal(captured.init.headers.Authorization, 'Bearer server-secret');

  const failing = createOpenRouterTelemetry({
    url: 'https://project.supabase.co',
    secretKey: 'server-secret',
    logger: { warn() {} },
    fetchImpl: async () => { throw new Error('database offline'); }
  });
  await assert.doesNotReject(failing({ endpoint: '/chat/completions', status: 'success' }));
});
