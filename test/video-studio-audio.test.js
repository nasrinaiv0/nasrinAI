import test from 'node:test';
import assert from 'node:assert/strict';
import { createElevenLabs } from '../src/elevenlabs.js';
import { PLATFORM_TENANT_ID } from '../src/tenants.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

const OTHER_TOKEN = 'other.header.signature';

function fakeElevenLabs() {
  return createElevenLabs({
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      if (url.endsWith('/v1/voices?page_size=100')) {
        return new Response(JSON.stringify({ voices: [{ voice_id: 'voice_123', name: 'Studio Voice', category: 'premade' }] }), {
          status: 200, headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(Buffer.from('fake-mp3-bytes'), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }
  });
}

async function app() {
  const built = buildTestApp({
    env: { PLANS_ENABLED: 'false' },
    elevenlabs: fakeElevenLabs(),
    verifyUser: async (token) => token === USER_TOKEN ? { id: 'user-1' } : token === OTHER_TOKEN ? { id: 'user-2' } : null
  });
  const server = await serve(built.app);
  return { ...built, ...server };
}

test('generated ElevenLabs audio is persisted and remains owner-scoped', async () => {
  const a = await app();
  try {
    const generated = await postJson(a.url + '/v1/video-studio/elevenlabs/voiceover', {
      text: 'A calm ocean at sunrise', voice_id: 'voice_123', model_id: 'eleven_multilingual_v2'
    }, bearer(USER_TOKEN));
    assert.equal(generated.status, 201);
    const { asset } = await generated.json();
    assert.ok(asset.id);
    assert.equal(asset.kind, 'voiceover');
    assert.equal(asset.mime, 'audio/mpeg');
    assert.equal(asset.content_url, '/v1/video-studio/audio-assets/' + asset.id + '/content');

    const listed = await fetch(a.url + '/v1/video-studio/audio-assets', { headers: bearer(USER_TOKEN) });
    assert.equal(listed.status, 200);
    const data = await listed.json();
    assert.equal(data.assets.length, 1);
    assert.equal(data.assets[0].id, asset.id);
    assert.equal(JSON.stringify(data).includes('test-key'), false);
    assert.equal(JSON.stringify(data).includes('storagePath'), false);

    const preview = await fetch(a.url + asset.content_url, { headers: bearer(USER_TOKEN) });
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('content-type'), 'audio/mpeg');
    assert.equal(Buffer.from(await preview.arrayBuffer()).toString(), 'fake-mp3-bytes');

    const foreign = await fetch(a.url + asset.content_url, { headers: bearer(OTHER_TOKEN) });
    assert.equal(foreign.status, 404);
  } finally {
    await a.close();
  }
});

test('audio assets can be placed, moved, and removed from an owned project timeline', async () => {
  const a = await app();
  try {
    const generated = await postJson(a.url + '/v1/video-studio/elevenlabs/sound-effects', {
      prompt: 'Soft cinematic transition whoosh', duration_seconds: 2
    }, bearer(USER_TOKEN));
    assert.equal(generated.status, 201);
    const { asset } = await generated.json();

    const projectResponse = await postJson(a.url + '/v1/projects', { name: 'Video Studio project' }, bearer(USER_TOKEN));
    assert.equal(projectResponse.status, 201);
    const project = await projectResponse.json();

    const added = await postJson(a.url + '/v1/video-studio/timeline', {
      project_id: project.id, audio_asset_id: asset.id, start_seconds: 4.5, gain: 0.8, lane: 2
    }, bearer(USER_TOKEN));
    assert.equal(added.status, 201);
    const { item } = await added.json();
    assert.equal(item.startSeconds, 4.5);
    assert.equal(item.gain, 0.8);
    assert.equal(item.lane, 2);

    const timeline = await fetch(a.url + '/v1/video-studio/timeline?project_id=' + project.id, { headers: bearer(USER_TOKEN) });
    assert.equal(timeline.status, 200);
    assert.equal((await timeline.json()).items.length, 1);

    const moved = await fetch(a.url + '/v1/video-studio/timeline/' + item.id, {
      method: 'PATCH', headers: { ...bearer(USER_TOKEN), 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: project.id, start_seconds: 9 })
    });
    assert.equal(moved.status, 200);
    assert.equal((await moved.json()).item.startSeconds, 9);

    const removed = await fetch(a.url + '/v1/video-studio/timeline/' + item.id + '?project_id=' + project.id, {
      method: 'DELETE', headers: bearer(USER_TOKEN)
    });
    assert.equal(removed.status, 200);
    const empty = await fetch(a.url + '/v1/video-studio/timeline?project_id=' + project.id, { headers: bearer(USER_TOKEN) });
    assert.equal((await empty.json()).items.length, 0);
  } finally {
    await a.close();
  }
});

test('timeline APIs reject foreign projects and invalid placement values', async () => {
  const a = await app();
  try {
    const generated = await postJson(a.url + '/v1/video-studio/elevenlabs/voiceover', {
      text: 'Narration', voice_id: 'voice_123'
    }, bearer(USER_TOKEN));
    const { asset } = await generated.json();

    const projectResponse = await postJson(a.url + '/v1/projects', { name: 'Private project' }, bearer(OTHER_TOKEN));
    assert.equal(projectResponse.status, 201);
    const foreignProject = await projectResponse.json();

    const denied = await postJson(a.url + '/v1/video-studio/timeline', {
      project_id: foreignProject.id, audio_asset_id: asset.id, start_seconds: 0
    }, bearer(USER_TOKEN));
    assert.equal(denied.status, 404);

    const ownProjectResponse = await postJson(a.url + '/v1/projects', { name: 'Own project' }, bearer(USER_TOKEN));
    const ownProject = await ownProjectResponse.json();
    const invalid = await postJson(a.url + '/v1/video-studio/timeline', {
      project_id: ownProject.id, audio_asset_id: asset.id, start_seconds: -1
    }, bearer(USER_TOKEN));
    assert.equal(invalid.status, 400);
  } finally {
    await a.close();
  }
});

test('memory store does not expose audio bytes in asset metadata', async () => {
  const a = await app();
  try {
    const project = await a.store.createProject({ tenantId: PLATFORM_TENANT_ID, userId: 'user-1', name: 'Private' });
    const asset = await a.store.createVideoStudioAudioAsset({
      tenantId: PLATFORM_TENANT_ID, ownerType: 'user', ownerId: 'user-1', projectId: project.id,
      kind: 'voiceover', bytes: Buffer.from('secret-audio'), label: 'Test narration'
    });
    assert.equal(asset.sizeBytes, 12);
    assert.equal('bytes' in asset, false);
    const read = await a.store.readVideoStudioAudioAsset({ tenantId: PLATFORM_TENANT_ID, ownerId: 'user-1', id: asset.id });
    assert.equal(read.bytes.toString(), 'secret-audio');
    assert.equal(await a.store.getVideoStudioAudioAsset({ tenantId: PLATFORM_TENANT_ID, ownerId: 'user-2', id: asset.id }), null);
  } finally {
    await a.close();
  }
});

test('export route combines only the caller-owned project timeline and returns an MP4 download', async () => {
  let input;
  const built = buildTestApp({
    env: { PLANS_ENABLED: 'false' },
    elevenlabs: fakeElevenLabs(),
    videos: { async read(caller, id) { assert.equal(id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); return { bytes: Buffer.from('source-video'), producedSeconds: 2, targetSeconds: 2 }; } },
    videoStudioExporter: { available: true, async exportWithAudio(args) { input = args; return Buffer.from('rendered-mp4'); } },
    verifyUser: async (token) => token === USER_TOKEN ? { id: 'user-1' } : token === OTHER_TOKEN ? { id: 'user-2' } : null
  });
  const a = await serve(built.app);
  try {
    const project = await built.store.createProject({ tenantId: PLATFORM_TENANT_ID, userId: 'user-1', name: 'Export project' });
    const asset = await built.store.createVideoStudioAudioAsset({
      tenantId: PLATFORM_TENANT_ID, ownerType: 'user', ownerId: 'user-1',
      projectId: project.id, kind: 'voiceover', bytes: Buffer.from('audio')
    });
    await built.store.addVideoStudioTimelineItem({
      tenantId: PLATFORM_TENANT_ID, ownerId: 'user-1', projectId: project.id,
      audioAssetId: asset.id, startSeconds: 0.25, trimStartSeconds: 0, trimEndSeconds: null, gain: 1, lane: 1
    });
    const response = await postJson(a.url + '/v1/video-studio/export', {
      video_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', project_id: project.id
    }, bearer(USER_TOKEN));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.equal(response.headers.get('content-disposition'), 'attachment; filename="nasrinai-video-with-audio.mp4"');
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), 'rendered-mp4');
    assert.equal(input.timelineItems.length, 1);
    assert.equal(input.timelineItems[0].startSeconds, 0.25);
    assert.equal(input.audioAssets[0].bytes.toString(), 'audio');
  } finally {
    await a.close();
  }
});

