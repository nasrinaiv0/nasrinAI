import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVideos } from '../src/videos.js';
import { createBudget } from '../src/ai/budget.js';
import { createMemoryStore } from '../src/store/memory-store.js';
import { testConfig } from './helpers.js';

function service(plan, open = false, maxSeconds = null, providerOverride = null, limiterOverride = null, usageLogOverride = null) {
  const created = [];
  const config = testConfig({ DAILY_BUDGET_USD: '40', WEEKLY_BUDGET_USD: '100', MONTHLY_BUDGET_USD: '300', VIDEO_PER_HOUR: '10', VIDEO_MAX_COST_USD: '100000' });
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
    provider: providerOverride || { id: 'fake-video', model: 'veo-3.1-generate-preview', resolution: '1080p', costPerSecondUsd: 0.05, ...(maxSeconds ? { maxSeconds } : {}), async create() { return { operation: 'fake-op' }; } },
    limiter: limiterOverride || { async signIn() {} },
    usageLog: usageLogOverride,
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



test('Pro video jobs poll and download through the Pro adapter without crossing tiers', async () => {
  const calls = [];
  const makeProvider = (tier) => ({
    id: tier + '-video-provider',
    model: tier + '-video-model',
    resolution: tier === 'pro' ? '480p' : '1080p',
    costPerSecondUsd: 0.05,
    maxSeconds: 8,
    async create() { calls.push(tier + ':create'); return tier + '-operation'; },
    async status(operation) {
      calls.push(tier + ':status:' + operation);
      return { id: tier + '-uri', status: 'completed' };
    },
    extract(result) { return { done: true, failed: false, uri: result.id }; },
    async download(uri) { calls.push(tier + ':download:' + uri); return Buffer.from(tier + '-mp4'); }
  });
  const providers = { pro: makeProvider('pro'), max: makeProvider('max'), ultra: makeProvider('ultra') };
  const { videos, store } = service('pro', false, null, providers);
  const created = await videos.create(caller, body);
  assert.equal(created.status, 'in_progress');
  assert.ok(calls.includes('pro:create'));
  assert.equal(calls.some((call) => call.startsWith('max:') || call.startsWith('ultra:')), false);

  const status = await videos.status(caller, created.video_id);
  assert.equal(status.status, 'completed');
  assert.ok(calls.includes('pro:status:pro-operation'));
  assert.ok(calls.includes('pro:download:pro-uri'));
  assert.equal(calls.some((call) => call.startsWith('max:') || call.startsWith('ultra:')), false);

  await store.updateVideo(created.video_id, { bytes: null });
  const content = await videos.read(caller, created.video_id);
  assert.equal(content.bytes.toString(), 'pro-mp4');
  assert.ok(calls.includes('pro:download:pro-uri'));
});

test('video creation defaults to the configured provider clip limit when duration is omitted', async () => {
  const { videos, created } = service('max', false, 8);
  const result = await videos.create(caller, body);
  assert.equal(result.status, 'in_progress');
  assert.equal(result.target_seconds, 8);
  assert.equal(created[0].targetSeconds, 8);
});



test('two-second video requests preserve the requested duration through validation and creation', async () => {
  const calls = [];
  const provider = {
    id: 'openrouter', model: 'configured/video', maxSeconds: 8,
    allowedResolutions: ['480p', '360p'], allowedFrameRates: [30],
    async validateOptions(options) {
      calls.push(['validate', options.duration, options.requestedResolution, options.fps]);
      assert.equal(options.duration, 2);
      assert.equal(options.aspectRatio, '16:9');
      return true;
    },
    async create(options) {
      calls.push(['create', options.seconds, options.requestedResolution, options.fps]);
      return 'two-second-job';
    }
  };
  const { videos, created } = service('pro', false, null, provider);
  const result = await videos.create(caller, { prompt: 'A kid laughing', seconds: 2 });
  assert.equal(result.status, 'in_progress');
  assert.equal(result.target_seconds, 2);
  assert.equal(created[0].targetSeconds, 2);
  assert.deepEqual(calls.at(-1), ['create', 2, '480p', 30]);
  assert.ok(calls.some((call) => call[0] === 'validate' && call[1] === 2));
});

test('OpenRouter quality exhaustion returns a capability error, not a misleading plan error', async () => {
  const provider = {
    id: 'openrouter', model: 'configured/video', maxSeconds: 8,
    allowedResolutions: ['480p', '360p'], allowedFrameRates: [30],
    async validateOptions() { throw Object.assign(new Error('unsupported combination'), { code: 'capability_mismatch' }); },
    async create() { throw new Error('must not create unsupported jobs'); }
  };
  const { videos, created } = service('pro', false, null, provider);
  await assert.rejects(() => videos.create(caller, { prompt: 'A kid laughing', seconds: 2 }), (err) => {
    assert.equal(err.status, 503);
    assert.equal(err.code, 'video_capability_unavailable');
    assert.match(err.message, /No available video model supports this duration and quality/);
    return true;
  });
  assert.equal(created.length, 0);
});

test('completed OpenRouter video records provider-reported usage cost without a local estimate', async () => {
  const provider = {
    id: 'openrouter', model: 'provider/video', resolution: '720p', maxSeconds: 8,
    async getCostPerSecondUsd() { return 0.08; },
    async create() { return 'job-video-123'; },
    async status() { return { id: 'job-video-123', status: 'completed', usage: { cost: 0.04 } }; },
    extract(result) { return { done: true, failed: false, uri: result.id, actualCostUsd: result.usage?.cost ?? null }; },
    async download() { return Buffer.from('fake-mp4'); }
  };
  const usageEvents = [];
  const { videos, created, store } = service('max', false, 8, provider, null, { async record(_caller, event) { usageEvents.push(event); } });
  const createdResult = await videos.create(caller, body);
  assert.equal(createdResult.status, 'in_progress');
  const before = await store.getVideo({ tenantId: caller.tenantId, ownerType: 'user', ownerId: caller.actor.id, id: createdResult.video_id });
  assert.equal(before.estimatedCostUsd, null);
  assert.equal(before.spendReservationId, null);

  const status = await videos.status(caller, createdResult.video_id);
  assert.equal(status.status, 'completed');
  const completed = await store.getVideo({ tenantId: caller.tenantId, ownerType: 'user', ownerId: caller.actor.id, id: createdResult.video_id });
  assert.equal(completed.actualCostUsd, 0.04);
  assert.ok(completed.costReconciledAt);
  assert.deepEqual(usageEvents.filter((event) => event.task === 'video_cost_reconciliation').map((event) => [event.costUsd, event.costSource]), [[0.04, 'provider_reported']]);
  assert.equal(await store.costSince(new Date(Date.now() - 86400000)), 0, 'provider cost is not inserted into the local spend ledger');

  await videos.status(caller, createdResult.video_id);
  assert.equal(usageEvents.filter((event) => event.task === 'video_cost_reconciliation').length, 1, 'repeated status polling must not duplicate provider cost telemetry');
  assert.equal(await store.costSince(new Date(Date.now() - 86400000)), 0, 'repeat status polling must not invent or double-count provider spend');
});


test('Ultra 4K add-on uses plan capability without local cost deltas or token surcharges', async () => {
  const tokenCalls = [];
  const provider = {
    id: 'openrouter', model: 'provider/video-4k', tier: 'ultra', resolution: '1080p',
    allow4kAddon: true, maxSeconds: 8,
    async getCostPerSecondUsd({ requestedResolution }) {
      return requestedResolution === '4k' ? 0.20 : 0.10;
    },
    async create({ requestedResolution }) { assert.equal(requestedResolution, '4k'); return { operation: '4k-op' }; }
  };
  const limiter = {
    async signIn() {},
    async reserveTokens(caller, tokens) { tokenCalls.push(['reserve', tokens]); return { id: 'token-reservation', reservedTokens: tokens }; },
    async settleTokens(reservation, tokens) { tokenCalls.push(['settle', tokens]); },
    async releaseTokens(reservation) { tokenCalls.push(['release']); }
  };
  const { videos, created } = service('ultra', false, null, provider, limiter);
  const result = await videos.create(caller, { prompt: 'Ultra 4K test', resolution: '4k' });
  assert.equal(result.status, 'in_progress');
  assert.deepEqual(tokenCalls, [], 'video seconds and provider spend—not token surcharges—govern video usage');
  assert.equal(created[0].resolution, '4k');
  assert.equal(created[0].addonTokens, 0);
  assert.equal(created[0].addonCostUsd, null, 'no local 4K cost estimate is written');
});

test('4K add-on is capability-gated rather than price-gated', async () => {
  let called = false;
  const provider = {
    id: 'openrouter', model: 'provider/video', tier: 'ultra', resolution: '1080p',
    allow4kAddon: true, maxSeconds: 8,
    async create({ requestedResolution }) { called = true; assert.equal(requestedResolution, '4k'); return 'job-4k'; }
  };
  const { videos, created } = service('ultra', false, null, provider, { async signIn() {} });
  const result = await videos.create(caller, { prompt: 'Provider billed 4K', resolution: '4k' });
  assert.equal(result.status, 'in_progress');
  assert.equal(called, true);
  assert.equal(created[0].addonCostUsd, null);
});
