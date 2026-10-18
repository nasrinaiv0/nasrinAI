const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function createYouTubeSearch({ apiKey = '', fetchImpl = fetch, timeoutMs = 7000 } = {}) {
  const key = String(apiKey || '').trim();
  return {
    available: Boolean(key),
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
        const videos = (Array.isArray(data?.items) ? data.items : []).flatMap((item) => {
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
        return { available: true, videos };
      } catch {
        return { available: true, videos: [] };
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
