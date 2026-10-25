import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVideos } from '../src/videos.js';
import { createMemoryStore } from '../src/store/memory-store.js';
import { testConfig } from './helpers.js';

// Production wiring (src/main.js): the video provider is a map keyed by tier,
// and the Supabase store's generated_videos table has no tier, model,
// resolution or fps columns, so a saved job comes back without them. The
// default memory store keeps every field, which hid this in earlier tests.
function supabaseShaped(store) {
  const getVideo = store.getVideo.bind(store);
  store.getVideo = async (args) => {
    const row = await getVideo(args);
    if (!row) return row;
    const { requestTier, providerTier, providerModel, resolution, fps, ...columnsThatExist } = row;
    return columnsThatExist;
  };
  return store;
}

const caller = { actor: { type: 'user', id: 'user-1' }, tenantId: 'tenant-1' };
const quiet = { info() {}, warn() {}, error() {} };

function setup({ plan = 'max', providerId = 'openrouter', bytes = Buffer.from('mp4-bytes') } = {}) {
  const calls = [];
  const adapter = (tier) => ({
    id: providerId, model: tier + '-model', maxSeconds: 8,
    async create() { calls.push(tier + ':create'); return 'job-abc'; },
    async status(operation) { calls.push(tier + ':status:' + operation); return { id: operation, status: 'completed' }; },
    extract(result) { return { done: true, failed: false, uri: result.id }; },
    async download(uri) { calls.push(tier + ':download:' + uri); return bytes; }
  });
  const providers = { pro: adapter('pro'), max: adapter('max'), ultra: adapter('ultra') };
  const store = supabaseShaped(createMemoryStore());
  const videos = createVideos({
    store, plans: { async current() { return { plan, open: false }; } }, provider: providers,
    limiter: { async video() {} }, config: testConfig({ VIDEO_PER_HOUR: '10' }), logger: quiet
  });
  return { videos, store, calls };
}

test('a saved job without a stored tier still polls and completes', async () => {
  const { videos, calls } = setup({ plan: 'max' });
  const created = await videos.create(caller, { prompt: 'Palawan island', seconds: 2 });
  const status = await videos.status(caller, created.video_id);
  assert.equal(status.status, 'completed', 'the provider finished, so NasrinAI must report it finished');
  assert.equal(status.download, '/v1/videos/' + created.video_id + '/content');
  assert.ok(calls.includes('max:status:job-abc'), 'polls through the adapter of the caller plan tier');
  assert.ok(calls.includes('max:download:job-abc'));
});

test('a finished video too large for the in-memory byte cache is durably stored and read back', async () => {
  const big = Buffer.alloc(8 * 1024 * 1024 + 1, 1);
  const { videos, calls, store } = setup({ plan: 'ultra', bytes: big });
  const created = await videos.create(caller, { prompt: 'Palawan island', seconds: 2 });
  assert.equal((await videos.status(caller, created.video_id)).status, 'completed');
  const content = await videos.read(caller, created.video_id);
  assert.equal(content.bytes.length, big.length);
  const saved = await store.getVideo({ tenantId: caller.tenantId, ownerType: caller.actor.type, ownerId: caller.actor.id, id: created.video_id });
  assert.equal(saved.storageBucket, 'generated-videos');
  assert.ok(saved.storagePath);
  assert.equal(calls.filter((call) => call === 'ultra:download:job-abc').length, 1, 'durable storage serves the file without a second provider download');
});

test('polling never creates another paid job', async () => {
  const { videos, calls } = setup({ plan: 'pro' });
  const created = await videos.create(caller, { prompt: 'Palawan island', seconds: 2 });
  await videos.status(caller, created.video_id);
  await videos.status(caller, created.video_id);
  assert.equal(calls.filter((call) => call.endsWith(':create')).length, 1);
});

test('a job from a provider that is no longer configured stays unavailable instead of using another provider', async () => {
  const { videos, store } = setup({ plan: 'max' });
  const created = await videos.create(caller, { prompt: 'Palawan island', seconds: 2 });
  const getVideo = store.getVideo.bind(store);
  store.getVideo = async (args) => { const row = await getVideo(args); return row ? { ...row, provider: 'someone-else' } : row; };
  await assert.rejects(() => videos.status(caller, created.video_id), (err) => err.status === 503 && err.code === 'videos_unavailable');
});
