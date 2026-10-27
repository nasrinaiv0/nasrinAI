import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubeSearch, youtubeIntent } from '../src/web/youtube.js';
import { createFakeProvider } from '../src/ai/fake.js';
import { buildTestApp, serve, bearer, postJson } from './helpers.js';

const CHANNEL = 'UCabcdefghijklmnopqrstuv';
function fakeYouTube(log = []) {
  return async (url) => {
    const u = new URL(url);
    log.push(u.pathname + '?' + [...u.searchParams].filter(([k]) => k !== 'key').map(([k, v]) => k + '=' + v).join('&'));
    if (u.pathname.endsWith('/search') && u.searchParams.get('type') === 'channel') return Response.json({ items: [{ id: { channelId: CHANNEL }, snippet: { channelTitle: 'MrBeast' } }] });
    if (u.pathname.endsWith('/channels')) return Response.json({ items: [{ snippet: { title: 'MrBeast' }, contentDetails: { relatedPlaylists: { uploads: 'UUabcdefghijklmnopqrstuv' } } }] });
    if (u.pathname.endsWith('/playlistItems')) return Response.json({ items: [
      { snippet: { title: 'Old popular video', publishedAt: '2024-01-01T00:00:00Z', videoOwnerChannelTitle: 'MrBeast', resourceId: { videoId: 'OLDvideo001' } } },
      { snippet: { title: 'Brand new video', publishedAt: '2026-10-27T10:00:00Z', videoOwnerChannelTitle: 'MrBeast', resourceId: { videoId: 'NEWvideo002' } } }
    ] });
    if (u.pathname.endsWith('/videos')) return Response.json({ items: [
      { id: 'OLDvideo001', status: { embeddable: true, privacyStatus: 'public' }, contentDetails: {} },
      { id: 'NEWvideo002', status: { embeddable: true, privacyStatus: 'public' }, contentDetails: {} }
    ] });
    return Response.json({ items: [] });
  };
}

test('latest-video intent names the channel and ignores filler words', () => {
  assert.deepEqual(youtubeIntent('mr beast latest video'), { query: 'mr beast latest video', latest: true, name: 'mr beast' });
  assert.equal(youtubeIntent('newest video from Veritasium').name, 'Veritasium');
  assert.equal(youtubeIntent('how to tie a tie').latest, false);
  assert.equal(youtubeIntent('latest news about Japan').latest, false, 'not a video question');
});

test('"latest video" reads the channel uploads newest first, never a popularity search', async () => {
  const log = [];
  const yt = createYouTubeSearch({ apiKey: 'k', fetchImpl: fakeYouTube(log) });
  const r = await yt.search('mr beast latest video');
  assert.equal(r.latest, true);
  assert.equal(r.newest.id, 'NEWvideo002');
  assert.deepEqual(r.videos.map((v) => v.id), ['NEWvideo002', 'OLDvideo001']);
  assert.ok(log.some((l) => l.includes('/playlistItems')));
  assert.ok(!log.some((l) => l.includes('order=relevance')));
  await yt.search('mr beast latest video');
  assert.equal(log.length, 4, 'second identical question is served from the short cache');
});

test('chat answers a latest-video question from YouTube data, not from the model', async () => {
  const provider = createFakeProvider({ reply: () => 'The latest video remains "I Survived 100 Days In A Circle".' });
  const built = buildTestApp({ provider, youtubeSearch: createYouTubeSearch({ apiKey: 'k', fetchImpl: fakeYouTube() }) });
  const srv = await serve(built.app);
  try {
    const g = (await (await fetch(srv.url + '/v1/guest/sessions', { method: 'POST' })).json()).token;
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'mr beast latest video' }, bearer(g))).json();
    assert.match(r.message.content, /Brand new video/);
    assert.match(r.message.content, /watch\?v=NEWvideo002/);
    assert.match(r.message.content, /October 27, 2026/);
    assert.doesNotMatch(r.message.content, /Circle/);
    assert.equal(provider.calls.length, 0, 'the model was not asked');
  } finally { await srv.close(); }
});

test('when the channel cannot be found it says so instead of guessing', async () => {
  const provider = createFakeProvider({ reply: () => 'invented' });
  const yt = createYouTubeSearch({ apiKey: 'k', fetchImpl: async () => Response.json({ items: [] }) });
  const built = buildTestApp({ provider, youtubeSearch: yt });
  const srv = await serve(built.app);
  try {
    const g = (await (await fetch(srv.url + '/v1/guest/sessions', { method: 'POST' })).json()).token;
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'zzqx latest video' }, bearer(g))).json();
    assert.match(r.message.content, /won’t guess/);
    assert.doesNotMatch(r.message.content, /invented/);
  } finally { await srv.close(); }
});
