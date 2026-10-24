import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsWeb } from '../src/web/search.js';

test('web intent detection routes scraping and page extraction through live research', () => {
  for (const prompt of [
    'Scrape this website and summarize the pricing page',
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
