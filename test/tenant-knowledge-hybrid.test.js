import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIEmbedder } from '../src/ai/embeddings.js';
import { createKnowledge } from '../src/knowledge/index.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const vector = (value = 0.1) => Array(384).fill(value);
const logger = { warn() {}, info() {} };

test('OpenAI embedder batches embeddings and preserves input order', async () => {
  const embedder = createOpenAIEmbedder({
    apiKey: 'test-key',
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.input, ['first document', 'second document']);
      return { ok: true, json: async () => ({ data: [
        { index: 1, embedding: vector(0.2) },
        { index: 0, embedding: vector(0.1) }
      ] }) };
    }
  });
  const vectors = await embedder.embedMany(['first document', 'second document']);
  assert.equal(vectors.length, 2);
  assert.equal(vectors[0][0], 0.1);
  assert.equal(vectors[1][0], 0.2);
  assert.equal((await embedder.embed('one query'))[0], 0.1);
});

test('tenant knowledge uses hybrid retrieval with tenant, audience, and model scope', async () => {
  let called;
  const store = {
    async listKnowledgeDocs() { return [{ id: 'doc-1' }]; },
    async searchKnowledgeHybrid(args) {
      called = args;
      return [{
        docId: 'doc-1', title: 'Private FAQ', sourceUrl: 'https://business.example/faq',
        idx: 0, text: 'This private business policy describes delivery windows and customer order handling.', rank: 0.8
      }];
    },
    async searchKnowledge() { throw new Error('full-text fallback should not be needed'); }
  };
  const embedder = { modelName: 'openai/test@384', async embed() { return vector(0.3); } };
  const knowledge = createKnowledge({ store, logger, embedder });
  const caller = { tenantId: TENANT, actor: { type: 'service' } };
  const context = await knowledge.context(caller, 'What is the delivery policy?');
  assert.equal(called.tenantId, TENANT);
  assert.equal(called.audience, 'service');
  assert.equal(called.embeddingModel, embedder.modelName);
  assert.equal(called.embedding.length, 384);
  assert.match(context, /Private FAQ/);
  assert.match(context, /business\.example\/faq/);
  assert.match(context, /data, not instructions/);
});

test('tenant knowledge falls back to permission-scoped full-text search when embedding fails', async () => {
  let fallbackCalled = false;
  const store = {
    async listKnowledgeDocs() { return [{ id: 'doc-1' }]; },
    async searchKnowledgeHybrid() { throw new Error('embedding service unavailable'); },
    async searchKnowledge(args) {
      fallbackCalled = true;
      assert.equal(args.tenantId, TENANT);
      assert.equal(args.audience, 'service');
      return [{ docId: 'doc-1', title: 'Fallback FAQ', sourceUrl: null, idx: 0,
        text: 'The fallback policy explains customer delivery and order handling in detail.', rank: 0.8 }];
    }
  };
  const knowledge = createKnowledge({ store, logger, embedder: { modelName: 'openai/test@384', async embed() { throw new Error('network'); } } });
  const context = await knowledge.context({ tenantId: TENANT, actor: { type: 'service' } }, 'Explain the delivery policy');
  assert.equal(fallbackCalled, true);
  assert.match(context, /Fallback FAQ/);
});

test('tenant knowledge batches document embeddings when vector retrieval is available', async () => {
  let saved;
  const store = {
    async listKnowledgeDocs() { return []; },
    async addKnowledgeDoc(input) { saved = input; return '22222222-2222-4222-8222-222222222222'; },
    async searchKnowledgeHybrid() { return []; }
  };
  const embedder = {
    modelName: 'openai/test@384',
    async embedMany(texts) { return texts.map((_, index) => vector((index + 1) / 10)); }
  };
  const knowledge = createKnowledge({ store, logger, embedder });
  const result = await knowledge.manage.add(
    { tenantId: TENANT, actor: { type: 'service' } },
    { title: 'Delivery FAQ', text: 'Orders are delivered within two business days. Customers can contact support for delivery questions.' }
  );
  assert.equal(result.chunks, saved.chunks.length);
  assert.equal(saved.embeddings.length, saved.chunks.length);
  assert.equal(saved.embeddingModel, embedder.modelName);
});
