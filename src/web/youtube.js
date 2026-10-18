const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function createYouTubeSearch({ apiKey = '', fetchImpl = fetch, timeoutMs = 7000 } = {}) {
  const key = String(apiKey || '').trim();
  return {
    available: Boolean(key),
    async verify(rawId) {
      const id = String(rawId || '');
      if (!key || !VIDEO_ID.test(id)) return false;
      const url = new URL(YOUTUBE_VIDEOS_URL);
      url.search = new URLSearchParams({ key, part: 'status', id }).toString();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { method: 'GET', signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) return false;
        const data = await response.json();
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
      const query = String(rawQuery || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 180);
      if (query.length < 2) return { available: true, videos: [] };
      const url = new URL(YOUTUBE_SEARCH_URL);
      url.search = new URLSearchParams({
        key,
        part: 'snippet',
        type: 'video',
        maxResults: '5',
        safeSearch: 'moderate',
        order: 'relevance',
        regionCode: 'PH',
        relevanceLanguage: 'en',
        q: query
      }).toString();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { method: 'GET', signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) return { available: true, videos: [] };
        const data = await response.json();
        const candidates = (Array.isArray(data?.items) ? data.items : []).flatMap((item) => {
          const id = String(item?.id?.videoId || '');
          const snippet = item?.snippet || {};
          if (!VIDEO_ID.test(id) || !snippet.title || !snippet.channelTitle) return [];
          const thumbnails = snippet.thumbnails || {};
          const thumbnail = [thumbnails.medium, thumbnails.high, thumbnails.default].find((t) => String(t?.url || '').startsWith('https://'));
          return [{
            id,
            title: String(snippet.title).slice(0, 240),
            channelTitle: String(snippet.channelTitle).slice(0, 120),
            description: String(snippet.description || '').slice(0, 400),
            publishedAt: /^\d{4}-\d\d-\d\dT/.test(String(snippet.publishedAt || '')) ? snippet.publishedAt : null,
            thumbnailUrl: thumbnail ? thumbnail.url : null,
            watchUrl: 'https://www.youtube.com/watch?v=' + id,
            embedUrl: 'https://www.youtube-nocookie.com/embed/' + id
          }];
        });
        if (!candidates.length) return { available: true, videos: [] };

        // Search results can include removed, private, or non-embeddable videos.
        // Verify embed permission before presenting an iframe, otherwise users
        // see YouTube's "Video unavailable" screen inside the chat.
        const statusUrl = new URL(YOUTUBE_VIDEOS_URL);
        statusUrl.search = new URLSearchParams({
          key,
          part: 'status',
          id: candidates.map((video) => video.id).join(',')
        }).toString();
        const statusResponse = await fetchImpl(statusUrl, { method: 'GET', signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!statusResponse.ok) return { available: true, videos: [] };
        const statusData = await statusResponse.json();
        const embeddable = new Set((Array.isArray(statusData?.items) ? statusData.items : [])
          .filter((item) => item?.status?.embeddable === true && item?.status?.privacyStatus !== 'private')
          .map((item) => String(item.id || ''))
          .filter((id) => VIDEO_ID.test(id)));
        return { available: true, videos: candidates.filter((video) => embeddable.has(video.id)) };
      } catch {
        return { available: true, videos: [] };
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
