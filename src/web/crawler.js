import { createHash } from 'node:crypto';
import { readLink, checkUrl } from './read-link.js';
import { parseRobots } from '../connect/site-knowledge.js';
import { PROGRAMMING_DOC_HOSTS } from '../knowledge/programming-context.js';

const MAX_PAGE_CHARS = 20000;
const MAX_LINKS = 40;
const MAX_MEDIA = 30;
const nowIso = () => new Date().toISOString();
const hash = (s) => createHash('sha256').update(String(s || '')).digest('hex');
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

export function extractWebAssets(html, baseUrl) {
  const links = new Set();
  const media = [];
  const addLink = (raw) => {
    try {
      const u = checkUrl(new URL(decode(raw), baseUrl).href);
      if (u && !/\.(?:pdf|zip|exe|dmg|apk|woff2?|ttf)(?:$|\?)/i.test(u.href)) links.add(u.href);
    } catch {}
  };
  const addMedia = (raw, kind, alt = '') => {
    try {
      const u = checkUrl(new URL(decode(raw), baseUrl).href);
      if (u && media.length < MAX_MEDIA && !media.some((m) => m.url === u.href)) media.push({ url: u.href, kind, alt: String(alt).slice(0, 240) });
    } catch {}
  };
  for (const m of String(html || '').matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi)) addLink(m[1]);
  for (const m of String(html || '').matchAll(/<(img|video|audio|source|track)\b([^>]*)>/gi)) {
    const tag = m[1].toLowerCase(), attrs = m[2];
    const src = /\b(?:src|poster)\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    const alt = /\b(?:alt|title|aria-label)\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] || '';
    if (src) addMedia(src, tag === 'img' ? 'image' : tag === 'audio' ? 'audio' : tag === 'track' ? 'transcript' : 'video', alt);
    const srcset = /\bsrcset\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (tag === 'img' && srcset) for (const part of srcset.split(',')) addMedia(part.trim().split(/\s+/)[0], 'image', alt);
  }
  return { links: [...links].slice(0, MAX_LINKS), media };
}

export function canonicalCrawlUrl(raw) {
  const u = checkUrl(raw);
  if (!u) return null;
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.href;
}

// Persistent, bounded public-web crawler. It indexes text and media metadata;
// it does not download media binaries or execute page JavaScript.
export function createWebCrawler({ store, readLinkImpl = readLink, logger = null, embedder = null, now = () => Date.now() }) {
  async function enqueue(rawUrls, { priority = 0, source = 'research', depth = 0, ignoreExisting = false } = {}) {
    const urls = [...new Set((Array.isArray(rawUrls) ? rawUrls : [rawUrls]).map(canonicalCrawlUrl).filter(Boolean))].slice(0, 100);
    if (!urls.length || !store?.request) return 0;
    const rows = urls.map((url) => ({ url, url_hash: hash(url), priority: Math.max(0, Math.min(100, Number(priority) || 0)), source, depth: Math.max(0, Math.min(8, Number(depth) || 0)), next_crawl_at: nowIso() }));
    try {
      await store.request('POST', 'web_crawl_queue?on_conflict=url_hash', { body: rows, prefer: (ignoreExisting ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates') + ',return=minimal' });
      return urls.length;
    } catch (err) { logger?.warn?.('web crawl enqueue failed', { error: err?.message }); return 0; }
  }

  async function processBatch({ limit = 5 } = {}) {
    if (!store?.request) throw new Error('persistent crawler store unavailable');
    const bounded = Math.max(1, Math.min(10, Number(limit) || 5));
    // SKIP LOCKED in the RPC makes multiple cron invocations safe.
    const jobs = await store.request('POST', 'rpc/claim_web_crawl_jobs', { body: { p_limit: bounded } });
    const results = [];
    for (const job of Array.isArray(jobs) ? jobs : []) {
      try {
        const pageUrl = canonicalCrawlUrl(job.url);
        if (!pageUrl) throw new Error('unsafe URL');
        const origin = new URL(pageUrl).origin;
        const robots = await readLinkImpl(origin + '/robots.txt', { maxChars: 50000 });
        if (!robots?.error && typeof robots?.text === 'string' && !parseRobots(robots.text).allows(new URL(pageUrl).pathname + new URL(pageUrl).search)) {
          await store.request('PATCH', 'web_crawl_queue?id=eq.' + encodeURIComponent(job.id), { body: { status: 'robots_denied', last_crawled_at: nowIso(), next_crawl_at: new Date(now() + 7 * 86400000).toISOString(), last_error: 'robots exclusion' } });
          results.push({ url: pageUrl, status: 'robots_denied' }); continue;
        }
        const page = await readLinkImpl(pageUrl, { maxChars: MAX_PAGE_CHARS, withHtml: true });
        if (page.error) throw new Error(page.error);
        const assets = extractWebAssets(page.html || '', page.url || pageUrl);
        const contentHash = hash(page.text);
        const pageHash = hash(pageUrl);
        // Compare with the persisted page index, not the queue row (the queue
        // intentionally stores scheduling state and has no content_hash).
        const previousRows = await store.request('GET', 'web_crawl_pages?select=content_hash&url_hash=eq.' + pageHash + '&limit=1');
        const previousHash = Array.isArray(previousRows) ? previousRows[0]?.content_hash : null;
        const doc = {
          url: page.url || pageUrl, url_hash: pageHash, title: String(page.title || '').slice(0, 200),
          text_content: String(page.text || '').slice(0, MAX_PAGE_CHARS), content_hash: contentHash,
          media: assets.media, fetched_at: nowIso(), updated_at: nowIso()
        };
        await store.request('POST', 'web_crawl_pages?on_conflict=url_hash', { body: doc, prefer: 'resolution=merge-duplicates,return=minimal' });
        const next = new Date(now() + (job.depth > 2 ? 7 : 2) * 86400000).toISOString();
        await store.request('PATCH', 'web_crawl_queue?id=eq.' + encodeURIComponent(job.id), {
          body: { status: 'indexed', last_crawled_at: nowIso(), next_crawl_at: next, last_error: null, depth: job.depth || 0 },
          prefer: 'return=minimal'
        });
        if ((job.depth || 0) < 3) {
          // Official learning seeds may only expand within their own host. Keep
          // the owner_seed label on descendants so the same boundary is enforced
          // at every depth; ordinary research crawling keeps its existing policy.
          const seedPage = job.source === 'owner_seed';
          const discovered = seedPage
            ? assets.links.filter((raw) => {
                const next = canonicalCrawlUrl(raw);
                return next && new URL(next).hostname.toLowerCase() === new URL(pageUrl).hostname.toLowerCase();
              })
            : assets.links;
          await enqueue(discovered, {
            source: seedPage ? 'owner_seed' : 'discovered',
            depth: (job.depth || 0) + 1,
            ignoreExisting: seedPage
          });
        }
        results.push({ url: doc.url, status: 'indexed', changed: previousHash !== contentHash, links_discovered: assets.links.length, media_indexed: assets.media.length });
      } catch (err) {
        logger?.warn?.('web crawl page failed', { url: String(job.url).slice(0, 500), error: err?.message });
        try { await store.request('PATCH', 'web_crawl_queue?id=eq.' + encodeURIComponent(job.id), { body: { status: 'retry', attempts: (job.attempts || 0) + 1, last_error: String(err?.message || 'crawl failed').slice(0, 160), next_crawl_at: new Date(now() + Math.min(86400000, 60000 * (2 ** Math.min(10, job.attempts || 0)))).toISOString() } }); } catch {}
        results.push({ url: String(job.url).slice(0, 500), status: 'retry' });
      }
    }
    return { processed: results.length, results };
  }

  async function indexSemanticPages({ limit = 5 } = {}) {
    if (process.env.SEMANTIC_KNOWLEDGE_ENABLED !== 'true' || !embedder?.embed || !store?.request) {
      return { enabled: false, indexed_pages: 0, indexed_chunks: 0, skipped_unchanged: 0, embedding_failures: 0 };
    }
    const pages = await store.request('GET', 'web_crawl_pages?select=url,title,text_content,content_hash,fetched_at&order=fetched_at.desc&limit=' + Math.max(1, Math.min(5, Number(limit) || 5)));
    const totals = { enabled: true, indexed_pages: 0, indexed_chunks: 0, skipped_unchanged: 0, embedding_failures: 0 };
    const maxEmbeddings = Math.max(1, Math.min(10, Number(process.env.SEMANTIC_MAX_EMBEDDINGS_PER_RUN) || 10));
    let embeddingCalls = 0;
    for (const page of Array.isArray(pages) ? pages : []) {
      if (embeddingCalls >= maxEmbeddings) break;
      let url;
      try { url = new URL(String(page.url || '')); } catch { continue; }
      if (url.protocol !== 'https:' || url.username || url.password || !page.content_hash || !page.text_content) continue;
      const host = url.hostname.toLowerCase();
      // Only the fixed programming-source catalogue is eligible for global indexing.
      if (!PROGRAMMING_DOC_HOSTS.includes(host)) continue;
      const existing = await store.request('GET', 'public_technical_chunks?select=content_hash,embedding_model&source_url=eq.' + encodeURIComponent(url.href) + '&limit=1').catch(() => []);
      if (Array.isArray(existing) && existing[0]?.content_hash === page.content_hash && existing[0]?.embedding_model === embedder.modelName) { totals.skipped_unchanged++; continue; }
      const raw = String(page.text_content).replace(/\s+/g, ' ').trim();
      const chunkSize = 1400, overlap = 180, maxChunks = 3;
      const chunks = [];
      for (let start = 0; start < raw.length && chunks.length < maxChunks; start += chunkSize - overlap) {
        const chunk = raw.slice(start, start + chunkSize).trim();
        if (chunk.length >= 80) chunks.push(chunk);
      }
      if (!chunks.length) continue;
      // Avoid deleting a previous complete index unless this whole page fits in
      // the remaining per-run embedding budget.
      if (embeddingCalls + chunks.length > maxEmbeddings) break;
      if (Array.isArray(existing) && existing.length) {
        await store.request('DELETE', 'public_technical_chunks?source_url=eq.' + encodeURIComponent(url.href), { prefer: 'return=minimal' }).catch(() => {});
      }
      let wrote = false;
      for (let i = 0; i < chunks.length && embeddingCalls < maxEmbeddings; i++) {
        try {
          embeddingCalls++;
          const vector = await embedder.embed(String(page.title || '') + '\n' + chunks[i]);
          const row = {
            source_url: url.href, source_host: host, title: String(page.title || host).slice(0, 200),
            chunk_index: i, content: chunks[i].slice(0, 5000), content_hash: page.content_hash,
            embedding: '[' + vector.join(',') + ']', embedding_model: embedder.modelName,
            fetched_at: page.fetched_at || nowIso(), indexed_at: nowIso()
          };
          await store.request('POST', 'public_technical_chunks?on_conflict=source_url,chunk_index', {
            body: row, prefer: 'resolution=merge-duplicates,return=minimal'
          });
          totals.indexed_chunks++; wrote = true;
        } catch (err) {
          totals.embedding_failures++;
          logger?.warn?.('semantic knowledge chunk indexing failed', { host, code: String(err?.status || err?.code || 'index_failed').slice(0, 40) });
        }
      }
      if (wrote) totals.indexed_pages++;
    }
    return totals;
  }

  async function search(query, { limit = 5, allowedHosts = null } = {}) {
    const boundedLimit = Math.max(1, Math.min(5, Number(limit) || 5));
    const allowedHostList = allowedHosts === null ? null : [...new Set([...allowedHosts].map((host) => String(host || '').toLowerCase()).filter((host) => /^[a-z0-9.-]{1,253}$/.test(host)))];
    if (process.env.SEMANTIC_KNOWLEDGE_ENABLED === 'true' && embedder?.embed && allowedHostList?.length) {
      try {
        const embedding = await embedder.embed(String(query || '').slice(0, 2000));
        const rows = await store.request('POST', 'rpc/match_public_technical_chunks', {
          body: { query_embedding: '[' + embedding.join(',') + ']', allowed_hosts: allowedHostList, match_model: embedder.modelName, match_count: boundedLimit }
        });
        const trusted = (Array.isArray(rows) ? rows : []).filter((row) => {
          try { const u = new URL(String(row.source_url || '')); return u.protocol === 'https:' && !u.username && !u.password && allowedHostList.includes(u.hostname.toLowerCase()) && String(row.embedding_model || '') === embedder.modelName; } catch { return false; }
        }).slice(0, boundedLimit).map((row) => ({ url: row.source_url, title: row.title, text: row.content, fetched_at: row.fetched_at, similarity: Number(row.similarity) }));
        if (trusted.length) return trusted;
      } catch (err) {
        logger?.warn?.('semantic knowledge retrieval fell back to keyword search', { code: String(err?.status || err?.code || 'semantic_unavailable').slice(0, 40) });
      }
    }
    const words = [...new Set(String(query || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2 && w.length <= 48))].slice(0, 8);
    if (!words.length || !store?.request) return [];
    const safeWords = words.map((w) => w.replace(/[%_*(),]/g, '')).filter(Boolean);
    if (!safeWords.length) return [];
    const or = safeWords.map((w) => 'text_content.ilike.*' + encodeURIComponent(w) + '*').join(',');
    const hosts = allowedHosts === null ? null : new Set(
      [...allowedHosts].map((host) => String(host || '').toLowerCase()).filter((host) => /^[a-z0-9.-]{1,253}$/.test(host))
    );
    if (hosts && !hosts.size) return [];
    // Over-fetch a bounded candidate set, then filter trusted hosts and rank by
    // term overlap locally so recent unrelated pages cannot crowd out evidence.
    const fetchLimit = Math.max(10, Math.min(100, (Math.max(1, Math.min(10, Number(limit) || 5)) * 10)));
    const rows = await store.request('GET', 'web_crawl_pages?select=url,title,text_content,media,fetched_at&or=(' + or + ')&order=fetched_at.desc&limit=' + fetchLimit);
    const candidates = [];
    for (const r of Array.isArray(rows) ? rows : []) {
      let url;
      try { url = new URL(String(r.url || '')); } catch { continue; }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
      if (hosts && (url.protocol !== 'https:' || !hosts.has(url.hostname.toLowerCase()))) continue;
      const title = String(r.title || '').slice(0, 200);
      const text = String(r.text_content || '').slice(0, 4000);
      const searchable = (title + ' ' + text).toLowerCase();
      const score = safeWords.reduce((sum, word) => sum + Math.min(3, searchable.split(word).length - 1), 0);
      if (score <= 0) continue;
      candidates.push({ url: url.href, title, text, media: Array.isArray(r.media) ? r.media : [], fetched_at: r.fetched_at, _score: score });
    }
    candidates.sort((a, b) => b._score - a._score || String(b.fetched_at || '').localeCompare(String(a.fetched_at || '')));
    return candidates.slice(0, Math.max(1, Math.min(10, Number(limit) || 5))).map(({ _score, ...row }) => row);
  }

  return Object.freeze({ enqueue, processBatch, search, indexSemanticPages });
}
