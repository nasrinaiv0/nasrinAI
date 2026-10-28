import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebCrawler } from '../src/web/crawler.js';

test('crawler search filters trusted hosts before result limiting and ranks term overlap', async () => {
  let queryPath = '';
  const crawler = createWebCrawler({
    store: {
      async request(_method, path) {
        queryPath = path;
        return [
          { url: 'https://attacker.example/a', title: 'TypeScript types', text_content: 'TypeScript types TypeScript types TypeScript types', fetched_at: '2026-10-29T03:00:00Z' },
          { url: 'https://www.typescriptlang.org/docs/', title: 'TypeScript handbook', text_content: 'TypeScript types are documented here with compiler examples.', fetched_at: '2026-10-28T03:00:00Z' },
          { url: 'http://www.typescriptlang.org/insecure', title: 'TypeScript', text_content: 'TypeScript types insecure result', fetched_at: '2026-10-29T04:00:00Z' }
        ];
      }
    }
  });
  const rows = await crawler.search('TypeScript types', { limit: 1, allowedHosts: ['www.typescriptlang.org'] });
  assert.match(queryPath, /limit=10$/);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, 'https://www.typescriptlang.org/docs/');
});

test('crawler search rejects empty queries and invalid host allowlists without querying storage', async () => {
  let calls = 0;
  const crawler = createWebCrawler({ store: { async request() { calls++; return []; } } });
  assert.deepEqual(await crawler.search('---'), []);
  assert.deepEqual(await crawler.search('TypeScript types', { allowedHosts: [] }), []);
  assert.equal(calls, 0);
});
