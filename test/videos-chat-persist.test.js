import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVideos } from '../src/videos.js';
import { createConversations } from '../src/conversations.js';
import { createMemoryStore } from '../src/store/memory-store.js';
import { testConfig } from './helpers.js';

const caller = { actor: { type: 'user', id: 'user-1' }, tenantId: 'tenant-1' };
const quiet = { info() {}, warn() {}, error() {} };

function setup({ status = 'processing', failSave = false, failStorage = false } = {}) {
  const store = createMemoryStore();
  if (failStorage) store.uploadGeneratedVideo = async () => { throw new Error('storage unavailable'); };
  const config = testConfig({ VIDEO_PER_HOUR: '10' });
  const conversations = createConversations({ store, config, logger: quiet });
  if (failSave) conversations.add = async () => { throw new Error('database down'); };
  const provider = {
    id: 'openrouter', model: 'm', maxSeconds: 8,
    async create() { return 'job-1'; },
    async status(op) { return { id: op, status }; },
    extract(r) { return r.status === 'completed' ? { done: true, failed: false, uri: 'u' } : { done: false, failed: false, uri: null }; },
    async download() { return Buffer.from('mp4'); }
  };
  const videos = createVideos({
    store, conversations, plans: { async current() { return { plan: 'max', open: false }; } }, provider,
    limiter: { async video() {} }, config, logger: quiet
  });
  return { videos, store, conversations, provider };
}

test('a new video starts a saved chat with the request and a video marker', async () => {
  const { videos, store, conversations } = setup();
  const out = await videos.create(caller, { prompt: 'Palawan island', seconds: 2 });
  assert.ok(out.conversation_id, 'the chat id is returned so the browser can keep using it');
  const conv = await conversations.get(caller, out.conversation_id);
  const messages = await conversations.history(conv, 10);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[0].content, 'Create a video: Palawan island');
  assert.equal(messages[1].role, 'assistant');
  assert.ok(messages[1].content.startsWith('[genvideo:' + out.video_id + ']'));
  const row = await store.getVideo({ tenantId: 'tenant-1', ownerType: 'user', ownerId: 'user-1', id: out.video_id });
  assert.equal(row.conversationId, out.conversation_id);
});

test('a video in an existing chat is added to that chat', async () => {
  const { videos, conversations } = setup();
  const conv = await conversations.create(caller);
  const out = await videos.create(caller, { prompt: 'Boats', seconds: 2, conversation_id: conv.id });
  assert.equal(out.conversation_id, conv.id);
  assert.equal((await conversations.history(conv, 10)).length, 2);
});

test('failing to save the chat never fails the paid video job', async () => {
  const { videos } = setup({ failSave: true });
  const out = await videos.create(caller, { prompt: 'Palawan island', seconds: 2 });
  assert.equal(out.status, 'in_progress');
  assert.ok(out.video_id);
});

test('storage upload failure keeps a small completed video playable without creating a second job', async () => {
  const { videos, store, provider } = setup({ status: 'completed', failStorage: true });
  const out = await videos.create(caller, { prompt: 'Palawan island', seconds: 2 });
  const status = await videos.status(caller, out.video_id);
  assert.equal(status.status, 'completed');
  const row = await store.getVideo({ tenantId: 'tenant-1', ownerType: 'user', ownerId: 'user-1', id: out.video_id });
  assert.equal(row.storagePath, undefined);
  assert.equal(row.bytes.toString(), 'mp4', 'bounded legacy fallback is retained');
  const content = await videos.read(caller, out.video_id);
  assert.equal(content.bytes.toString(), 'mp4');
});

test('a job that finished at the provider is delivered even after the time limit', async () => {
  const { videos, store } = setup({ status: 'completed' });
  const out = await videos.create(caller, { prompt: 'Palawan island', seconds: 2 });
  await store.updateVideo(out.video_id, { createdAt: new Date(Date.now() - 30 * 60_000).toISOString() });
  const status = await videos.status(caller, out.video_id);
  assert.equal(status.status, 'completed', 'a finished video must not be thrown away because the page was closed');
});

test('a job still running after the time limit still times out', async () => {
  const { videos, store } = setup({ status: 'processing' });
  const out = await videos.create(caller, { prompt: 'Palawan island', seconds: 2 });
  await store.updateVideo(out.video_id, { createdAt: new Date(Date.now() - 30 * 60_000).toISOString() });
  const status = await videos.status(caller, out.video_id);
  assert.equal(status.status, 'failed');
  assert.equal(status.error.code, 'video_job_timeout');
});
