import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Video Studio cloud projects use authenticated CRUD APIs and preserve local fallback', async () => {
  const html = await readFile(new URL('../public/video-studio.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  const routes = await readFile(new URL('../src/routes.js', import.meta.url), 'utf8');
  const store = await readFile(new URL('../src/store/supabase-store.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../db/migrations/051_video_studio_projects.sql', import.meta.url), 'utf8');
  assert.match(html, /id="saveProject"/);
  assert.match(html, /id="openCloudProject"/);
  assert.match(js, /\/v1\/video-studio\/projects/);
  assert.match(js, /Your local draft is still available/);
  assert.match(js, /expected_version/);
  assert.match(routes, /path: '\/v1\/video-studio\/projects'/);
  assert.match(routes, /path: '\/v1\/video-studio\/projects\/:id'/);
  assert.match(routes, /caller\.tenantId/);
  assert.match(routes, /caller\.actor\.id/);
  assert.match(routes, /cleanVideoStudioDocument/);
  assert.match(routes, /expected_version_required/);
  assert.match(routes, /Reload this project before saving so changes are not overwritten/);
  for (const method of ['listVideoStudioProjects', 'getVideoStudioProject', 'createVideoStudioProject', 'updateVideoStudioProject', 'deleteVideoStudioProject']) {
    assert.ok(store.includes(method), 'store implements ' + method);
  }
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all .* from anon, authenticated/i);
  assert.match(migration, /octet_length\(document::text\) <= 1000000/i);
});

