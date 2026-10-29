import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRagQuery, rerankHybridCandidates } from '../src/knowledge/rag-orchestrator.js';
import { createWebCrawler } from '../src/web/crawler.js';

test('query analysis decomposes intent and expands common technical aliases without a model call', () => {
  const result = analyzeRagQuery('How do I debug TS type errors in Supabase?');
  assert.equal(result.intent, 'debugging');
  assert.ok(result.terms.includes('typescript'));
  assert.ok(result.terms.includes('supabase'));
  assert.ok(result.expansions.length <= 3);
  assert.ok(result.expansions.length >= 2);
  assert.equal(result.sensitive, false);
});

test('query analysis detects credential-like queries', () => {
  assert.equal(analyzeRagQuery('My authorization: Bearer abc is broken').sensitive, true);
});

test('hybrid reranker balances semantic relevance with lexical evidence and returns unique trusted sources', () => {
  const analysis = analyzeRagQuery('typescript compiler type error');
  const rows = rerankHybridCandidates([
    { url: 'https://docs.example.com/unrelated', title: 'Cooking guide', text: 'A recipe about cooking with herbs and spices. '.repeat(2), similarity: 0.97, fetched_at: '2026-10-28T00:00:00.000Z' },
    { url: 'https://docs.example.com/typescript', title: 'TypeScript compiler errors', text: 'TypeScript compiler errors are often caused by incompatible types and incorrect function signatures. '.repeat(2), similarity: 0.73, fetched_at: '2026-10-27T00:00:00.000Z' },
    { url: 'https://docs.example.com/typescript#section', title: 'TypeScript compiler errors duplicate', text: 'TypeScript compiler errors are often caused by incompatible types and incorrect function signatures. '.repeat(2), similarity: 0.72, fetched_at: '2026-10-26T00:00:00.000Z' },
    { url: 'https://evil.example.net/typescript', title: 'TypeScript', text: 'TypeScript compiler error reference text. '.repeat(3), similarity: 0.99 }
  ], analysis, { limit: 5, allowedHosts: ['docs.example.com'], now: () => Date.parse('2026-10-29T00:00:00.000Z') });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].url, 'https://docs.example.com/typescript');
  assert.ok(rows[0].retrieval_score > rows[1].retrieval_score);
  assert.ok(rows.every((row) => row.retrieval_score >= 0 && row.retrieval_score <= 1));
});

test('crawler merges semantic and keyword candidates and records metadata-only telemetry', async () => {
  const oldEnabled = process.env.SEMANTIC_KNOWLEDGE_ENABLED;
  process.env.SEMANTIC_KNOWLEDGE_ENABLED = 'true';
  const events = [];
  const store = {
    async request(method, path) {
      if (path.startsWith('rpc/match_public_technical_chunks')) {
        return [{
          source_url: 'https://docs.example.com/semantic', title: 'TypeScript types',
          content: 'TypeScript types prevent incorrect values from reaching a function at runtime. '.repeat(2),
          fetched_at: '2026-10-28T00:00:00.000Z', similarity: 0.8, embedding_model: 'test/model@384'
        }];
      }
      if (path.startsWith('web_crawl_pages?')) return [{
        url: 'https://docs.example.com/keyword', title: 'TypeScript compiler errors',
        text_content: 'TypeScript compiler errors can happen when a value has an incompatible type. '.repeat(2),
        fetched_at: '2026-10-27T00:00:00.000Z', media: []
      }];
      throw new Error('unexpected store request');
    }
  };
  try {
    const crawler = createWebCrawler({
      store, embedder: { modelName: 'test/model@384', async embed() { return Array(384).fill(0.01); } },
      logger: { info: (...args) => events.push(args), warn: (...args) => events.push(args) },
      now: () => Date.parse('2026-10-29T00:00:00.000Z')
    });
    const rows = await crawler.search('How do I fix TypeScript compiler errors?', { limit: 5, allowedHosts: ['docs.example.com'] });
    assert.equal(rows.length, 2);
    assert.ok(rows.some((row) => row.url.endsWith('/semantic')));
    assert.ok(rows.some((row) => row.url.endsWith('/keyword')));
    assert.ok(events.some(([message, data]) => message === 'hybrid knowledge retrieval completed' && data.mode === 'hybrid'));
    assert.ok(events.every(([, data]) => !JSON.stringify(data).includes('TypeScript compiler errors')));
  } finally {
    if (oldEnabled === undefined) delete process.env.SEMANTIC_KNOWLEDGE_ENABLED;
    else process.env.SEMANTIC_KNOWLEDGE_ENABLED = oldEnabled;
  }
});

test('keyword fallback returns usable results when vector RPC is unavailable', async () => {
  const oldEnabled = process.env.SEMANTIC_KNOWLEDGE_ENABLED;
  process.env.SEMANTIC_KNOWLEDGE_ENABLED = 'true';
  try {
    const crawler = createWebCrawler({
      store: { async request(method, path) {
        if (path.startsWith('rpc/match_public_technical_chunks')) throw new Error('vector unavailable');
        if (path.startsWith('web_crawl_pages?')) return [{
          url: 'https://docs.example.com/sql', title: 'SQL query plans',
          text_content: 'SQL query plans use indexes to reduce database scan work. '.repeat(2),
          fetched_at: '2026-10-28T00:00:00.000Z'
        }];
        return [];
      } },
      embedder: { modelName: 'test/model@384', async embed() { return Array(384).fill(0.01); } },
      logger: { info() {}, warn() {} },
      now: () => Date.parse('2026-10-29T00:00:00.000Z')
    });
    const rows = await crawler.search('SQL query plans and database indexes', { allowedHosts: ['docs.example.com'] });
    assert.equal(rows.length, 1);
    assert.match(rows[0].text, /indexes/);
  } finally {
    if (oldEnabled === undefined) delete process.env.SEMANTIC_KNOWLEDGE_ENABLED;
    else process.env.SEMANTIC_KNOWLEDGE_ENABLED = oldEnabled;
  }
});
