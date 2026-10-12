import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { needsWeb } from '../src/web/search.js';
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
