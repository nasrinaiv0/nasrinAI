import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAITranscription, MAX_TRANSCRIPTION_BYTES } from '../src/ai/transcription.js';

const bytes = Buffer.from('fake audio bytes');

test('transcription uploads audio to OpenAI and returns plain transcript text', async () => {
  let request;
  const service = createOpenAITranscription({
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ text: '  Hello from the meeting.  ' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  const result = await service.transcribe({ bytes, name: 'meeting.webm', mime: 'audio/webm' });
  assert.equal(result.text, 'Hello from the meeting.');
  assert.equal(request.url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.ok(request.options.body instanceof FormData);
  assert.equal(request.options.body.get('model'), 'whisper-1');
  assert.equal(request.options.body.get('file').name, 'meeting.webm');
});

test('transcription rejects missing keys, oversized files and unsupported formats before network calls', async () => {
  const unavailable = createOpenAITranscription({ apiKey: '' });
  await assert.rejects(() => unavailable.transcribe({ bytes, name: 'voice.mp3', mime: 'audio/mpeg' }), (e) => e.code === 'transcription_unavailable');
  let called = false;
  const service = createOpenAITranscription({ apiKey: 'test-key', fetchImpl: async () => { called = true; } });
  await assert.rejects(() => service.transcribe({ bytes: Buffer.alloc(MAX_TRANSCRIPTION_BYTES + 1), name: 'voice.mp3', mime: 'audio/mpeg' }), (e) => e.status === 413);
  await assert.rejects(() => service.transcribe({ bytes, name: 'payload.exe', mime: 'application/octet-stream' }), (e) => e.status === 415);
  assert.equal(called, false);
});

test('transcription converts provider failures into safe public errors', async () => {
  const service = createOpenAITranscription({ apiKey: 'test-key', fetchImpl: async () => new Response('denied', { status: 429 }) });
  await assert.rejects(() => service.transcribe({ bytes, name: 'voice.mp3', mime: 'audio/mpeg' }), (e) => e.code === 'transcription_busy' && !e.message.includes('denied'));
  const empty = createOpenAITranscription({ apiKey: 'test-key', fetchImpl: async () => new Response(JSON.stringify({ text: '  ' }), { status: 200 }) });
  await assert.rejects(() => empty.transcribe({ bytes, name: 'voice.mp3', mime: 'audio/mpeg' }), (e) => e.code === 'empty_transcription');
});
