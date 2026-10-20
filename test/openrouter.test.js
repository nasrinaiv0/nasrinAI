import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterClient, OPENROUTER_TASK_ENDPOINTS, OPENROUTER_TASK_MODALITIES } from '../src/ai/openrouter.js';

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
  assert.equal(calls, 1);
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
    sent = { url: String(url), body: JSON.parse(init.body), headers: init.headers };
    return response({ choices: [{ message: { content: 'ok' } }] });
  } });
  await client.chat({ model: 'provider/model', messages: [{ role: 'user', content: 'hello' }], maxTokens: 999999 });
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
