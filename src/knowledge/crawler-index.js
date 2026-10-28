import { createHash } from 'node:crypto';
import { chunkText } from './index.js';
import { PROGRAMMING_DOC_HOSTS } from './programming-context.js';

const TRUSTED_HOSTS = new Set(PROGRAMMING_DOC_HOSTS);
const MAX_PAGE_CHARS = 20000;
const MAX_BATCH = 10;
const PAGE_CANDIDATE_LIMIT = 500;

function safePage(row) {
  let url;
  try { url = new URL(String(row?.url || '')); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || !TRUSTED_HOSTS.has(url.hostname.toLowerCase())) return null;
  const text = String(row.text_content || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, MAX_PAGE_CHARS);
  if (text.length < 80) return null;
  const title = String(row.title || url.hostname).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || url.hostname;
  const sourceUrl = url.href.slice(0, 2000);
  // Bind title, canonical URL, and normalized text so metadata or body changes refresh the managed document.
  const contentHash = createHash('sha256').update(title + '\n' + sourceUrl + '\n' + text).digest('hex');
  const chunks = chunkText(text).filter((chunk) => chunk.trim()).slice(0, 100);
  if (!chunks.length) return null;
  return { title, sourceUrl, contentHash, chars: text.length, chunks };
}

export function createCrawlerKnowledgeIndexer({ store, logger, platformTenantId }) {
  if (!store?.request || !platformTenantId) throw new TypeError('crawler knowledge indexer requires the server store and platform tenant');
  const hostFilter = PROGRAMMING_DOC_HOSTS.map((host) => 'url.ilike.*' + host + '*').join(',');
  return {
    async syncBatch({ limit = 5 } = {}) {
      const max = Math.max(1, Math.min(MAX_BATCH, Number(limit) || 5));
      const result = { enabled: true, candidates: 0, inserted: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
      let pages, existing;
      try {
        [pages, existing] = await Promise.all([
          store.request('GET', 'web_crawl_pages?select=url,title,text_content,fetched_at&or=(' + hostFilter + ')&order=fetched_at.desc&limit=' + PAGE_CANDIDATE_LIMIT),
          store.request('GET', 'knowledge_docs?select=source_url,source_content_hash&tenant_id=eq.' + encodeURIComponent(platformTenantId) + '&source_content_hash=not.is.null&limit=500')
        ]);
      } catch (err) {
        logger?.warn?.('continuous intelligence knowledge index query failed', { code: String(err?.code || 'index_query_failed').slice(0, 64) });
        return { ...result, enabled: false, failed: 1 };
      }
      const existingHashes = new Map((Array.isArray(existing) ? existing : [])
        .filter((row) => typeof row.source_url === 'string' && /^[0-9a-f]{64}$/.test(String(row.source_content_hash || '')))
        .map((row) => [row.source_url, row.source_content_hash]));
      const candidates = [];
      for (const row of Array.isArray(pages) ? pages : []) {
        const page = safePage(row);
        if (!page) { result.skipped++; continue; }
        if (existingHashes.get(page.sourceUrl) === page.contentHash) { result.unchanged++; continue; }
        candidates.push(page);
      }
      result.candidates = candidates.length;
      for (const page of candidates.slice(0, max)) {
        try {
          const raw = await store.request('POST', 'rpc/upsert_platform_knowledge_doc', {
            body: {
              p_tenant_id: platformTenantId,
              p_title: page.title,
              p_source_url: page.sourceUrl,
              p_content_hash: page.contentHash,
              p_chars: page.chars,
              p_chunks: page.chunks
            }
          });
          const outcome = Array.isArray(raw) ? raw[0] : raw;
          if (!outcome || typeof outcome !== 'object') throw new Error('invalid index result');
          if (outcome.action === 'inserted') result.inserted++;
          else if (outcome.action === 'updated') result.updated++;
          else if (outcome.action === 'unchanged') result.unchanged++;
          else throw new Error('unexpected index result');
          existingHashes.set(page.sourceUrl, page.contentHash);
        } catch (err) {
          result.failed++;
          logger?.warn?.('continuous intelligence page indexing failed', {
            code: String(err?.code || 'index_write_failed').slice(0, 64),
            host: new URL(page.sourceUrl).hostname
          });
        }
      }
      return result;
    }
  };
}
