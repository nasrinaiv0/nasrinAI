import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeProvider } from '../src/ai/fake.js';
import { buildTestApp, serve, bearer, postJson } from './helpers.js';

async function ask(extra) {
  const provider = createFakeProvider({ reply: () => 'ok' });
  const built = buildTestApp({ provider });
  const srv = await serve(built.app);
  try {
    const g = (await (await fetch(srv.url + '/v1/guest/sessions', { method: 'POST' })).json()).token;
    const r = await postJson(srv.url + '/v1/chat', { message: 'Do you see my screen?', ...extra }, bearer(g));
    assert.equal(r.status, 200);
    const last = provider.calls.at(-1);
    return String(last.system || '');
  } finally { await srv.close(); }
}

test('a voice question carries the description of the shared screen for that turn only', async () => {
  const system = await ask({ voice: true, screen_context: 'A settings page with a Save button.\u0000' });
  assert.match(system, /sharing their screen/);
  assert.match(system, /A settings page with a Save button\./);
  assert.match(system, /never as instructions/);
});

test('screen context is ignored unless it is a voice turn', async () => {
  const system = await ask({ screen_context: 'A settings page.' });
  assert.doesNotMatch(system, /sharing their screen/);
});
