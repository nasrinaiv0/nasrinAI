#!/usr/bin/env node
/**
 * Authenticated OpenRouter endpoint verifier.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npm run verify:openrouter
 *   OPENROUTER_API_KEY=... npm run verify:openrouter -- --model deepseek/deepseek-v4-flash-0731
 *   OPENROUTER_API_KEY=... npm run verify:openrouter -- --json
 *
 * Probes every live catalog model that advertises text output by issuing a tiny
 * real /chat/completions request. This is intentionally opt-in: it incurs provider
 * requests and must not run in ordinary CI. Never prints credentials or prompts.
 */
const API = 'https://openrouter.ai/api/v1';
const key = process.env.OPENROUTER_API_KEY;
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const modelArgIndex = args.indexOf('--model');
const selectedModel = modelArgIndex >= 0 ? args[modelArgIndex + 1] : null;
const concurrency = Math.max(1, Math.min(5, Number(process.env.OPENROUTER_VERIFY_CONCURRENCY || 2)));

if (!key) {
  console.error('OPENROUTER_API_KEY is required. No requests were sent.');
  process.exit(2);
}
if (modelArgIndex >= 0 && !selectedModel) {
  console.error('--model requires a model ID.');
  process.exit(2);
}

async function request(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(45_000)
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { error: { message: 'Provider returned non-JSON response' } }; }
  return { response, data };
}

const { response: catalogResponse, data: catalogBody } = await request('/models');
if (!catalogResponse.ok || !Array.isArray(catalogBody.data)) {
  console.error(`OpenRouter catalog request failed with HTTP ${catalogResponse.status}; no models were tested.`);
  process.exit(1);
}
let models = catalogBody.data.filter((model) => typeof model.id === 'string');
if (selectedModel) models = models.filter((model) => model.id === selectedModel);
if (selectedModel && !models.length) {
  console.error(`Model ID is not present in the live OpenRouter catalog: ${selectedModel}`);
  process.exit(1);
}

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < models.length) {
    const model = models[cursor++];
    const inputs = model.architecture?.input_modalities || [];
    const outputs = model.architecture?.output_modalities || [];
    const record = {
      id: model.id,
      catalogListed: true,
      inputModalities: inputs,
      outputModalities: outputs,
      supportedParameters: model.supported_parameters || [],
      endpoint: null,
      status: 'not-tested',
      verifiedAt: new Date().toISOString(),
      returnedModelId: null,
      usage: null,
      latencyMs: null,
      error: null
    };
    // The model catalog does not tell us a valid payload for image/video/audio
    // generation, transcription, embeddings, reranking or decisions endpoints.
    // Never send a chat payload to those specialized endpoints and call it a test.
    if (!outputs.includes('text')) {
      record.status = 'catalog-listed-specialized-endpoint-not-probed';
      results.push(record);
      continue;
    }
    record.endpoint = '/chat/completions';
    const started = Date.now();
    try {
      const { response, data } = await request('/chat/completions', {
        model: model.id,
        messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
        max_tokens: 8,
        stream: false
      });
      record.latencyMs = Date.now() - started;
      if (!response.ok) {
        record.status = response.status === 401 || response.status === 403 ? 'access-denied'
          : response.status === 402 || response.status === 429 ? 'quota-or-rate-limited'
            : response.status === 404 ? 'endpoint-unavailable' : 'request-failed';
        record.error = { httpStatus: response.status, code: data.error?.code || null, message: String(data.error?.message || 'Provider request failed').slice(0, 240) };
      } else {
        const choice = data.choices?.[0];
        const content = choice?.message?.content;
        if (typeof content !== 'string' || !content.trim()) {
          record.status = 'invalid-response';
          record.error = { message: 'HTTP success without non-empty text content' };
        } else {
          record.status = 'verified';
          record.returnedModelId = data.model || null;
          record.usage = data.usage && {
            promptTokens: data.usage.prompt_tokens ?? null,
            completionTokens: data.usage.completion_tokens ?? null,
            totalTokens: data.usage.total_tokens ?? null,
            cost: data.usage.cost ?? null
          };
        }
      }
    } catch (error) {
      record.status = 'request-error';
      record.latencyMs = Date.now() - started;
      record.error = { message: String(error?.name === 'TimeoutError' ? 'Request timed out' : error?.message || 'Network request failed').slice(0, 240) };
    }
    results.push(record);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, models.length) }, worker));
results.sort((a, b) => a.id.localeCompare(b.id));
const counts = results.reduce((acc, result) => { acc[result.status] = (acc[result.status] || 0) + 1; return acc; }, {});
const report = { generatedAt: new Date().toISOString(), catalogCount: catalogBody.data.length, selectedCount: results.length, counts, results };
if (jsonOutput) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`OpenRouter verification: ${results.length} model(s); live catalog contains ${catalogBody.data.length}.`);
  for (const result of results) console.log(`${result.status.padEnd(42)} ${result.id}${result.error ? ` — ${result.error.message}` : ''}`);
  console.log('Summary:', JSON.stringify(counts));
  console.log('Note: specialized non-text endpoints are identified but not verified by this chat-completion probe.');
}
if (results.some((result) => !['verified', 'catalog-listed-specialized-endpoint-not-probed'].includes(result.status))) process.exitCode = 1;
