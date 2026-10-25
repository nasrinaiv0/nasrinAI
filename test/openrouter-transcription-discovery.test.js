import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterClient } from '../src/ai/openrouter.js';

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => payload, text: async () => JSON.stringify(payload) };
}

test('transcription catalog discovery accepts text output only for audio-input models', async () => {
  const client = createOpenRouterClient({
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      if (String(url).endsWith('/models?output_modalities=all')) return jsonResponse({ data: [
        { id: 'provider/audio-to-text', architecture: { output_modalities: ['text'], input_modalities: ['audio'] } },
        { id: 'provider/text-only', architecture: { output_modalities: ['text'], input_modalities: ['text'] } },
        { id: 'provider/audio-output', architecture: { output_modalities: ['audio'], input_modalities: ['audio'] } }
      ] });
      return jsonResponse({ data: [] });
    }
  });
  assert.deepEqual(await client.listCapabilityModels({ task: 'transcription' }), ['provider/audio-to-text']);
});
