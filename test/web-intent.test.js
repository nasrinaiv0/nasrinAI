import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsWeb } from '../src/web/search.js';
import { linksIn } from '../src/web/read-link.js';

test('web intent detection routes scraping and page extraction through live research', () => {
  for (const prompt of [
    'Scrape this website and summarize the pricing page',
    'Scraping the vendor site should find its public documentation',
    'Extracting content from this article should cite the publisher',
    'Check the accuracy of these claims against reliable facts',
    'Extract the key facts from this article',
    'Open this link and tell me what it says',
    'Crawl this site for its documentation',
    'Summarize these pages and compare the sources',
    'Fact-check these claims against reliable sources',
    'Verify these facts with primary sources'
  ]) {
    assert.equal(needsWeb(prompt), true, prompt);
  }
});

test('web intent detection keeps ordinary timeless explanations local', () => {
  for (const prompt of [
    'Explain photosynthesis',
    'Write a birthday message',
    'What is a binary search tree?'
  ]) {
    assert.equal(needsWeb(prompt), false, prompt);
  }
});

test('shared-link research reads up to five distinct source URLs by default', () => {
  const input = [
    'https://example.com/one',
    'https://example.com/two',
    'https://example.com/three',
    'https://example.com/four',
    'https://example.com/five',
    'https://example.com/six',
    'https://example.com/one'
  ].join(' ');
  assert.deepEqual(linksIn(input), [
    'https://example.com/one',
    'https://example.com/two',
    'https://example.com/three',
    'https://example.com/four',
    'https://example.com/five'
  ]);
});
