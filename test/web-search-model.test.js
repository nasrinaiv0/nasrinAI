import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { createWebSearch, needsWeb } from '../src/web/search.js';
import { buildSystemPrompt } from '../src/ai/prompt.js';

// 2026-10-12: news questions got "I can't check live news". The web search
// model had no price, so the spend check skipped every search in production.
const ENV = { NODE_ENV: 'test', AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test-only' };

test('web search uses a priced model by default', () => {
  const cfg = loadConfig(ENV);
  assert.equal(cfg.web.searchModel, 'gpt-5.4-mini');
  assert.deepEqual(cfg.warnings.filter((w) => w.startsWith('WEB_SEARCH_MODEL')), []);
});

test('an unpriced WEB_SEARCH_MODEL falls back with a warning; empty turns search off', () => {
  const cfg = loadConfig({ ...ENV, WEB_SEARCH_MODEL: 'gpt-6-luna' });
  assert.equal(cfg.web.searchModel, 'gpt-5.4-mini');
  assert.match(cfg.warnings.join(' '), /WEB_SEARCH_MODEL: gpt-6-luna has no price/);
  assert.equal(loadConfig({ ...ENV, WEB_SEARCH_MODEL: 'gpt-5.4' }).web.searchModel, 'gpt-5.4');
  assert.equal(loadConfig({ ...ENV, WEB_SEARCH_MODEL: '' }).web.searchModel, '');
  assert.equal(loadConfig({ ...ENV, WEB_SEARCH_MODEL: 'gpt-6-luna', MODEL_PRICES_JSON: '{"openai":{"gpt-6-luna":{"input":0.1,"output":0.5}}}' }).web.searchModel, 'gpt-6-luna');
});

test('news questions search; questions about browsing itself do not', () => {
  for (const t of ['what is the latest news', 'what is the latest news in the philippines', 'search the internet for typhoon updates', "what are today's headlines", 'can you check what is the new update about impeachment in the philippines']) assert.equal(needsWeb(t), true, t);
  for (const t of ['can you brows the internet?', 'can you browse the internet?', 'what is the internet', 'hello']) assert.equal(needsWeb(t), false, t);
});

test('with web search on, the prompt never says NasrinAI cannot browse', () => {
  assert.match(buildSystemPrompt({ web: true }), /NasrinAI can search the internet/);
  assert.doesNotMatch(buildSystemPrompt({ web: true }), /Without them you cannot browse/);
  assert.match(buildSystemPrompt(), /Without them you cannot browse/);
});


test('TikTok and social video discovery requests always trigger live web search', () => {
  for (const q of [
    'what is trending in tiktok now',
    'public any videos from tiktok',
    'show any videos from TikTok',
    'TikTok public videos trending',
    'what is viral on Facebook',
    'show trending Instagram reels',
    'top YouTube shorts right now'
  ]) assert.equal(needsWeb(q), true, q);
  // General public-entity questions may already trigger web search through
  // PUBLIC_ENTITY_QUESTION; keep them separate from non-search capability queries.
  assert.equal(needsWeb('what is TikTok?'), true);
  for (const q of ['how do I upload a video?', 'explain social media']) assert.equal(needsWeb(q), false, q);
});


test('social video search asks for a verified list of direct video URLs', async () => {
  let request;
  const search = createWebSearch({
    apiKey: 'sk-test-only',
    model: 'gpt-5.4-mini',
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          output: [
            { type: 'message', content: [{ type: 'output_text', text: 'Verified video list', annotations: [
              { type: 'url_citation', url: 'https://www.tiktok.com/@creator/video/1234567890123456789', title: 'Example public video' }
            ] }] },
            { type: 'web_search_call' }
          ],
          usage: { input_tokens: 20, output_tokens: 10 }
        })
      };
    }
  });
  const result = await search.search({
    system: 'Test system prompt',
    messages: [{ role: 'user', content: 'trending videos in tiktok' }]
  });
  assert.equal(result.text, 'Verified video list');
  assert.match(request.instructions, /SOCIAL VIDEO DISCOVERY MODE/);
  assert.match(request.instructions, /numbered shortlist of up to five/);
  assert.match(request.instructions, /direct canonical post URL/);
  assert.match(request.instructions, /do not end by asking whether the user wants the list/i);
  assert.equal(result.citations[0].url, 'https://www.tiktok.com/@creator/video/1234567890123456789');
});

test('research routing ignores old assistant prose and uses the latest user intent', async () => {
  const requests = [];
  const search = createWebSearch({
    apiKey: 'sk-test-only',
    model: 'gpt-5.4-mini',
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ output: [
        { type: 'message', content: [{ type: 'output_text', text: 'Answer', annotations: [] }] },
        { type: 'web_search_call' }
      ], usage: { input_tokens: 10, output_tokens: 2 } }) };
    }
  });
  await search.search({ system: 'test', messages: [
    { role: 'user', content: 'Write a short thank-you message.' },
    { role: 'assistant', content: 'Here is a bibliography with many references and sources.' },
    { role: 'user', content: 'What is the capital of France?' }
  ] });
  assert.equal(requests[0].tools[0].search_context_size, 'medium');
  await search.search({ system: 'test', messages: [
    { role: 'user', content: 'Give me a comprehensive research report with sources and citations.' }
  ] });
  assert.equal(requests[1].tools[0].search_context_size, 'high');
});

test('substantial research returns up to ten unique citations; ordinary lookups stay concise', async () => {
  const annotations = Array.from({ length: 12 }, (_, i) => ({
    type: 'url_citation', url: 'https://example.com/source-' + (i + 1), title: 'Source ' + (i + 1)
  }));
  const search = createWebSearch({
    apiKey: 'sk-test-only',
    model: 'gpt-5.4-mini',
    fetchImpl: async () => ({ ok: true, json: async () => ({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Research answer', annotations }] }],
      usage: { input_tokens: 20, output_tokens: 10 }
    }) })
  });
  const research = await search.search({ system: 'test', messages: [{ role: 'user', content: 'Comprehensive research report with sources' }] });
  assert.equal(research.citations.length, 10);
  assert.equal(new Set(research.citations.map((source) => source.url)).size, 10);
  const ordinary = await search.search({ system: 'test', messages: [{ role: 'user', content: 'What is the capital of France?' }] });
  assert.equal(ordinary.citations.length, 6);
});
