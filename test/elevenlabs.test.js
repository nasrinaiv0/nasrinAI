import test from 'node:test';
import assert from 'node:assert/strict';
import { createElevenLabs } from '../src/elevenlabs.js';

test('ElevenLabs stays disabled without a server API key', async () => {
  const client = createElevenLabs({ apiKey: '' });
  assert.deepEqual(client.status(), { configured: false, capabilities: [] });
  await assert.rejects(() => client.voices(), (err) => err.status === 503);
});

test('voiceover uses the fixed official endpoint and returns audio bytes', async () => {
  let request;
  const client = createElevenLabs({
    apiKey: 'unit-test-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(Buffer.from('fake-mp3'), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }
  });
  const bytes = await client.voiceover({ text: 'Hello world', voiceId: 'voice_123' });
  assert.equal(bytes.toString(), 'fake-mp3');
  assert.equal(request.url, 'https://api.elevenlabs.io/v1/text-to-speech/voice_123?output_format=mp3_44100_128');
  assert.equal(request.options.headers['xi-api-key'], 'unit-test-key');
  assert.equal(JSON.parse(request.options.body).text, 'Hello world');
});

test('sound effects use the official endpoint and reject invalid duration', async () => {
  let requestUrl = '';
  const client = createElevenLabs({
    apiKey: 'unit-test-key',
    fetchImpl: async (url) => {
      requestUrl = url;
      return new Response(Buffer.from('effect'), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }
  });
  await assert.rejects(() => client.soundEffect({ prompt: 'whoosh', durationSeconds: 30 }), (err) => err.status === 400);
  assert.equal((await client.soundEffect({ prompt: 'soft whoosh', durationSeconds: 2 })).toString(), 'effect');
  assert.equal(requestUrl, 'https://api.elevenlabs.io/v1/sound-generation');
});

test('voice discovery filters malformed provider records', async () => {
  const client = createElevenLabs({
    apiKey: 'unit-test-key',
    fetchImpl: async () => new Response(JSON.stringify({ voices: [
      { voice_id: 'voice_123', name: 'Studio Voice', category: 'premade' },
      { voice_id: '../bad', name: 'Invalid' }
    ] }), { status: 200, headers: { 'content-type': 'application/json' } })
  });
  assert.deepEqual(await client.voices(), [{ id: 'voice_123', name: 'Studio Voice', category: 'premade' }]);
});

test('provider failures are mapped to sanitized errors', async () => {
  const client = createElevenLabs({ apiKey: 'unit-test-key', fetchImpl: async () => new Response('private detail', { status: 429 }) });
  await assert.rejects(() => client.voiceover({ text: 'hello', voiceId: 'voice_123' }), (err) => err.code === 'elevenlabs_rate_limited' && !err.message.includes('private detail'));
});
