import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ElevenLabs appears once in the Developer plugin catalog and is not falsely marked connected', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const plugins = await readFile(new URL('../docs/plugins.md', import.meta.url), 'utf8');
  const spec = await readFile(new URL('../docs/elevenlabs-plugin.md', import.meta.url), 'utf8');
  assert.equal((app.match(/\['ElevenLabs', 'cloud', 'https:\/\/elevenlabs\.io'\]/g) || []).length, 1);
  assert.match(app, /ElevenLabs: \['Video Studio voiceover', 'Sound-effect generation', 'Voice selection', 'MP3 preview and download'/);
  assert.match(app, /: 'Not connected'/);
  assert.match(plugins, /ElevenLabs \| Video Studio voiceover and sound-effect generation; MP3 preview/download/);
  assert.match(spec, /server-side `ELEVENLABS_API_KEY`/);
  assert.match(spec, /Phase 1 API/);
});