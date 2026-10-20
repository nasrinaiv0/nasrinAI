import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterClient, createOpenRouterVideoProvider, OPENROUTER_TASK_ENDPOINTS, OPENROUTER_TASK_MODALITIES } from '../src/ai/openrouter.js';

function response(body, status = 200, type = 'application/json') {
  return new Response(type === 'application/json' ? JSON.stringify(body) : body, { status, headers: { 'content-type': type } });
}
const model = (id, modality = 'text', pricing = { prompt: '0.000001', completion: '0.000002' }) => ({
  id, name: id, architecture: { output_modalities: [modality], input_modalities: ['text'] }, pricing
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
    if (String(url).endsWith('/models?output_modalities=all')) return response({ data: [model('typesafe/jev-1.13', 'decisions')] });
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

test('image and video model discovery use their dedicated capability catalogs', async () => {
  const urls = [];
  const client = createOpenRouterClient({ apiKey: 'secret', fetchImpl: async (url) => {
    urls.push(String(url));
    if (String(url).endsWith('/images/models')) return response({ data: [
      { id: 'provider/vision-only', architecture: { output_modalities: ['text'], input_modalities: ['image'] } },
      { id: 'provider/image-maker', architecture: { output_modalities: ['image'], input_modalities: ['text'] } }
    ] });
    if (String(url).endsWith('/videos/models')) return response({ data: [{ id: 'provider/video-maker', supported_parameters: { duration: { min: 1, max: 8 } } }] });
    return response({ data: [] });
  } });
  assert.equal((await client.selectModel('image', ['provider/image-maker'])).id, 'provider/image-maker');
  assert.equal((await client.selectModel('video', ['provider/video-maker'])).id, 'provider/video-maker');
  assert.ok(urls.some((url) => url.endsWith('/images/models')));
  assert.ok(urls.some((url) => url.endsWith('/videos/models')));
});


test('OpenRouter video adapter pins model, duration, and explicit cost; rejects unsupported extensions', async () => {
  const calls = [];
  const client = {
    createVideo: async (body) => { calls.push(body); return { id: 'job_123' }; },
    videoStatus: async (id) => ({ id, status: 'completed' }),
    videoContent: async (id) => Buffer.from('video'),
  };
  const provider = createOpenRouterVideoProvider({ client, model: 'provider/video', maxSeconds: 8, resolution: '720p', costPerSecondUsd: 0.12 });
  assert.equal(provider.costPerSecondUsd, 0.12);
  assert.equal(provider.maxSeconds, 8);
  assert.equal(await provider.create({ prompt: 'A lighthouse', aspectRatio: '16:9', seconds: 8 }), 'job_123');
  assert.deepEqual(calls[0], { model: 'provider/video', prompt: 'A lighthouse', duration: 8, aspect_ratio: '16:9', resolution: '720p' });
  await assert.rejects(provider.create({ prompt: 'Too long', aspectRatio: '16:9', seconds: 9 }), /duration exceeds/);
  await assert.rejects(provider.extend({ prompt: 'x', videoBytes: Buffer.from('x') }), /extension is not supported/);
  assert.equal(provider.extract({ id: 'job_123', status: 'completed' }).uri, 'job_123');
  assert.equal((await provider.download('job_123')).toString(), 'video');
});
