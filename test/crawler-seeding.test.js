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
