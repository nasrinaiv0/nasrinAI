import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ElevenLabs appears once in the Developer plugin catalog and is not falsely marked connected', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const plugins = await readFile(new URL('../docs/plugins.md', import.meta.url), 'utf8');
  const spec = await readFile(new URL('../docs/elevenlabs-plugin.md', import.meta.url), 'utf8');
  assert.equal((app.match(/\['ElevenLabs', 'cloud', 'https:\/\/elevenlabs\.io'\]/g) || []).length, 1);
  assert.match(app, /ElevenLabs: \['API key verification', 'Available voices', 'Text-to-speech generation', 'Usage and quota', 'Audio output'/);
  assert.match(app, /: 'Not connected'/);
  assert.match(plugins, /ElevenLabs \| Developer catalog entry; API connection and TTS actions not yet implemented/);
  assert.match(spec, /Store credentials only in the existing encrypted\/server-side secret storage pattern/);
  assert.match(spec, /Tests required before merge/);
});