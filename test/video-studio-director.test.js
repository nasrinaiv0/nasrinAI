import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('Video Studio loads the independent Director workflow module', async () => {
  const html = await readFile(new URL('../public/video-studio.html', import.meta.url), 'utf8');
  assert.match(html, /src="\/video-studio-director\.js" defer/);
});

test('Director workflow script parses and exposes shot planning, prompt library, and export actions', async () => {
  const js = await readFile(new URL('../public/video-studio-director.js', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new vm.Script(js, { filename: 'video-studio-director.js' }));
  for (const marker of [
    'Director &amp; Shot Planner',
    'directorGeneratePlan',
    'directorExportPlan',
    'directorClearPlan',
    'directorSaveCurrentPrompt',
    'use-shot',
    'save-shot',
    'use-library',
    'delete-library',
    'nasrinai.videoStudio.director.v1',
    'nasrinai.videoStudio.promptLibrary.v1',
    'schemaVersion: 1',
    'Short drama',
    'Music video',
    'Product advertisement',
    'Social short'
  ]) assert.ok(js.includes(marker), `missing Director workflow feature marker: ${marker}`);
});

test('Director workflow does not store provider credentials or call providers directly', async () => {
  const js = await readFile(new URL('../public/video-studio-director.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /OPENAI_API_KEY|ANTHROPIC_API_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(js, /fetch\s*\(/);
  assert.match(js, /No API keys or authentication tokens are stored here/);
});

test('Director prompt entry points reuse the existing Video Studio prompt field', async () => {
  const js = await readFile(new URL('../public/video-studio-director.js', import.meta.url), 'utf8');
  assert.match(js, /\$\('prompt'\)/);
  assert.match(js, /dispatchEvent\(new Event\('input'/);
  assert.match(js, /press Generate scene when ready/);
});
