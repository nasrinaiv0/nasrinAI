import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIEmbedder } from '../src/ai/embeddings.js';

test('embeddings: 384 numbers from OpenAI, contact details removed first', async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    sent = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
    return Response.json({ data: [{ embedding: Array(384).fill(0.05) }] });
  };
  const e = createOpenAIEmbedder({ apiKey: 'sk-test', fetchImpl });
  assert.equal(e.modelName, 'openai/text-embedding-3-small@384');
  const v = await e.embed('Email me at a@b.com about tea');
  assert.equal(v.length, 384);
  assert.equal(sent.url, 'https://api.openai.com/v1/embeddings');
  assert.deepEqual({ model: sent.body.model, dimensions: sent.body.dimensions }, { model: 'text-embedding-3-small', dimensions: 384 });
  assert.equal(sent.body.input, 'Email me at [email] about tea');
  assert.equal(sent.auth, 'Bearer sk-test');
});

test('embeddings: errors and wrong sizes are refused', async () => {
  const bad = createOpenAIEmbedder({ apiKey: 'k', fetchImpl: async () => new Response('no', { status: 429 }) });
  await assert.rejects(bad.embed('x'), /429/);
  const short = createOpenAIEmbedder({ apiKey: 'k', fetchImpl: async () => Response.json({ data: [{ embedding: [1, 2] }] }) });
  await assert.rejects(short.embed('x'), /unexpected shape/);
});
