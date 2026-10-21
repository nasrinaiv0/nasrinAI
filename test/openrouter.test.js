import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterClient, createOpenRouterProvider, createOpenRouterVideoProvider, OPENROUTER_TASK_ENDPOINTS, OPENROUTER_TASK_MODALITIES } from '../src/ai/openrouter.js';

function response(body, status = 200, type = 'application/json') {
  return new Response(type === 'application/json' ? JSON.stringify(body) : body, { status, headers: { 'content-type': type } });
}
const model = (id, modality = 'text', pricing = { prompt: '0.000001', completion: '0.000002' }) => ({
  id, name: id, architecture: { output_modalities: [modality], input_modalities: ['text'] }, pricing,
  ...(modality === 'video' ? { supported_durations: [4, 6, 8], supported_resolutions: ['720p'], supported_aspect_ratios: ['16:9'], generate_audio: true, pricing_skus: [{ unit: 'second', cost_usd: 0.12 }] } : {})
});

test('OpenRouter routes tasks to modality-specific endpoints', () => {
  assert.equal(OPENROUTER_TASK_ENDPOINTS.image, '/images');
  assert.equal(OPENROUTER_TASK_ENDPOINTS.video, '/videos');
  assert.equal(OPENROUTER_TASK_ENDPOINTS.speech, '/audio/speech');
  assert.equal(OPENROUTER_TASK_ENDPOINTS.transcription, '/audio/transcriptions');
  assert.equal(OPENROUTER_TASK_ENDPOINTS.embeddings, '/embeddings');
  assert.equal(OPENROUTER_TASK_MODALITIES.decisions, 'decisions');
});

test('catalog selection validates actual output modality and caches catalog', async () => {
  let calls = 0;
  const client = createOpenRouterClient({ apiKey: 'test-key', fetchImpl: async () => {
    calls++; return response({ data: [model('provider/chat'), model('provider/picture', 'image'), model('provider/video', 'video')] });
  } });
  assert.equal((await client.selectModel('image', ['provider/chat', 'provider/picture'])).id, 'provider/picture');
  assert.equal((await client.selectModel('video', ['provider/video'])).id, 'provider/video');
  // Image and video use their dedicated catalog endpoints; text-model catalog caching is separate.
  assert.equal(calls, 2);
});

test('video pricing is looked up from the live catalog SKU map', async () => {
  const client = createOpenRouterClient({ apiKey: 'test-key', fetchImpl: async () => response({ data: [{
    ...model('provider/video', 'video'), supported_durations: [4, 8], supported_resolutions: ['720p'],
    supported_aspect_ratios: ['16:9'], generate_audio: true, pricing_skus: { generate: { unit: 'USD/second', cost_usd: '0.09' } }
  }] }) });
  const pricing = await client.getVideoPricing({ model: 'provider/video', resolution: '720p', duration: 8, aspectRatio: '16:9' });
  assert.equal(pricing.costPerSecondUsd, 0.09);
  assert.equal(pricing.source, 'openrouter-live-catalog');
});

test('video auto-routing selects only priced compatible models per tier', async () => {
  const catalog = [
    { ...model('provider/cheap-video', 'video'), pricing_skus: [{ unit: 'USD/second', cost_usd: 0.03 }] },
    { ...model('provider/premium-video', 'video'), pricing_skus: [{ unit: 'USD/second', cost_usd: 0.18 }] },
    { ...model('provider/unpriced-video', 'video'), pricing_skus: [{ unit: 'job', cost_usd: 0.50 }] },
    { ...model('provider/no-audio-video', 'video'), generate_audio: false, pricing_skus: [{ unit: 'USD/second', cost_usd: 0.01 }] }
  ];
  const client = createOpenRouterClient({ apiKey: 'test-key', fetchImpl: async () => response({ data: catalog }) });
  const common = { resolution: '720p', duration: 8, aspectRatio: '16:9', generateAudio: true };
  const max = await client.getVideoPricing({ ...common, tier: 'max' });
  const ultra = await client.getVideoPricing({ ...common, tier: 'ultra' });
  assert.equal(max.model, 'provider/cheap-video');
  assert.equal(max.costPerSecondUsd, 0.03);
  assert.equal(ultra.model, 'provider/premium-video');
  assert.equal(ultra.costPerSecondUsd, 0.18);
});

test('OpenRouter default generate SKU is treated as the documented per-second video rate', async () => {
  const client = createOpenRouterClient({ apiKey: 'test-key', fetchImpl: async () => response({ data: [{
    ...model('provider/default-video', 'video'),
    supported_durations: [4, 8], supported_resolutions: ['720p'], supported_aspect_ratios: ['16:9'],
    pricing_skus: { generate: '0.07' }
  }] }) });
  const pricing = await client.getVideoPricing({ model: 'provider/default-video', resolution: '720p', duration: 8, aspectRatio: '16:9' });
  assert.equal(pricing.costPerSecondUsd, 0.07);
});

test('specialized tasks fail closed when no model is verified', async () => {
  const client = createOpenRouterClient({ apiKey: 'test-key', fetchImpl: async () => response({ data: [model('provider/chat')] }) });
  await assert.rejects(client.selectModel('image'), /No verified OpenRouter model/);
});

test('model IDs and endpoint origins are strictly validated', async () => {
  const client = createOpenRouterClient({ apiKey: 'test-key', fetchImpl: async () => response({ data: [] }) });
  await assert.rejects(client.chat({ model: 'https://attacker.invalid/x', messages: [{ role: 'user', content: 'x' }] }), /model ID is invalid/);
  assert.throws(() => createOpenRouterClient({ apiKey: 'x', baseUrl: 'https://attacker.invalid/api/v1' }), /official HTTPS/);
});

test('chat requests enforce bounded token limits and privacy provider policy', async () => {
  let sent;
  const client = createOpenRouterClient({ apiKey: 'secret', fetchImpl: async (url, init) => {
    if (String(url).endsWith('/models?output_modalities=all')) return response({ data: [model('provider/model')] });
    sent = { url: String(url), body: JSON.parse(init.body), headers: init.headers };
    return response({ choices: [{ message: { content: 'ok' } }] });
  } });
  await client.chat({ model: 'provider/model', messages: [{ role: 'user', content: 'hello' }], maxTokens: 999999, provider: { data_collection: 'allow' } });
  assert.match(sent.url, /chat\/completions$/);
  assert.equal(sent.body.max_tokens, 32768);
  assert.equal(sent.body.provider.data_collection, 'deny');
  assert.equal(sent.headers.Authorization, 'Bearer secret');
});

test('video job IDs are encoded and bounded', async () => {
  let sentUrl;
  const client = createOpenRouterClient({ apiKey: 'secret', fetchImpl: async (url) => { sentUrl = String(url); return response({ status: 'pending' }); } });
  await client.videoStatus('job_abc-123');
  assert.match(sentUrl, /\/videos\/job_abc-123$/);
  await assert.rejects(client.videoStatus('../secrets'), /Invalid video job ID/);
});

test('speech and transcription use dedicated endpoints and bounded input', async () => {
  const seen = [];
  const client = createOpenRouterClient({ apiKey: 'secret', fetchImpl: async (url, init) => {
    if (String(url).endsWith('/models?output_modalities=all')) return response({ data: [model('provider/speech', 'speech'), model('provider/stt', 'transcription')] });
    seen.push({ url: String(url), body: init.body });
    return String(url).endsWith('/audio/speech') ? response('mp3', 200, 'audio/mpeg') : response({ text: 'hello' });
  } });
  const audio = await client.speak({ model: 'provider/speech', input: 'Hello', voice: 'coral' });
  assert.equal(Buffer.from(audio).toString(), 'mp3');
  const transcript = await client.transcribe({ model: 'provider/stt', file: new Uint8Array([1, 2, 3]) });
  assert.equal(transcript.text, 'hello');
  assert.match(seen[0].url, /audio\/speech$/);
  assert.match(seen[1].url, /audio\/transcriptions$/);
});

test('decision models use the structured Decisions API, not chat completions', async () => {
  let sent;
  const client = createOpenRouterClient({ apiKey: 'secret', fetchImpl: async (url, init) => {
    if (String(url).endsWith('/models?output_modalities=all')) return response({ data: [model('typesafe/jev-1.13', 'text')] });
    sent = { url: String(url), body: JSON.parse(init.body) };
    return response({ answers: { route: { type: 'choice', choice: 'coding', confidence: 0.99 } } });
  } });
  const result = await client.decide({ model: 'typesafe/jev-1.13', state: { prompt: 'Fix a TypeScript bug' },
    questions: { route: { type: 'choice', instructions: 'Choose a task', criteria: { coding: 'Code work', writing: 'Prose work' } } } });
  assert.match(sent.url, /\/api\/alpha\/decisions$/);
  assert.equal(sent.body.questions.route.type, 'choice');
  assert.equal(result.answers.route.choice, 'coding');
  await assert.rejects(client.chat({ task: 'decisions', model: 'typesafe/jev-1.13', messages: [{ role: 'user', content: 'x' }] }), /require decide/);
});

test('image and video model discovery use dedicated catalogs and reject unsupported video settings', async () => {
  const urls = [];
  const requests = [];
  const videoModel = model('provider/video-maker', 'video');
  const client = createOpenRouterClient({ apiKey: 'secret', fetchImpl: async (url, init) => {
    urls.push(String(url));
    if (String(url).endsWith('/images/models')) return response({ data: [
      { id: 'provider/vision-only', architecture: { output_modalities: ['text'], input_modalities: ['image'] } },
      { id: 'provider/image-maker', architecture: { output_modalities: ['image'], input_modalities: ['text'] } }
    ] });
    if (String(url).endsWith('/videos/models')) return response({ data: [videoModel] });
    if (String(url).endsWith('/videos')) { requests.push(JSON.parse(init.body)); return response({ id: 'job-abc123', status: 'pending' }, 202); }
    return response({ data: [] });
  } });
  assert.equal((await client.selectModel('image', ['provider/image-maker'])).id, 'provider/image-maker');
  assert.equal((await client.selectModel('video', ['provider/video-maker'])).id, 'provider/video-maker');
  await client.createVideo({ model: 'provider/video-maker', prompt: 'A calm lake', duration: 8, resolution: '720p', aspect_ratio: '16:9', maxCostPerSecondUsd: 0.12 });
  assert.equal(requests[0].duration, 8);
  await assert.rejects(client.createVideo({ model: 'provider/video-maker', prompt: 'Unsupported duration', duration: 5, resolution: '720p', aspect_ratio: '16:9', maxCostPerSecondUsd: 0.12 }), /does not advertise the requested duration/);
  await assert.rejects(client.createVideo({ model: 'provider/video-maker', prompt: 'Underbudget', duration: 8, resolution: '720p', aspect_ratio: '16:9', maxCostPerSecondUsd: 0.01 }), /below the live catalog rate/);
  assert.ok(urls.some((url) => url.endsWith('/images/models')));
  assert.ok(urls.some((url) => url.endsWith('/videos/models')));
});


test('OpenRouter video adapter looks up live catalog pricing and pins model and duration', async () => {
  const calls = [];
  const client = {
    getVideoPricing: async ({ model, tier, resolution }) => ({ model: model || (tier === 'ultra' ? 'provider/premium-video' : 'provider/cheap-video'), resolution, costPerSecondUsd: 0.12, source: 'openrouter-live-catalog' }),
    createVideo: async (body) => { calls.push(body); return { id: 'job_123' }; },
    videoStatus: async (id) => ({ id, status: 'completed' }),
    videoContent: async (id) => Buffer.from('video'),
  };
  const provider = createOpenRouterVideoProvider({ client, model: 'provider/video', tier: 'max', maxSeconds: 8, resolution: '720p' });
  assert.equal(provider.costPerSecondUsd, null);
  assert.equal(await provider.getCostPerSecondUsd(), 0.12);
  assert.equal(provider.maxSeconds, 8);
  assert.equal(await provider.create({ prompt: 'A lighthouse', aspectRatio: '16:9', seconds: 8 }), 'job_123');
  assert.deepEqual(calls[0], { model: 'provider/video', tier: 'max', prompt: 'A lighthouse', duration: 8, aspect_ratio: '16:9', resolution: '720p', generate_audio: true, maxCostPerSecondUsd: 0.12 });
  await assert.rejects(provider.create({ prompt: 'Too long', aspectRatio: '16:9', seconds: 9 }), /duration exceeds/);
  await assert.rejects(provider.extend({ prompt: 'x', videoBytes: Buffer.from('x') }), /extension is not supported/);
  assert.equal(provider.extract({ id: 'job_123', status: 'completed' }).uri, 'job_123');
  assert.equal(provider.extract({ id: 'job_123', status: 'completed', usage: { cost: 0.037 } }).actualCostUsd, 0.037);
  assert.equal(provider.extract({ id: 'job_123', status: 'completed', usage: { cost: 'unknown' } }).actualCostUsd, null);
  assert.equal((await provider.download('job_123')).toString(), 'video');
});


test('image catalog schema without chat architecture is accepted, but editing requires declared reference support', async () => {
  const calls = [];
  const imageModel = { id: 'openai/gpt-image-2', name: 'GPT Image 2', supported_parameters: { quality: { type: 'enum', values: ['low', 'medium', 'high'] }, aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] }, input_references: { type: 'range', min: 0, max: 4 } } };
  const client = createOpenRouterClient({ apiKey: 'test-key', fetchImpl: async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, body: init.body ? JSON.parse(init.body) : null });
    if (path === '/api/v1/images/models') return response({ data: [imageModel] });
    if (path === '/api/v1/images/models/openai/gpt-image-2/endpoints') return response({ endpoints: [{ pricing: [{ billable: 'output_image', cost_usd: 0.04, unit: 'image' }] }] });
    if (path === '/api/v1/images') return response({ data: [{ b64_json: Buffer.from('fake-image').toString('base64') }], usage: { cost: 0.04 } });
    throw new Error('unexpected endpoint');
  } });
  const result = await client.generateImage({ model: 'openai/gpt-image-2', prompt: 'A calm blue ocean', quality: 'high', maxCostUsd: 0.05 });
  assert.equal(result.data[0].b64_json, Buffer.from('fake-image').toString('base64'));
  const generated = calls.find((x) => x.path === '/api/v1/images');
  assert.equal(generated.body.quality, 'high');
  await client.generateImage({ model: 'openai/gpt-image-2', prompt: 'Edit this', images: ['data:image/png;base64,AAAA'], maxCostUsd: 0.05 });
  const edited = calls.filter((x) => x.path === '/api/v1/images').at(-1);
  assert.equal(edited.body.input_references.length, 1);
  assert.ok(!('images' in edited.body));
  await assert.rejects(client.generateImage({ model: 'openai/gpt-image-2', prompt: 'Underbudget', maxCostUsd: 0.01 }), /below the live catalog price/);
  await assert.rejects(client.generateImage({ model: 'openai/gpt-image-2', prompt: 'Unsupported quality', quality: 'xhigh', maxCostUsd: 0.05 }), /does not advertise the requested quality/);
  await assert.rejects(client.generateImage({ model: 'openai/gpt-image-2', prompt: 'Unsupported aspect ratio', aspect_ratio: '9:16', maxCostUsd: 0.05 }), /does not advertise the requested aspect_ratio/);
});


test('OpenRouter text adapter routes classified tasks through exact capability-checked models with privacy denial', async () => {
  let seen;
  const client = {
    listModels: async () => [{ id: 'vendor/model', architecture: { output_modalities: ['text'] } }],
    chat: async (args) => { seen = args; return { model: 'vendor/model', choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2 } }; }
  };
  const provider = createOpenRouterProvider({ apiKey: 'test-key', model: 'vendor/model', client });
  assert.equal(provider.capabilities().dataLeavesServer, true);
  assert.equal(provider.capabilities().trainsOnData, false);
  const result = await provider.generate({ system: 'S', messages: [{ role: 'user', content: 'inspect code' }], model: 'vendor/model', task: 'coding', maxTokens: 32 });
  assert.equal(result.text, 'ok');
  assert.equal(result.inputTokens, 3);
  assert.equal(seen.task, 'coding');
  assert.equal(seen.model, 'vendor/model');
  assert.equal(seen.provider.data_collection, 'deny');
  await assert.rejects(provider.generate({ system: 'S', messages: [{ role: 'user', content: 'image' }], model: 'vendor/model', attachments: [{ kind: 'image', data: 'AAAA', mime: 'image/png' }] }), /does not accept attachments/);
  await assert.rejects(provider.generate({ system: 'S', messages: [{ role: 'user', content: 'decide' }], model: 'vendor/model', task: 'decisions' }), /dedicated decide/);

  let freeCall;
  const freeProvider = createOpenRouterProvider({ apiKey: 'test-key', model: 'openrouter/free', fallbackProvider: { generate: async () => { throw new Error('legacy adapter must not be called'); } }, client: { listModels: async () => [], chat: async (args) => { freeCall = args; return { choices: [{ message: { content: 'basic fallback' }, finish_reason: 'stop' }], usage: {} }; } } });
  const freeResult = await freeProvider.generate({ system: 'S', messages: [{ role: 'user', content: 'hello' }], model: 'openrouter/free', task: 'chat' });
  assert.equal(freeResult.text, 'basic fallback');
  assert.equal(freeCall.provider.data_collection, 'deny');
  await assert.rejects(freeProvider.generate({ system: 'S', messages: [{ role: 'user', content: 'write code' }], model: 'openrouter/free', task: 'coding' }), /cannot guarantee task-specific capabilities/);
});


test('OpenRouter TTS pins the request to the configured Google AI Studio provider without fallback', async () => {
  const { createOpenRouterClient } = await import('../src/ai/openrouter.js');
  let requestSeen;
  const client = createOpenRouterClient({
    apiKey: 'test-key',
    fetchImpl: async (url, init = {}) => {
      if (String(url).includes('/models?')) return new Response(JSON.stringify({ data: [{ id: 'google/gemini-3.8-flash-lite-tts', architecture: { output_modalities: ['speech'] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      requestSeen = { url: String(url), body: JSON.parse(init.body) };
      return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { 'content-type': 'audio/wav' } });
    }
  });
  await client.speak({ model: 'google/gemini-3.8-flash-lite-tts', input: 'Hello from NasrinAI', voice: 'Charon', responseFormat: 'wav', provider: 'Google AI Studio' });
  assert.equal(requestSeen.url.endsWith('/audio/speech'), true);
  assert.equal(requestSeen.body.model, 'google/gemini-3.8-flash-lite-tts');
  assert.deepEqual(requestSeen.body.provider, { order: ['Google AI Studio'], only: ['Google AI Studio'], allow_fallbacks: false });
});
