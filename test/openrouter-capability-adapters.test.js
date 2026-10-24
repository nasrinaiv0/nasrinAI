import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderError } from '../src/ai/provider.js';
import {
  createOpenRouterImageProvider,
  createOpenRouterSpeechProvider,
  createOpenRouterTranscriptionProvider,
  createOpenRouterEmbeddingProvider,
  createOpenRouterDecisionProvider,
  createOpenRouterRerankProvider
} from '../src/ai/openrouter-capability-adapters.js';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

test('image adapter returns validated image bytes and rejects provider URLs instead of fetching arbitrary hosts', async () => {
  const provider = createOpenRouterImageProvider({ client: { generateImage: async () => ({ data: [{ b64_json: png.toString('base64') }] }) }, model: 'provider/image-model' });
  const result = await provider.generate({ prompt: 'A safe test image' });
  assert.equal(result.mime, 'image/png');
  assert.deepEqual(result.bytes, png);

  const unsafe = createOpenRouterImageProvider({ client: { generateImage: async () => ({ data: [{ url: 'http://169.254.169.254/latest/meta-data' }] }) }, model: 'provider/image-model' });
  await assert.rejects(unsafe.generate({ prompt: 'test' }), /supported base64 image/);
});

test('speech adapter validates audio response bytes and returns a format-specific MIME type', async () => {
  const bytes = Buffer.from('RIFF0000WAVEfmt ');
  const provider = createOpenRouterSpeechProvider({ client: { speak: async ({ input, responseFormat }) => {
    assert.equal(input, 'Hello there'); assert.equal(responseFormat, 'wav'); return bytes;
  } }, model: 'provider/tts', responseFormat: 'wav' });
  const result = await provider.generate({ text: 'Hello there' });
  assert.equal(result.mime, 'audio/wav');
  assert.deepEqual(result.bytes, bytes);
  const broken = createOpenRouterSpeechProvider({ client: { speak: async () => Buffer.from('x') }, model: 'provider/tts' });
  await assert.rejects(broken.generate({ text: 'Hello' }), /invalid or oversized speech audio/);
});

test('transcription adapter validates input and normalizes response text', async () => {
  const provider = createOpenRouterTranscriptionProvider({ client: { transcribe: async ({ file, filename }) => {
    assert.equal(file.byteLength, 3); assert.equal(filename, 'meeting.wav'); return { text: '  Meeting started.  ', language: 'en' };
  } }, model: 'provider/stt' });
  assert.deepEqual(await provider.transcribe({ bytes: new Uint8Array([1, 2, 3]), filename: 'meeting.wav' }), { text: 'Meeting started.', language: 'en' });
  await assert.rejects(provider.transcribe({ bytes: new Uint8Array() }), /non-empty byte array/);
});

test('embedding adapter rejects malformed vectors and preserves batch order', async () => {
  const provider = createOpenRouterEmbeddingProvider({ client: { embeddings: async ({ input }) => ({
    data: (Array.isArray(input) ? input : [input]).map((_, index) => ({ embedding: [index + 0.25, 0.5] }))
  }) }, model: 'provider/embed' });
  assert.deepEqual(await provider.embed(['first', 'second']), [[0.25, 0.5], [1.25, 0.5]]);
  assert.deepEqual(await provider.embed('single'), [0.25, 0.5]);
  const broken = createOpenRouterEmbeddingProvider({ client: { embeddings: async () => ({ data: [{ embedding: [NaN] }] }) }, model: 'provider/embed' });
  await assert.rejects(broken.embed('bad vector'), /invalid embedding vector/);
});

test('decision adapter requires an explicitly configured model and never falls back to chat', async () => {
  assert.throws(() => createOpenRouterDecisionProvider({ client: { decide() {} } }), /explicitly configured/);
  const provider = createOpenRouterDecisionProvider({ client: { decide: async (request) => ({ model: request.model, result: 'yes' }) }, model: 'provider/decision' });
  assert.deepEqual(await provider.decide({ state: 'state', questions: { answer: { type: 'choice', options: ['yes', 'no'] } } }), { model: 'provider/decision', result: 'yes' });
});

test('rerank adapter validates bounds and rejects invalid result indices or scores', async () => {
  const provider = createOpenRouterRerankProvider({ client: { rerank: async ({ documents }) => ({
    results: documents.map((_, index) => ({ index, relevance_score: 1 - index / 10 })).slice(0, 1)
  }) }, model: 'provider/rerank' });
  assert.deepEqual(await provider.rerank({ query: 'q', documents: ['a', 'b'], topN: 1 }), [
    { index: 0, relevance_score: 1 }, { index: 1, relevance_score: 0.9 }
  ]);
  await assert.rejects(provider.rerank({ query: 'q', documents: [] }), /1–128 text items/);
  const broken = createOpenRouterRerankProvider({ client: { rerank: async () => ({ results: [{ index: 8, relevance_score: NaN }] }) }, model: 'provider/rerank' });
  await assert.rejects(broken.rerank({ query: 'q', documents: ['one'] }), /invalid reranking response/);
});

test('all adapters fail closed when their required client method is missing', () => {
  assert.throws(() => createOpenRouterImageProvider({ client: {} }), (error) => error instanceof ProviderError);
  assert.throws(() => createOpenRouterSpeechProvider({ client: {} }), (error) => error instanceof ProviderError);
  assert.throws(() => createOpenRouterTranscriptionProvider({ client: {} }), (error) => error instanceof ProviderError);
  assert.throws(() => createOpenRouterEmbeddingProvider({ client: {} }), (error) => error instanceof ProviderError);
  assert.throws(() => createOpenRouterDecisionProvider({ client: {} }), (error) => error instanceof ProviderError);
  assert.throws(() => createOpenRouterRerankProvider({ client: {} }), (error) => error instanceof ProviderError);
});
