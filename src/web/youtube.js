const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const YOUTUBE_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';
const YOUTUBE_PLAYLIST_URL = 'https://www.googleapis.com/youtube/v3/playlistItems';
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const LATEST = /\b(latest|newest|most recent|recent|just (?:uploaded|posted|released|dropped)|last upload|new upload|new video)\b/i;
const FILLER = /\b(?:what(?:'s| is)?|whats|show|me|give|find|play|watch|see|the|a|an|of|from|by|on|in|at|for|to|please|can|you|latest|newest|most|recent|just|uploaded|posted|released|dropped|last|new|upload|uploads|video|videos|vid|vids|youtube|yt|channel|official)\b/gi;

// "mr beast latest video" -> { latest: true, name: 'mr beast' }. A name is required to
// look up one channel's uploads; without one the search is just newest-first.
export function youtubeIntent(rawQuery) {
  const query = String(rawQuery || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 180);
  const latest = LATEST.test(query) && /\b(videos?|vids?|uploads?|youtube|yt|channel)\b/i.test(query);
  const name = query.replace(FILLER, ' ').replace(/[^\p{L}\p{N}\s'&.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return { query, latest, name: name.length >= 2 ? name : '' };
}

export function createYouTubeSearch({ apiKey = '', fetchImpl = fetch, timeoutMs = 7000, now = () => Date.now() } = {}) {
  const key = String(apiKey || '').trim();
  // Short in-memory caches keep the daily YouTube quota for real questions:
  // the chat answer and the video cards ask for the same thing a moment apart.
  const channelCache = new Map();   // normalized name -> { at, channel }
  const resultCache = new Map();    // normalized query -> { at, value }
  const CHANNEL_TTL = 24 * 3600_000;
  const RESULT_TTL = 5 * 60_000;
  const remember = (map, k, v) => { if (map.size >= 200) map.delete(map.keys().next().value); map.set(k, v); };

  async function getJson(url, signal) {
    const response = await fetchImpl(url, { method: 'GET', signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    return response.json();
  }
  const qs = (base, params) => { const u = new URL(base); u.search = new URLSearchParams(params).toString(); return u; };

  function toVideo(id, snippet) {
    if (!VIDEO_ID.test(id) || !snippet?.title || !snippet?.channelTitle) return null;
    if (snippet.liveBroadcastContent === 'upcoming') return null;
    const thumbnails = snippet.thumbnails || {};
    const thumbnail = [thumbnails.medium, thumbnails.high, thumbnails.default].find((t) => String(t?.url || '').startsWith('https://'));
    return {
      id,
      title: String(snippet.title).slice(0, 240),
      channelTitle: String(snippet.channelTitle).slice(0, 120),
      description: String(snippet.description || '').slice(0, 400),
      publishedAt: /^\d{4}-\d\d-\d\dT/.test(String(snippet.publishedAt || '')) ? snippet.publishedAt : null,
      thumbnailUrl: thumbnail ? thumbnail.url : null,
      watchUrl: 'https://www.youtube.com/watch?v=' + id,
      embedUrl: 'https://www.youtube-nocookie.com/embed/' + id
    };
  }

  // Search results can include removed, private, or non-embeddable videos.
  // Verify embed permission before presenting an iframe, otherwise users
  // see YouTube's "Video unavailable" screen inside the chat.
  async function embeddableIds(ids, signal) {
    const data = await getJson(qs(YOUTUBE_VIDEOS_URL, { key, part: 'status,contentDetails', id: ids.join(',') }), signal);
    if (!data) return null;
    return new Set((Array.isArray(data.items) ? data.items : [])
      .filter((item) => {
        if (item?.status?.embeddable !== true) return false;
        if (!['public', 'unlisted'].includes(String(item?.status?.privacyStatus || ''))) return false;
        const restriction = item?.contentDetails?.regionRestriction;
        if (Array.isArray(restriction?.blocked) && restriction.blocked.includes('PH')) return false;
        if (Array.isArray(restriction?.allowed) && !restriction.allowed.includes('PH')) return false;
        return true;
      })
      .map((item) => String(item.id || ''))
      .filter((id) => VIDEO_ID.test(id)));
  }

  // The newest uploads of one channel, newest first, straight from its uploads list
  // (not a relevance search, which returns old popular videos).
  async function latestFor(intent, signal) {
    const cacheKey = intent.name.toLowerCase();
    let channel = channelCache.get(cacheKey);
    if (!channel || now() - channel.at > CHANNEL_TTL) {
      const found = await getJson(qs(YOUTUBE_SEARCH_URL, { key, part: 'snippet', type: 'channel', maxResults: '1', q: intent.name }), signal);
      const id = String(found?.items?.[0]?.id?.channelId || '');
      if (!CHANNEL_ID.test(id)) return null;
      const details = await getJson(qs(YOUTUBE_CHANNELS_URL, { key, part: 'contentDetails,snippet', id }), signal);
      const item = details?.items?.[0];
      const uploads = String(item?.contentDetails?.relatedPlaylists?.uploads || '');
      if (!/^[A-Za-z0-9_-]{10,60}$/.test(uploads)) return null;
      channel = { at: now(), id, uploads, title: String(item?.snippet?.title || found.items[0].snippet?.channelTitle || '').slice(0, 120) };
      remember(channelCache, cacheKey, channel);
    }
    const list = await getJson(qs(YOUTUBE_PLAYLIST_URL, { key, part: 'snippet', playlistId: channel.uploads, maxResults: '8' }), signal);
    const candidates = (Array.isArray(list?.items) ? list.items : []).flatMap((item) => {
      const snippet = item?.snippet || {};
      const video = toVideo(String(snippet.resourceId?.videoId || ''), { ...snippet, channelTitle: snippet.videoOwnerChannelTitle || snippet.channelTitle || channel.title });
      return video ? [video] : [];
    }).sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
    if (!candidates.length) return null;
    const ok = await embeddableIds(candidates.slice(0, 5).map((v) => v.id), signal);
    const videos = ok ? candidates.slice(0, 5).filter((v) => ok.has(v.id)) : [];
    // `newest` is the channel's real newest upload even when it cannot be embedded.
    return { available: true, latest: true, channel: channel.title, newest: candidates[0], videos };
  }

  return {
    available: Boolean(key),
    async verify(rawId) {
      const id = String(rawId || '');
      if (!key || !VIDEO_ID.test(id)) return false;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const data = await getJson(qs(YOUTUBE_VIDEOS_URL, { key, part: 'status', id }), controller.signal);
        return (Array.isArray(data?.items) ? data.items : []).some((item) =>
          item?.id === id && item?.status?.embeddable === true && item?.status?.privacyStatus !== 'private');
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    },
    async search(rawQuery) {
      if (!key) return { available: false, videos: [] };
      const intent = youtubeIntent(rawQuery);
      const query = intent.query;
      if (query.length < 2) return { available: true, videos: [] };
      const cacheKey = query.toLowerCase();
      const hit = resultCache.get(cacheKey);
      if (hit && now() - hit.at < RESULT_TTL) return hit.value;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let value = null;
        // "<channel> latest video": that channel's newest uploads, newest first.
        if (intent.latest && intent.name) value = await latestFor(intent, controller.signal).catch(() => null);
        if (!value) {
          const data = await getJson(qs(YOUTUBE_SEARCH_URL, {
            key, part: 'snippet', type: 'video', maxResults: '5', safeSearch: 'moderate', regionCode: 'PH', relevanceLanguage: 'en',
            // A "latest" question without a clear channel is still ordered by date, never by popularity.
            order: intent.latest ? 'date' : 'relevance', q: query
          }), controller.signal);
          if (!data) return { available: true, videos: [] };
          const candidates = (Array.isArray(data.items) ? data.items : []).flatMap((item) => {
            const video = toVideo(String(item?.id?.videoId || ''), item?.snippet);
            return video ? [video] : [];
          });
          if (!candidates.length) return { available: true, videos: [] };
          const ok = await embeddableIds(candidates.map((v) => v.id), controller.signal);
          value = { available: true, ...(intent.latest ? { latest: true, channel: '', newest: null } : {}), videos: ok ? candidates.filter((v) => ok.has(v.id)) : [] };
        }
        if (value.videos.length || value.newest) remember(resultCache, cacheKey, { at: now(), value });
        return value;
      } catch {
        return { available: true, videos: [] };
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
