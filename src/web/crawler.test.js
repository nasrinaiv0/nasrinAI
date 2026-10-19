import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalCrawlUrl, extractWebAssets } from './crawler.js';

test('canonical crawl URLs strip fragments and tracking parameters', () => {
  assert.equal(canonicalCrawlUrl('https://example.com/a/?utm_source=x&b=2#section'), 'https://example.com/a?b=2');
});

test('canonical crawl URLs reject unsafe schemes and internal hosts', () => {
  assert.equal(canonicalCrawlUrl('file:///etc/passwd'), null);
  assert.equal(canonicalCrawlUrl('http://127.0.0.1/admin'), null);
  assert.equal(canonicalCrawlUrl('https://user:pass@example.com/'), null);
});

test('extracts bounded public links and multimodal metadata from HTML', () => {
  const html = `
    <a href="/article?utm_source=nav">Article</a>
    <a href="javascript:alert(1)">bad</a>
    <img src="/hero.jpg" alt="Product hero">
    <video poster="/preview.jpg"><source src="/demo.mp4" type="video/mp4"></video>
    <audio src="/podcast.mp3" title="Episode one"></audio>
    <iframe src="http://127.0.0.1/private"></iframe>
  `;
  const found = extractWebAssets(html, 'https://example.com/');
  assert.deepEqual(found.links, ['https://example.com/article?utm_source=nav']);
  assert.deepEqual(found.media.map((m) => m.kind), ['image', 'video', 'audio']);
  assert.equal(found.media[0].alt, 'Product hero');
  assert.equal(found.media[1].url, 'https://example.com/preview.jpg');
  assert.equal(found.media[2].url, 'https://example.com/podcast.mp3');
});
