import test from 'node:test';
import assert from 'node:assert/strict';
import { createVideoStudioRenderWorker } from '../src/video-studio-render-worker.js';

const tenantId = '123e4567-e89b-42d3-a456-426614174000';
const projectId = '123e4567-e89b-42d3-a456-426614174001';
const videoId = '123e4567-e89b-42d3-a456-426614174002';
const caller = { tenantId, actor: { type: 'user', id: 'nasrin_test_user' } };
const config = { supabaseUrl: 'https://example.supabase.co', supabaseSecretKey: 'server-test-secret' };

function response(data, status = 200) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('render enqueue snapshots source and audio to private storage before persisting a durable queued job', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, body: init.body });
    if (String(url).includes('/storage/v1/object/')) return response(null, 200);
    if (String(url).includes('idempotency_key=eq.')) return response([]);
    if (String(url).includes('/rest/v1/video_studio_render_jobs?select=*')) {
      const body = JSON.parse(init.body);
      return response([{
        ...body, status: 'queued', progress: 0, created_at: '2026-10-23T00:00:00.000Z',
        updated_at: '2026-10-23T00:00:00.000Z'
      }], 201);
    }
    throw new Error('Unexpected test request: ' + url);
  };
  const worker = createVideoStudioRenderWorker({ config, fetchImpl });
  const result = await worker.enqueue(caller, {
    projectId, videoId, videoBytes: Buffer.from('fake-mp4'), durationSeconds: 8,
    timelineItems: [{ startSeconds: 0.5, trimStartSeconds: 0, trimEndSeconds: null, gain: 0.8, lane: 1 }],
    audioAssets: [{ bytes: Buffer.from('fake-mp3') }],
    idempotencyKey: 'test-render-key-0001'
  });
  assert.equal(result.status, 'queued');
  assert.equal(result.progress, 0);
  assert.match(result.render_id, /^[0-9a-f-]{36}$/);
  assert.equal(result.download_url, null);
  assert.equal(calls.filter(call => call.url.includes('/storage/v1/object/')).length, 2);
  assert.ok(calls.some(call => call.url.includes('/rest/v1/video_studio_render_jobs?select=*')));
  assert.ok(calls.every(call => !call.url.includes('example.supabase.co/rest/v1/video_studio_render_jobs') || call.method === 'GET' || call.method === 'POST'));
});

test('render enqueue rejects guests before making any storage or database request', async () => {
  let requests = 0;
  const worker = createVideoStudioRenderWorker({
    config,
    fetchImpl: async () => { requests++; return response([]); }
  });
  await assert.rejects(() => worker.enqueue({
    tenantId, actor: { type: 'guest', id: 'guest_test' }
  }, {
    projectId, videoId, videoBytes: Buffer.from('x'), durationSeconds: 8,
    timelineItems: [], audioAssets: []
  }), error => error.status === 403 && error.code === 'sign_in_required');
  assert.equal(requests, 0);
});

test('render status and output links are scoped to the authenticated tenant and owner', async () => {
  const calls = [];
  const row = {
    id: videoId, tenant_id: tenantId, owner_id: caller.actor.id, project_id: projectId,
    status: 'completed', progress: 100, output_path: 'renders/out.mp4', output_size_bytes: 4,
    created_at: '2026-10-23T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z',
    completed_at: '2026-10-23T00:00:00.000Z'
  };
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method });
    if (String(url).includes('/rest/v1/video_studio_render_jobs?')) return response([row]);
    if (String(url).includes('/storage/v1/object/')) return new Response(Buffer.from('mp4!'), { status: 200 });
    throw new Error('Unexpected test request: ' + url);
  };
  const worker = createVideoStudioRenderWorker({ config, fetchImpl });
  const status = await worker.status(caller, videoId);
  assert.equal(status.status, 'completed');
  assert.equal(status.download_url, '/v1/video-studio/render-jobs/' + videoId + '/content');
  const output = await worker.readOutput(caller, videoId);
  assert.equal(output.bytes.toString(), 'mp4!');
  assert.ok(calls[0].url.includes('tenant_id=eq.' + tenantId));
  assert.ok(calls[0].url.includes('owner_id=eq.' + encodeURIComponent(caller.actor.id)));
});
