import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebCrawler } from '../src/web/crawler.js';

test('hourly knowledge seed can insert without resetting existing crawl scheduling', async () => {
  const calls = [];
  const crawler = createWebCrawler({
    store: { async request(method, path, options = {}) { calls.push({ method, path, options }); return []; } }
  });
  const count = await crawler.enqueue(
    ['https://www.typescriptlang.org/docs/', 'https://www.typescriptlang.org/docs/'],
    { priority: 90, source: 'owner_seed', depth: 0, ignoreExisting: true }
  );
  assert.equal(count, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].path, /web_crawl_queue\?on_conflict=url_hash/);
  assert.equal(calls[0].options.prefer, 'resolution=ignore-duplicates,return=minimal');
  assert.equal(calls[0].options.body[0].source, 'owner_seed');
});

test('normal crawler enqueue retains merge behavior for discovered URLs', async () => {
  let options;
  const crawler = createWebCrawler({
    store: { async request(_method, _path, input = {}) { options = input; return []; } }
  });
  await crawler.enqueue('https://docs.python.org/3/', { source: 'discovered' });
  assert.equal(options.prefer, 'resolution=merge-duplicates,return=minimal');
});

test('official learning seeds only follow same-host links and preserve the seed policy', async () => {
  const calls = [];
  const crawler = createWebCrawler({
    store: {
      async request(method, path, options = {}) {
        calls.push({ method, path, options });
        if (path === 'rpc/claim_web_crawl_jobs') return [{
          id: 'job-1', url: 'https://www.typescriptlang.org/docs/', source: 'owner_seed', depth: 0, attempts: 0
        }];
        if (method === 'GET' && path.startsWith('web_crawl_pages?')) return [];
        return [];
      }
    },
    readLinkImpl: async (url) => {
      if (url.endsWith('/robots.txt')) return { text: 'User-agent: *\\nAllow: /', url };
      return {
        url,
        title: 'TypeScript Documentation',
        text: 'TypeScript is a strongly typed programming language that builds on JavaScript.',
        html: '<a href="https://www.typescriptlang.org/docs/handbook/">Handbook</a><a href="https://attacker.example/prompt">External</a>'
      };
    }
  });
  const result = await crawler.processBatch({ limit: 1 });
  assert.equal(result.processed, 1);
  const enqueueCall = calls.find((call) => call.method === 'POST' && call.path.startsWith('web_crawl_queue?'));
  assert.ok(enqueueCall);
  assert.deepEqual(enqueueCall.options.body.map((row) => row.url), ['https://www.typescriptlang.org/docs/handbook']);
  assert.equal(enqueueCall.options.body[0].source, 'owner_seed');
  assert.equal(enqueueCall.options.prefer, 'resolution=ignore-duplicates,return=minimal');
});
