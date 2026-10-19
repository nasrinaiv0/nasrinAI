import { createHash } from 'node:crypto';
import { readLink, checkUrl } from './read-link.js';
import { parseRobots } from '../connect/site-knowledge.js';

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
export function createWebCrawler({ store, readLinkImpl = readLink, logger = null, now = () => Date.now() }) {
  async function enqueue(rawUrls, { priority = 0, source = 'research', depth = 0 } = {}) {
    const urls = [...new Set((Array.isArray(rawUrls) ? rawUrls : [rawUrls]).map(canonicalCrawlUrl).filter(Boolean))].slice(0, 100);
    if (!urls.length || !store?.request) return 0;
    const rows = urls.map((url) => ({ url, url_hash: hash(url), priority: Math.max(0, Math.min(100, Number(priority) || 0)), source, depth: Math.max(0, Math.min(8, Number(depth) || 0)), next_crawl_at: nowIso() }));
    try {
      await store.request('POST', 'web_crawl_queue?on_conflict=url_hash', { body: rows, prefer: 'resolution=merge-duplicates,return=minimal' });
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
        if ((job.depth || 0) < 3) await enqueue(assets.links, { source: 'discovered', depth: (job.depth || 0) + 1 });
        results.push({ url: doc.url, status: 'indexed', changed: previousHash !== contentHash, links_discovered: assets.links.length, media_indexed: assets.media.length });
      } catch (err) {
        logger?.warn?.('web crawl page failed', { url: String(job.url).slice(0, 500), error: err?.message });
        try { await store.request('PATCH', 'web_crawl_queue?id=eq.' + encodeURIComponent(job.id), { body: { status: 'retry', attempts: (job.attempts || 0) + 1, last_error: String(err?.message || 'crawl failed').slice(0, 160), next_crawl_at: new Date(now() + Math.min(86400000, 60000 * (2 ** Math.min(10, job.attempts || 0)))).toISOString() } }); } catch {}
        results.push({ url: String(job.url).slice(0, 500), status: 'retry' });
      }
    }
    return { processed: results.length, results };
  }

  async function search(query, { limit = 5 } = {}) {
    const words = String(query || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2).slice(0, 8);
    if (!words.length) return [];
    const or = words.map((w) => 'text_content.ilike.*' + encodeURIComponent(w.replace(/[%_*(),]/g, '')) + '*').join(',');
    const rows = await store.request('GET', 'web_crawl_pages?select=url,title,text_content,media,fetched_at&or=(' + or + ')&order=fetched_at.desc&limit=' + Math.max(1, Math.min(10, limit)));
    return (rows || []).map((r) => ({ url: r.url, title: r.title, text: String(r.text_content || '').slice(0, 4000), media: r.media || [], fetched_at: r.fetched_at }));
  }

  return Object.freeze({ enqueue, processBatch, search });
}
