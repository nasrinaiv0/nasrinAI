import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleWebSearch } from '../src/web/google-search.js';
import { createWebSearch } from '../src/web/search.js';

test('Google Custom Search returns normalized, deduplicated HTTPS source candidates', async () => {
  let requested;
  const google = createGoogleWebSearch({
    apiKey: 'test-key',
    engineId: 'test-cx',
    fetchImpl: async (url) => {
      requested = new URL(url);
      return Response.json({ items: [
        { link: 'https://example.com/article', title: 'Article', snippet: 'Useful excerpt', displayLink: 'example.com' },
        { link: 'https://example.com/article', title: 'Duplicate', snippet: 'Duplicate excerpt' },
        { link: 'javascript:alert(1)', title: 'Unsafe' },
        { link: 'https://example.org/video', title: 'Video', snippet: 'Video source' }
      ] });
    }
  });
  const results = await google.search('latest public video');
  assert.equal(requested.origin, 'https://customsearch.googleapis.com');
  assert.equal(requested.searchParams.get('cx'), 'test-cx');
  assert.equal(requested.searchParams.get('q'), 'latest public video');
  assert.deepEqual(results.map((item) => item.url), ['https://example.com/article', 'https://example.org/video']);
  assert.equal(results[0].snippet, 'Useful excerpt');
});

test('Google Custom Search is an optional, failure-tolerant adapter', async () => {
  assert.deepEqual(await createGoogleWebSearch().search('query'), []);
  const google = createGoogleWebSearch({ apiKey: 'key', engineId: 'cx', fetchImpl: async () => new Response('', { status: 503 }) });
  assert.deepEqual(await google.search('query'), []);
});

test('web research combines Google candidates with answer citations and provides snippets as context', async () => {
  let requestBody;
  const googleSearch = {
    available: true,
    async search(query) {
      assert.match(query, /latest public video/i);
      return [{ url: 'https://example.com/source', title: 'Google source', snippet: 'Google excerpt', displayLink: 'example.com' }];
    }
  };
  const search = createWebSearch({
    apiKey: 'test-key',
    model: 'test-model',
    googleSearch,
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return Response.json({
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Here is the answer.', annotations: [
          { type: 'url_citation', url: 'https://official.example/page', title: 'Official source' }
        ] }] }],
        usage: { input_tokens: 10, output_tokens: 5 }
      });
    }
  });
  const result = await search({ messages: [{ role: 'user', content: 'latest public video' }] });
  assert.match(JSON.stringify(requestBody.input), /Google excerpt/);
  assert.ok(result.citations.some((source) => source.url === 'https://example.com/source'));
  assert.ok(result.citations.some((source) => source.url === 'https://official.example/page'));
});


test('OpenRouter web research uses the server web-search tool and validates citations', async () => {
  let requestUrl;
  let requestBody;
  const search = createWebSearch({
    apiKey: 'openrouter-test-key',
    model: 'openrouter/auto',
    baseUrl: 'https://openrouter.ai/api/v1',
    fetchImpl: async (url, options) => {
      requestUrl = String(url);
      requestBody = JSON.parse(options.body);
      return Response.json({
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Verified answer.', annotations: [
          { type: 'url_citation', url: 'https://example.com/source', title: 'Source' },
          { type: 'url_citation', url: 'javascript:alert(1)', title: 'Unsafe' }
        ] }] }],
        usage: { input_tokens: 20, output_tokens: 8 }
      });
    }
  });
  const result = await search({ messages: [{ role: 'user', content: 'What is the latest update?' }] });
  assert.equal(requestUrl, 'https://openrouter.ai/api/v1/responses');
  assert.equal(requestBody.model, 'openrouter/auto');
  assert.equal(requestBody.tools[0].type, 'openrouter:web_search');
  assert.equal(requestBody.tools[0].parameters.engine, 'auto');
  assert.equal(requestBody.tools[0].parameters.max_results, 10);
  assert.equal(result.text, 'Verified answer.');
  assert.deepEqual(result.citations.map((source) => source.url), ['https://example.com/source']);
});
