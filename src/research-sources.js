// Extensible provider-agnostic discovery adapters. Results are candidates, not verified facts.
const TIMEOUT_MS = 4000;
const RETRIES = 2;
const CROSSREF = 'https://api.crossref.org/works';
const clean = (s, n = 300) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
function normalize(raw, adapter) {
  let url; try { url = new URL(String(raw?.url || raw?.URL || '')); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) return null;
  if (url.protocol === 'http:') url.protocol = 'https:';
  return { url: url.href, title: clean(Array.isArray(raw?.title) ? raw.title[0] : (raw?.title || raw?.name)), adapter, source_type: clean(raw?.source_type || 'web', 40), metadata: raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : {} };
}
async function attempt(fn, timeoutMs, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => fn(controller.signal)),
      new Promise((_, reject) => { timer = setTimeout(() => { const error = new Error('adapter timeout'); controller.abort(error); reject(error); }, timeoutMs); })
    ]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
async function resilient(fn, { timeoutMs = TIMEOUT_MS, attempts = RETRIES, signal } = {}) {
  let error; for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) throw signal.reason || new Error('aborted');
    try { return await attempt(fn, timeoutMs, signal); } catch (e) { error = e; if (signal?.aborted) break; }
  } throw error || new Error('adapter failed');
}
const DOI = /\b(10\.\d{4,9}\/[^\s"<>]+)/i;
export function createResearchSourceRegistry({ webSearch = null, fetchImpl = globalThis.fetch, logger = null } = {}) {
  const adapters = new Map();
  function register(adapter) {
    if (!adapter || typeof adapter.id !== 'string' || !adapter.id.trim() || typeof adapter.discover !== 'function') throw new TypeError('A research source adapter needs an id and discover()');
    if (adapters.has(adapter.id)) throw new Error('Research source adapter already registered: ' + adapter.id);
    adapters.set(adapter.id, Object.freeze({ timeoutMs: TIMEOUT_MS, maxCandidates: 8, ...adapter }));
    return () => adapters.delete(adapter.id);
  }
  register({ id: 'web-search', kinds: ['web', 'technical-docs', 'industry-reports'], enabled: () => Boolean(webSearch), async discover({ searchQueries, signal }) {
    if (!webSearch) return [];
    const results = await Promise.all(searchQueries.map((query) => resilient((innerSignal) => webSearch.search({
      system: 'Find public sources relevant to the research question. Prefer official technical documentation and standards for technical topics; primary company filings and credible reports for industry topics; peer-reviewed research for academic topics. Return citations only. Do not access restricted pages.',
      messages: [{ role: 'user', content: query }], maxTokens: 500, signal: innerSignal
    }), { signal })));
    return results.flatMap((r) => r?.citations || []).map((c) => ({ url: c.url, title: c.title || '', source_type: 'web', metadata: { citation_source: 'web-search' } }));
  } });
  register({ id: 'crossref', kinds: ['academic', 'doi-metadata'], timeoutMs: 3500, maxCandidates: 5, enabled: ({ query }) => Boolean(fetchImpl) && DOI.test(query), async discover({ query, signal }) {
    const match = DOI.exec(String(query || ''));
    const doi = match ? match[1].replace(/[.,;)]+$/, '') : '';
    if (!fetchImpl || !doi) return [];
    const data = await resilient(async (innerSignal) => {
      const url = new URL(CROSSREF + '/' + encodeURIComponent(doi));
      const response = await fetchImpl(url, { method: 'GET', signal: innerSignal, headers: { Accept: 'application/json', 'User-Agent': 'NasrinAI/1.0 (https://nasrinai.com)' } });
      if (!response.ok) throw new Error('Crossref HTTP ' + response.status); return response.json();
    }, { timeoutMs: 3500, signal });
    return (data?.message && typeof data.message === 'object' ? [data.message] : []).map((item) => ({
      url: item.URL || (item.DOI ? 'https://doi.org/' + item.DOI : ''),
      title: Array.isArray(item.title) ? item.title[0] : '', source_type: 'scholarly-publication',
      metadata: { doi: item.DOI || null, publisher: item.publisher || null, publication: Array.isArray(item['container-title']) ? item['container-title'][0] : null, year: item.published?.['date-parts']?.[0]?.[0] || null, authors: Array.isArray(item.author) ? item.author.slice(0, 12).map((a) => [a.given, a.family].filter(Boolean).join(' ')) : [] }
    }));
  } });
  return Object.freeze({
    register, list: () => [...adapters.values()].map(({ id, kinds = [] }) => ({ id, kinds: [...kinds] })),
    async discover({ query, plan, signal } = {}) {
      const searchQueries = Array.isArray(plan?.searchQueries) && plan.searchQueries.length ? plan.searchQueries.slice(0, 3) : [String(query || '')];
      const results = await Promise.all([...adapters.values()].map(async (adapter) => {
        try {
          if (adapter.enabled && !adapter.enabled({ query, plan })) return { adapter: adapter.id, candidates: [] };
          const found = await resilient((innerSignal) => adapter.discover({ query, searchQueries, plan, signal: innerSignal }), { timeoutMs: adapter.timeoutMs, attempts: adapter.attempts || RETRIES, signal });
          const candidates = []; const seen = new Set();
          for (const raw of Array.isArray(found) ? found : []) { const item = normalize(raw, adapter.id); if (!item || seen.has(item.url)) continue; seen.add(item.url); candidates.push(item); if (candidates.length >= adapter.maxCandidates) break; }
          return { adapter: adapter.id, candidates };
        } catch (error) { logger?.warn?.('research source adapter failed', { adapter: adapter.id, error: String(error?.message || error).slice(0, 160) }); return { adapter: adapter.id, candidates: [], error: 'source_unavailable' }; }
      }));
      const seen = new Set(), candidates = [];
      for (const result of results) for (const candidate of result.candidates) if (!seen.has(candidate.url)) { seen.add(candidate.url); candidates.push(candidate); }
      return { candidates, adapters: results.map(({ adapter, candidates: items, error }) => ({ id: adapter, status: error ? 'unavailable' : items.length ? 'ok' : 'no_results', candidates: items.length })) };
    }
  });
}