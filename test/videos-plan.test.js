import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVideos } from '../src/videos.js';
import { createBudget } from '../src/ai/budget.js';
import { createMemoryStore } from '../src/store/memory-store.js';
import { testConfig } from './helpers.js';

function service(plan, open = false, maxSeconds = null, providerOverride = null) {
  const created = [];
  const config = testConfig({ DAILY_BUDGET_USD: '40', WEEKLY_BUDGET_USD: '100', MONTHLY_BUDGET_USD: '300', VIDEO_PER_HOUR: '10' });
  const store = createMemoryStore();
  const addVideo = store.addVideo.bind(store);
  store.addVideo = async (row) => { created.push(row); return addVideo(row); };
  store.getConversation = async (id) => {
    if (id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') {
      return { id, tenantId: 'tenant-1', ownerType: 'user', ownerId: 'user-1' };
    }
    if (id === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') {
      return { id, tenantId: 'tenant-1', ownerType: 'user', ownerId: 'user-2' };
    }
    return null;
  };
  const budget = createBudget({ store, config, logger: { info() {}, warn() {}, error() {} } });
  const videos = createVideos({
    store,
    plans: { async current() { return { plan, open }; } },
    provider: providerOverride || { id: 'fake-video', model: 'veo-3.1-generate-preview', resolution: '1080p', ...(maxSeconds ? { maxSeconds } : {}), async create() { return { operation: 'fake-op' }; } },
    limiter: { async signIn() {} },
    budget,
    config,
    logger: { info() {} }
  });
  return { videos, created, store, budget };
}

const caller = { actor: { type: 'user', id: 'user-1' }, tenantId: 'tenant-1' };
const body = { prompt: 'A peaceful ocean at sunrise' };

for (const plan of ['pro', 'max', 'ultra']) {
  test('video creation is allowed on ' + plan + ' plan', async () => {
    const { videos, created } = service(plan);
    const result = await videos.create(caller, body);
    assert.equal(result.status, 'in_progress');
    assert.equal(created.length, 1);
  });
}

for (const plan of ['quick', 'free']) {
  test('video creation is rejected on ' + plan + ' plan', async () => {
    const { videos, created } = service(plan);
    await assert.rejects(() => videos.create(caller, body), (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, 'video_plan_required');
      return true;
    });
    assert.equal(created.length, 0);
  });
}

test('video creation is rejected for open/unpaid plan status', async () => {
  const { videos, created } = service('ultra', true);
  await assert.rejects(() => videos.create(caller, body), (err) => {
    assert.equal(err.status, 403);
    assert.equal(err.code, 'video_plan_required');
    return true;
  });
  assert.equal(created.length, 0);
});

test('video creation is rejected for guest callers', async () => {
  const { videos, created } = service('ultra');
  await assert.rejects(() => videos.create({ actor: { type: 'guest', id: 'guest-1' }, tenantId: 'tenant-1' }, body), (err) => {
    assert.equal(err.status, 403);
    assert.equal(err.code, 'video_plan_required');
    return true;
  });
  assert.equal(created.length, 0);
});

test('video creation accepts only a caller-owned conversation', async () => {
  const { videos, created } = service('max');
  const owned = await videos.create(caller, {
    ...body,
    conversation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  });
  assert.equal(owned.status, 'in_progress');
  assert.equal(created.length, 1);
  assert.equal(created[0].conversationId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

  for (const conversation_id of [
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'not-a-uuid',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ]) {
    await assert.rejects(
      () => videos.create(caller, { ...body, conversation_id }),
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.code, 'not_found');
        return true;
      }
    );
  }
  assert.equal(created.length, 1, 'foreign, malformed, and missing conversations never create a video job');
});


test('video creation defaults to the configured provider clip limit when duration is omitted', async () => {
  const { videos, created } = service('max', false, 8);
  const result = await videos.create(caller, body);
  assert.equal(result.status, 'in_progress');
  assert.equal(result.target_seconds, 8);
  assert.equal(created[0].targetSeconds, 8);
});


test('completed OpenRouter video reconciles the estimate to authoritative provider usage idempotently', async () => {
  const provider = {
    id: 'openrouter', model: 'provider/video', resolution: '720p', maxSeconds: 8,
    async getCostPerSecondUsd() { return 0.08; },
    async create() { return 'job-video-123'; },
    async status() { return { id: 'job-video-123', status: 'completed', usage: { cost: 0.04 } }; },
    extract(result) { return { done: true, failed: false, uri: result.id, actualCostUsd: result.usage?.cost ?? null }; },
    async download() { return Buffer.from('fake-mp4'); }
  };
  const { videos, created, store } = service('max', false, 8, provider);
  const createdResult = await videos.create(caller, body);
  assert.equal(createdResult.status, 'in_progress');
  const before = await store.getVideo({ tenantId: caller.tenantId, ownerType: 'user', ownerId: caller.actor.id, id: createdResult.video_id });
  assert.equal(before.estimatedCostUsd, 0.64);
  assert.equal(before.spendReservationId, created[0].spendReservationId);

  const status = await videos.status(caller, createdResult.video_id);
  assert.equal(status.status, 'completed');
  const completed = await store.getVideo({ tenantId: caller.tenantId, ownerType: 'user', ownerId: caller.actor.id, id: createdResult.video_id });
  assert.equal(completed.actualCostUsd, 0.04);
  assert.ok(completed.costReconciledAt);
  assert.equal(await store.costSince(new Date(Date.now() - 86400000)), 0.04);

  await videos.status(caller, createdResult.video_id);
  assert.equal(await store.costSince(new Date(Date.now() - 86400000)), 0.04, 'repeat status polling must not double-count or reapply the final cost');
});
