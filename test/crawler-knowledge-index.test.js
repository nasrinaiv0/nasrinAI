import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCrawlerKnowledgeIndexer } from '../src/knowledge/crawler-index.js';
import { PROGRAMMING_DOC_HOSTS } from '../src/knowledge/programming-context.js';

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const URL = 'https://www.typescriptlang.org/docs/';
const TITLE = 'TypeScript Documentation';
const TEXT = 'TypeScript is a strongly typed programming language that builds on JavaScript and gives you better tooling at any scale. '.repeat(4);
const HASH = createHash('sha256').update(TITLE + '\n' + URL + '\n' + TEXT.trim()).digest('hex');

test('crawler indexer only sends trusted HTTPS documentation into platform knowledge', async () => {
  const calls = [];
  const logger = { warn(...args) { calls.push({ log: args }); } };
  const indexer = createCrawlerKnowledgeIndexer({
    platformTenantId: PLATFORM,
    logger,
    store: {
      async request(method, path, options = {}) {
        calls.push({ method, path, options });
        if (method === 'GET' && path.startsWith('web_crawl_pages?')) return [
          { url: URL, title: TITLE, text_content: TEXT, fetched_at: '2026-10-29T00:00:00Z' },
          { url: 'https://attacker.example/prompt', title: 'untrusted', text_content: TEXT },
          { url: 'http://www.typescriptlang.org/docs/', title: 'insecure', text_content: TEXT },
          { url: 'https://www.typescriptlang.org/empty', title: 'short', text_content: 'tiny' }
        ];
        if (method === 'GET' && path.startsWith('knowledge_docs?')) return [];
        if (method === 'POST' && path === 'rpc/upsert_platform_knowledge_doc') return { action: 'inserted', changed: true, chunk_count: 1 };
        throw new Error('unexpected request');
      }
    }
  });
  const result = await indexer.syncBatch({ limit: 5 });
  assert.equal(result.inserted, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.skipped, 3);
  const rpc = calls.find((call) => call.method === 'POST' && call.path === 'rpc/upsert_platform_knowledge_doc');
  assert.equal(rpc.options.body.p_tenant_id, PLATFORM);
  assert.equal(rpc.options.body.p_source_url, URL);
  assert.equal(rpc.options.body.p_content_hash, HASH);
  assert.ok(rpc.options.body.p_chunks.length >= 1);
  assert.ok(rpc.options.body.p_chunks.every((chunk) => chunk.length <= 1200));
  assert.ok(PROGRAMMING_DOC_HOSTS.includes(new URL(rpc.options.body.p_source_url).hostname));
});

test('crawler indexer skips unchanged managed docs without writing duplicate chunks', async () => {
  let writes = 0;
  const indexer = createCrawlerKnowledgeIndexer({
    platformTenantId: PLATFORM,
    store: {
      async request(method, path) {
        if (method === 'GET' && path.startsWith('web_crawl_pages?')) return [
          { url: URL, title: TITLE, text_content: TEXT, fetched_at: '2026-10-29T00:00:00Z' }
        ];
        if (method === 'GET' && path.startsWith('knowledge_docs?')) return [{ source_url: URL, source_content_hash: HASH }];
        if (method === 'POST' && path === 'rpc/upsert_platform_knowledge_doc') { writes++; return { action: 'unchanged', changed: false, chunk_count: 1 }; }
        throw new Error('unexpected request');
      }
    }
  });
  const result = await indexer.syncBatch();
  assert.equal(result.unchanged, 1);
  assert.equal(result.inserted, 0);
  assert.equal(writes, 0);
});

test('crawler indexer fails closed and reports a bounded error when database lookup fails', async () => {
  const loggerCalls = [];
  const indexer = createCrawlerKnowledgeIndexer({
    platformTenantId: PLATFORM,
    logger: { warn(...args) { loggerCalls.push(args); } },
    store: { async request() { throw new Error('raw database response should not leak'); } }
  });
  const result = await indexer.syncBatch();
  assert.equal(result.enabled, false);
  assert.equal(result.failed, 1);
  assert.equal(loggerCalls.length, 1);
  assert.equal(JSON.stringify(loggerCalls).includes('raw database response should not leak'), false);
});
