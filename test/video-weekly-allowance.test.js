import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVideos } from '../src/videos.js';
import { createMemoryStore } from '../src/store/memory-store.js';
import { testConfig } from './helpers.js';

const caller = { actor: { type: 'user', id: 'user-1' }, tenantId: 'tenant-1' };
const quiet = { info() {}, warn() {}, error() {} };

function setup({ plan = 'pro', weekly = { VIDEO_PRO_WEEKLY_SECONDS: '10', VIDEO_MAX_WEEKLY_SECONDS: '100', VIDEO_ULTRA_WEEKLY_SECONDS: '1000' }, now } = {}) {
  const created = [];
  const hourly = { n: 0 };
  const provider = {
    id: 'openrouter', model: 'm', maxSeconds: 60,
    async create({ seconds }) { created.push(seconds); return 'job-' + created.length; },
    async status(op) { return { id: op, status: 'processing' }; },
    extract() { return { done: false, failed: false, uri: null }; },
    async download() { return Buffer.from('x'); }
  };
  const store = createMemoryStore();
  const videos = createVideos({
    store, plans: { async current() { return { plan, open: false }; } }, provider,
    limiter: { async video() { hourly.n += 1; } },
    config: testConfig({ VIDEO_PER_HOUR: '10', ...weekly }), logger: quiet, ...(now ? { now } : {})
  });
  return { videos, store, created, hourly };
}

test('a plan cannot create more video seconds in a week than its allowance', async () => {
  const { videos, created } = setup({ plan: 'pro' });
  await videos.create(caller, { prompt: 'one', seconds: 6 });
  await assert.rejects(() => videos.create(caller, { prompt: 'two', seconds: 6 }), (err) => {
    assert.equal(err.status, 429);
    assert.equal(err.code, 'video_allowance_reached');
    assert.match(err.message, /weekly video allowance/i);
    return true;
  });
  assert.equal(created.length, 1, 'no paid job is started once the allowance is used');
});

test('the allowance follows the plan', async () => {
  const { videos, created } = setup({ plan: 'max' });
  for (let i = 0; i < 5; i += 1) await videos.create(caller, { prompt: 'clip ' + i, seconds: 6 });
  assert.equal(created.length, 5, '30 seconds fit inside a 100 second Max allowance');
});

test('failed videos give their seconds back', async () => {
  const { videos, store } = setup({ plan: 'pro' });
  const first = await videos.create(caller, { prompt: 'one', seconds: 6 });
  await store.updateVideo(first.video_id, { status: 'failed', errorCode: 'provider_failed' });
  await videos.create(caller, { prompt: 'two', seconds: 6 });
});

test('seconds older than seven days no longer count', async () => {
  const { videos, store } = setup({ plan: 'pro' });
  const first = await videos.create(caller, { prompt: 'one', seconds: 6 });
  await store.updateVideo(first.video_id, { createdAt: new Date(Date.now() - 8 * 86400_000).toISOString() });
  await videos.create(caller, { prompt: 'two', seconds: 6 });
});

test("one person's use never counts against another", async () => {
  const { videos } = setup({ plan: 'pro' });
  await videos.create(caller, { prompt: 'one', seconds: 6 });
  await videos.create({ actor: { type: 'user', id: 'user-2' }, tenantId: 'tenant-1' }, { prompt: 'other', seconds: 6 });
});

test('a refused request does not use up the hourly limit', async () => {
  const { videos, hourly } = setup({ plan: 'pro' });
  await videos.create(caller, { prompt: 'one', seconds: 6 });
  await assert.rejects(() => videos.create(caller, { prompt: 'two', seconds: 6 }));
  assert.equal(hourly.n, 1);
});

test('with no weekly allowance configured (0) the check is not applied', async () => {
  const { videos, created } = setup({ plan: 'pro', weekly: {} });
  await videos.create(caller, { prompt: 'one', seconds: 6 });
  await videos.create(caller, { prompt: 'two', seconds: 6 });
  assert.equal(created.length, 2);
});
