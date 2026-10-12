import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeProvider } from '../src/ai/fake.js';
import { createWebAnswers } from '../src/web-answers.js';
import { createMemoryStore } from '../src/store/memory-store.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

// Owner decision (2026-10-12): replies that used the internet are kept
// permanently with their sources; never who asked. Guests' questions are not kept.

const readLinkImpl = async (u) => (u === 'https://example.com/tea'
  ? { url: u, title: 'Tea', text: 'Green tea comes from Camellia sinensis.' }
  : { url: u, error: 'the site answered 404' });

async function run(fn) {
  const provider = createFakeProvider({ reply: () => 'Green tea comes from Camellia sinensis. Ask ana@example.ph for more.' });
  const built = buildTestApp({ provider, readLinkImpl });
  const srv = await serve(built.app);
  try { await fn({ ...built, url: srv.url }); } finally { await srv.close(); }
}

test('a reply that read a shared link is kept with its source; a guest\'s question is not', async () => {
  await run(async ({ url, store }) => {
    const g = (await (await fetch(url + '/v1/guest/sessions', { method: 'POST' })).json()).token;
    assert.equal((await postJson(url + '/v1/chat', { message: 'What is this about? https://example.com/tea' }, bearer(g))).status, 200);
    assert.equal((await postJson(url + '/v1/chat', { message: 'And this? https://example.com/tea' }, bearer(USER_TOKEN))).status, 200);
    const saved = store.listWebAnswers();
    assert.equal(saved.length, 2);
    assert.equal(saved[0].question, null, 'a guest\'s input is never saved');
    assert.equal(saved[1].question, 'And this? https://example.com/tea');
    for (const a of saved) {
      assert.deepEqual(a.sources, [{ url: 'https://example.com/tea', title: 'Tea' }]);
      assert.match(a.answer, /Camellia sinensis.*\[email\]/);
      assert.deepEqual(Object.keys(a).sort(), ['answer', 'createdAt', 'id', 'question', 'sources']);
    }
  });
});

test('replies that did not use the internet, or whose links failed, are not kept', async () => {
  await run(async ({ url, store }) => {
    await postJson(url + '/v1/chat', { message: 'Hello there' }, bearer(USER_TOKEN));
    await postJson(url + '/v1/chat', { message: 'Read https://example.com/missing' }, bearer(USER_TOKEN));
    assert.equal(store.listWebAnswers().length, 0);
  });
});

test('saving never breaks a reply and drops bad sources', async () => {
  const broken = createWebAnswers({ store: { addWebAnswer: async () => { throw new Error('db down'); } } });
  await broken.save({ caller: { actor: { type: 'user' } }, question: 'q', answer: 'a', sources: [{ url: 'https://x.y' }] });
  const store = createMemoryStore();
  const w = createWebAnswers({ store });
  await w.save({ caller: { actor: { type: 'user' } }, question: 'q', answer: 'a', sources: [{ url: 'javascript:alert(1)' }] });
  assert.equal(store.listWebAnswers().length, 0);
});
