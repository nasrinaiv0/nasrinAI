import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createFakeProvider } from '../src/ai/fake.js';
import { MAX_PARALLEL_TOOLS } from '../src/chat.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

const ENV = { ROUTING: 'smart', OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30) };

test('tools asked for in one step run at the same time; edits stay in order; results keep the model\'s order', async () => {
  let active = 0; let peak = 0;
  const order = [];
  const slow = (name, ms) => ({
    name, description: name, risk: 'read', who: ['user', 'guest'], parameters: { properties: { q: { type: 'string' } }, required: [] },
    async run(args) { active++; peak = Math.max(peak, active); order.push('start ' + name + ' ' + (args.q || '')); await new Promise((r) => setTimeout(r, ms)); active--; order.push('end ' + name + ' ' + (args.q || '')); return { name, q: args.q || null }; }
  });
  const edit = { name: 'code_edit', description: 'edit', risk: 'read', who: ['user'], parameters: { properties: { q: { type: 'string' } }, required: [] },
    async run(args) { order.push('edit ' + args.q + ' peak=' + active); return { edited: args.q }; } };
  let toolMessages = null;
  const provider = createFakeProvider({ reply: (req) => {
    const last = req.messages.at(-1);
    if (last.role === 'user') return { toolCalls: [
      { id: 'a', name: 'web_lookup', arguments: '{"q":"1"}' },
      { id: 'b', name: 'web_lookup', arguments: '{"q":"2"}' },
      { id: 'c', name: 'page_read', arguments: '{"q":"3"}' },
      { id: 'd', name: 'code_edit', arguments: '{"q":"x"}' },
      { id: 'e', name: 'page_read', arguments: '{"q":"4"}' }
    ] };
    toolMessages = req.messages.filter((m) => m.role === 'tool');
    return 'All done.';
  } });
  const built = buildTestApp({ provider, env: ENV, extraTools: [slow('web_lookup', 40), slow('page_read', 20), edit] });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'check the time and search 3 things', coding: true }, bearer(USER_TOKEN))).json();
    assert.match(r.message.content, /All done/);
    assert.equal(peak, 3, 'the first three ran together');
    const editAt = order.findIndex((x) => x.startsWith('edit'));
    assert.equal(order.slice(0, editAt).filter((x) => x.startsWith('end')).length, 3, 'the edit waited for the tools before it');
    assert.match(order[editAt], /peak=0/, 'nothing else ran during the edit');
    assert.ok(order.indexOf('start page_read 4') > editAt, 'tools after the edit ran after it');
    assert.deepEqual(toolMessages.map((m) => m.toolCallId), ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(toolMessages.map((m) => JSON.parse(m.content).q ?? JSON.parse(m.content).edited), ['1', '2', '3', 'x', '4']);
    assert.ok(MAX_PARALLEL_TOOLS >= 3);
  } finally { await srv.close(); }
});

test('the page counts the pictures asked for (1 to 4) and shows up to 10 files per reply', async () => {
  const src = await readFile(new URL('../public/creative-intent.js', import.meta.url), 'utf8');
  const box = {}; box.globalThis = box; box.window = box;
  vm.runInNewContext(src, box);
  const count = box.NasrinCreativeIntent.pictureCount;
  assert.equal(count('make 4 pictures of a cat'), 4);
  assert.equal(count('three logo options for my cafe'), 3);
  assert.equal(count('a pair of posters'), 2);
  assert.equal(count('draw a cat'), 1);
  assert.equal(count('20 wallpapers'), 4, 'at most 4');
  assert.equal(count('I have 3 cats, draw them'), 1, 'a number of other things is not a picture count');
  assert.equal(count('gumawa ng apat na larawan'), 4);

  const files = await readFile(new URL('../public/files.js', import.meta.url), 'utf8');
  assert.match(files, /const MAX_FILES = 10;/);
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /pictureCount\(job\.prompt\)/);
  assert.match(app, /\.\.\.\(count > 1 \? \{ count \} : \{\}\)/);
});
