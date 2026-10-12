import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSemanticCache } from '../src/semanticCache.js';

test('semantic cache lookup uses the configured scope, model, threshold and one-result bound', async () => {
  const calls = [];
  const cache = createSemanticCache({
    supabase: { rpc: async (...args) => { calls.push(args); return { data: [{ id: 'row-1', response: 'answer' }], error: null }; } },
    embed: async (prompt) => { assert.equal(prompt, 'question'); return [0.1, 0.2]; },
    modelName: 'test-embedding',
    threshold: 0.95
  });
  const result = await cache.lookup('question', 'scope-hash');
  assert.deepEqual(result.embedding, [0.1, 0.2]);
  assert.equal(result.hit.response, 'answer');
  assert.equal(calls[0][0], 'match_semantic_cache');
  assert.deepEqual(calls[0][1], { query_embedding: [0.1, 0.2], match_scope: 'scope-hash', match_model: 'test-embedding', match_threshold: 0.95, match_count: 1 });
});

test('semantic cache miss returns the embedding for reuse when storing', async () => {
  let inserted;
  const cache = createSemanticCache({
    supabase: { rpc: async () => ({ data: [], error: null }), from: (table) => ({ insert: async (row) => { assert.equal(table, 'semantic_cache'); inserted = row; return { error: null }; } }) },
    embed: async () => [1, 0], modelName: 'test-embedding', ttlDays: 7
  });
  const result = await cache.lookup('question', 'scope-hash');
  assert.equal(result.hit, null);
  await cache.store({ scope: 'scope-hash', prompt: 'question', response: 'answer', embedding: result.embedding });
  assert.deepEqual(inserted.embedding, [1, 0]);
  assert.equal(inserted.embedding_model, 'test-embedding');
  assert.equal(inserted.scope, 'scope-hash');
  assert.equal(inserted.prompt, 'question');
  assert.equal(inserted.response, 'answer');
  assert.ok(Date.parse(inserted.expires_at) > Date.now());
});

test('semantic cache lookup preserves an embedding when the search RPC fails', async () => {
  const cache = createSemanticCache({
    supabase: { rpc: async () => ({ data: null, error: { message: 'temporary RPC failure' } }) },
    embed: async () => [0.3, 0.4],
    modelName: 'test-embedding'
  });
  await assert.rejects(cache.lookup('question', 'scope-hash'), (error) => {
    assert.deepEqual(error.embedding, [0.3, 0.4]);
    return true;
  });
});

test('semantic cache touch calls the server-side hit counter', async () => {
  let args;
  const cache = createSemanticCache({ supabase: { rpc: async (...values) => { args = values; return { error: null }; } }, embed: async () => [], modelName: 'test-embedding' });
  await cache.touch('row-1');
  assert.deepEqual(args, ['touch_semantic_cache', { cache_id: 'row-1' }]);
});

test('active main/chat wiring uses the persistent cache only behind existing policy gates', async () => {
  const [main, chat] = await Promise.all([readFile(new URL('../src/main.js', import.meta.url), 'utf8'), readFile(new URL('../src/chat.js', import.meta.url), 'utf8')]);
  assert.match(main, /createSemanticCache/);
  assert.match(main, /modelName: process\.env\.EMBED_MODEL/);
  assert.match(main, /import\('\.\/embedder\.js'\)/);
  assert.match(main, /policy, semanticCache, legal/);
  assert.match(chat, /if \(semanticCache && key\)/);
  assert.match(chat, /semanticCache\.lookup\(typed, semanticScope\)/);
  assert.match(chat, /semanticEntry = err\?\.embedding \? \{ embedding: err\.embedding, hit: null \} : null/);
  assert.match(chat, /stage: err\?\.embedding \? 'search' : 'embedding'/);
  assert.doesNotMatch(chat, /const contextHash/);
  assert.match(chat, /semanticCache\.store\(/);
  assert.match(chat, /semantic cache lookup unavailable/);
});
