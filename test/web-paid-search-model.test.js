import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { createWebSearch } from '../src/web/search.js';

const base = { AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'or-test-key' };

test('a paid search model is read from OPENROUTER_WEB_SEARCH_PAID_MODEL and never a free one', () => {
  assert.equal(loadConfig({ ...base, OPENROUTER_WEB_SEARCH_PAID_MODEL: 'google/gemini-3.8-flash' }).web.paidSearchModel, 'google/gemini-3.8-flash');
  assert.equal(loadConfig({ ...base, OPENROUTER_WEB_SEARCH_PAID_MODEL: 'nvidia/nemotron-3-super-120b-a12b:free' }).web.paidSearchModel, '', 'a :free id is refused');
  assert.equal(loadConfig({ ...base }).web.paidSearchModel, '', 'blank keeps the default');
});

test('web search uses the per-request model when given and the default otherwise', async () => {
  const sent = [];
  const fetchImpl = async (_url, init) => { sent.push(JSON.parse(init.body).model); return new Response(JSON.stringify({ output: [], output_text: '' }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const search = createWebSearch({ apiKey: 'k', model: 'default/free:free', fetchImpl });
  await search.search({ system: 'S', messages: [{ role: 'user', content: 'latest news' }] }).catch(() => {});
  await search.search({ system: 'S', messages: [{ role: 'user', content: 'latest news' }], model: 'google/gemini-3.8-flash' }).catch(() => {});
  assert.deepEqual(sent, ['default/free:free', 'google/gemini-3.8-flash']);
});
