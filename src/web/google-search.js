// Optional Google Programmable Search adapter. Uses the official Custom Search JSON API;
// never scrapes Google's HTML results page or bypasses access controls.
const ENDPOINT = 'https://customsearch.googleapis.com/customsearch/v1';
const clean = (value, max = 600) => String(value || '').replace(/[\\u0000-\\u001f\\u007f]/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, max);

export function createGoogleWebSearch({ apiKey = '', engineId = '', fetchImpl = fetch, timeoutMs = 6500 } = {}) {
  const key = String(apiKey || '').trim();
  const cx = String(engineId || '').trim();
  return {
    available: Boolean(key && cx),
    async search(rawQuery) {
      if (!key || !cx) return [];
      const query = clean(rawQuery, 180);
      if (query.length < 2) return [];
      const url = new URL(ENDPOINT);
      url.search = new URLSearchParams({ key, cx, q: query, num: '10', safe: 'active' }).toString();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { method: 'GET', signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) return [];
        const data = await response.json();
        const seen = new Set();
        return (Array.isArray(data?.items) ? data.items : []).flatMap((item) => {
          let parsed;
          try { parsed = new URL(item?.link || ''); } catch { return []; }
          if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return [];
          const normalized = parsed.href;
          if (seen.has(normalized)) return [];
          seen.add(normalized);
          return [{
            url: normalized,
            title: clean(item?.title, 240),
            snippet: clean(item?.snippet, 600),
            displayLink: clean(item?.displayLink, 120)
          }];
        }).slice(0, 10);
      } catch {
        return [];
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
