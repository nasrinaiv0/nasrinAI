import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeProvider } from '../src/ai/fake.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

// 2026-10-12: Code in the menu opens a project-scoped coding chat with coding experts.
const HTML_FILE = 'Here it is.\n[[file name="index.html"]]\n<!DOCTYPE html><html><body><h1>Hi</h1></body></html>\n[[/file]]';

test('the coding chat adds the coding rules and keeps code files as they are', async () => {
  const provider = createFakeProvider({ reply: () => HTML_FILE });
  const built = buildTestApp({ provider });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'make a simple greeting', coding: true, professional: { enabled: true, mode: 'group', groups: ['technology'] } }, bearer(USER_TOKEN))).json();
    assert.match(r.message.content, /index\.html/, 'the .html file stays .html');
    const system = provider.calls.at(-1).system;
    assert.match(system, /coding chat for the person's project/);
    assert.match(system, /cannot run code/);
    assert.match(system, /\[\[checks title="Summary"\]\]/, 'asks for the simple status summary');
    assert.ok(r.professionals.length >= 1, 'a coding expert answered');
  } finally { await srv.close(); }
});

test('outside the coding chat the same file becomes a PDF and no coding rules are added', async () => {
  const provider = createFakeProvider({ reply: () => HTML_FILE });
  const built = buildTestApp({ provider });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'make a simple greeting card' }, bearer(USER_TOKEN))).json();
    assert.match(r.message.content, /index\.pdf/);
    assert.doesNotMatch(provider.calls.at(-1).system, /coding chat for the person's project/);
  } finally { await srv.close(); }
});

test('coding must be true or false', async () => {
  const built = buildTestApp({ provider: createFakeProvider() });
  const srv = await serve(built.app);
  try {
    assert.equal((await postJson(srv.url + '/v1/chat', { message: 'hi', coding: 'yes' }, bearer(USER_TOKEN))).status, 400);
  } finally { await srv.close(); }
});
