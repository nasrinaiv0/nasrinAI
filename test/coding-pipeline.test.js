import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeProvider } from '../src/ai/fake.js';
import { loadConfig } from '../src/config.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

test('the coding pipeline is off unless Vercel turns it on, and its bounds are validated', () => {
  const off = loadConfig({ NODE_ENV: 'test' });
  assert.equal(off.ai.routing.costOptimizedCodingEnabled, false);
  assert.equal(loadConfig({ NODE_ENV: 'test', CODING_PIPELINE_ENABLED: 'true' }).ai.routing.costOptimizedCodingEnabled, true);
  assert.throws(() => loadConfig({ NODE_ENV: 'test', CODING_PIPELINE_MAX_STAGE_CALLS: '3' }), /CODING_PIPELINE_MAX_STAGE_CALLS/, 'the independent review stage cannot be budgeted away');
});

test('flag off: an ordinary coding chat makes exactly one model call and answers normally', async () => {
  const provider = createFakeProvider({ reply: () => 'Here is the fix.' });
  const built = buildTestApp({ provider, env: { ROUTING: 'smart', OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30) } });
  const srv = await serve(built.app);
  try {
    const r = await postJson(srv.url + '/v1/chat', { message: 'Refactor this function to be faster: function f(a){return a.map(x=>x*2)}', coding: true }, bearer(USER_TOKEN));
    assert.equal(r.status, 200);
    assert.match((await r.json()).message.content, /Here is the fix/);
    assert.equal(provider.calls.length, 1, 'no pipeline stages while the flag is off');
  } finally { await srv.close(); }
});
