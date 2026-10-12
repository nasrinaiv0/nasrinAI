import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUploads, ownerKey } from '../src/uploads.js';
import { createFakeProvider } from '../src/ai/fake.js';
import { buildTestApp, serve, bearer, postJson, testConfig } from './helpers.js';

// Direct uploads (docs/uploads.md) against a stand-in for Supabase Storage.

const SUPA = 'https://abcd.supabase.co';
const SECRET = 'sb_secret_' + 'x'.repeat(30);
const ENV = { UPLOADS_DIRECT: 'true', SUPABASE_URL: SUPA, SUPABASE_SECRET_KEY: SECRET };
const b64 = (buf) => Buffer.from(buf).toString('base64');

function fakeStorage({ now = () => Date.now() } = {}) {
  const objects = new Map();   // name -> { bytes, created }
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    calls.push({ method, path: u.pathname, auth: init.headers?.Authorization, apikey: init.headers?.apikey, body: init.body });
    assert.equal(u.origin, SUPA);
    assert.equal(init.headers?.Authorization, 'Bearer ' + SECRET, 'the secret key is used, server side');
    let m;
    if (method === 'POST' && (m = /^\/storage\/v1\/object\/upload\/sign\/chat-uploads\/(.+)$/.exec(u.pathname))) {
      return Response.json({ url: `/object/upload/sign/chat-uploads/${m[1]}?token=one-time` });
    }
    if (method === 'GET' && (m = /^\/storage\/v1\/object\/chat-uploads\/(.+)$/.exec(u.pathname))) {
      const o = objects.get(m[1]);
      if (!o) return Response.json({ statusCode: '404', error: 'not_found', message: 'Object not found' }, { status: 400 });
      return new Response(o.bytes, { status: 200 });
    }
    if (method === 'DELETE' && u.pathname === '/storage/v1/object/chat-uploads') {
      const { prefixes } = JSON.parse(init.body);
      for (const p of prefixes) objects.delete(p);
      return Response.json(prefixes.map((name) => ({ name })));
    }
    if (method === 'POST' && u.pathname === '/storage/v1/object/list/chat-uploads') {
      return Response.json([...objects].map(([name, o]) => ({ name, created_at: new Date(o.created).toISOString() })));
    }
    return Response.json({ message: 'unexpected' }, { status: 500 });
  };
  // What the browser does with the one-time link.
  const put = (uploadUrl, bytes) => {
    const m = /\/object\/upload\/sign\/chat-uploads\/([^?]+)\?token=one-time$/.exec(uploadUrl);
    assert.ok(m, 'a one-time link for one object');
    objects.set(m[1], { bytes: Buffer.from(bytes), created: now() });
  };
  return { fetchImpl, objects, calls, put };
}

const caller = (id = 'user-1', type = 'user') => ({ tenantId: '00000000-0000-0000-0000-000000000000', actor: { type, id } });
const okLimiter = { calls: 0, async upload() { this.calls += 1; } };

function uploadsFor(storage, env = {}, extra = {}) {
  const config = testConfig({ ...ENV, ...env });
  return createUploads({ config, limiter: okLimiter, fetchImpl: storage.fetchImpl, ...extra });
}

test('config: off by default; on needs Supabase; limits fall back with a warning', () => {
  assert.equal(testConfig().uploads.enabled, false);
  assert.equal(testConfig().ai.attachments.maxTotalBytes, 3 * 1024 * 1024);
  const on = testConfig(ENV);
  assert.equal(on.uploads.enabled, true);
  assert.equal(on.ai.attachments.maxTotalBytes, 20 * 1024 * 1024);
  assert.equal(on.ai.attachments.maxInlineBytes, 3 * 1024 * 1024, 'files inside the request stay small');
  const noSupa = testConfig({ UPLOADS_DIRECT: 'true' });
  assert.equal(noSupa.uploads.enabled, false);
  assert.match(noSupa.warnings.join(' '), /UPLOADS_DIRECT needs SUPABASE_URL/);
  const badMax = testConfig({ ...ENV, UPLOADS_MAX_MB: '500' });
  assert.equal(badMax.uploads.maxBytes, 20 * 1024 * 1024);
  assert.match(badMax.warnings.join(' '), /UPLOADS_MAX_MB/);
});

test('sign: a one-time link for one object under the caller\'s own name', async () => {
  const storage = fakeStorage();
  const up = uploadsFor(storage);
  const link = await up.sign(caller(), { name: 'report.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 5_000_000 }, '1.2.3.4');
  assert.match(link.id, /^[0-9a-f-]{36}$/);
  assert.equal(link.upload_url, `${SUPA}/storage/v1/object/upload/sign/chat-uploads/${ownerKey(caller())}_${link.id}?token=one-time`);
  assert.equal(link.max_bytes, 20 * 1024 * 1024);
  assert.equal(okLimiter.calls > 0, true, 'links are rate limited');
  assert.doesNotMatch(JSON.stringify(link), new RegExp(SECRET), 'the secret key never reaches the browser');

  await assert.rejects(up.sign(caller(), { name: 'big.pdf', type: 'application/pdf', size: 21 * 1024 * 1024 }), (e) => e.status === 413);
  await assert.rejects(up.sign(caller(), { name: 'x', type: 'not a type', size: 10 }), (e) => e.status === 400);
  await assert.rejects(up.sign(caller(), { name: 'x', size: 0 }), (e) => e.status === 400);
  await assert.rejects(up.sign(caller(), { name: 'x', size: '10' }), (e) => e.status === 400);
  assert.notEqual(ownerKey(caller('user-1')), ownerKey(caller('user-2')));
  assert.notEqual(ownerKey(caller('a', 'guest')), ownerKey(caller('a', 'user')));
});

test('resolve: reads the caller\'s upload once, deletes it, leaves inline files alone', async () => {
  const storage = fakeStorage();
  const up = uploadsFor(storage);
  const link = await up.sign(caller(), { name: 'notes.txt', type: 'text/plain', size: 5 }, 'ip');
  storage.put(link.upload_url, 'hello');
  const out = await up.resolve(caller(), [{ name: 'notes.txt', type: 'text/plain', upload: link.id }, { name: 'a.txt', data: b64('inline') }]);
  assert.deepEqual(out, [{ name: 'notes.txt', type: 'text/plain', data: b64('hello') }, { name: 'a.txt', data: b64('inline') }]);
  assert.equal(storage.objects.size, 0, 'deleted after use');

  // Used twice, or someone else's id: not found.
  await assert.rejects(up.resolve(caller(), [{ name: 'notes.txt', upload: link.id }]), (e) => e.status === 400 && /add it again/.test(e.message));
  const theirs = await up.sign(caller('user-2'), { name: 'secret.txt', type: 'text/plain', size: 3 }, 'ip');
  storage.put(theirs.upload_url, 'abc');
  await assert.rejects(up.resolve(caller('user-1'), [{ name: 'secret.txt', upload: theirs.id }]), (e) => e.status === 400);
  assert.equal(storage.objects.size, 1, 'another person\'s file is never read or removed');

  // Bad ids never reach storage.
  const before = storage.calls.length;
  await assert.rejects(up.resolve(caller(), [{ name: 'x', upload: '../../etc' }]), (e) => e.status === 400);
  assert.equal(storage.calls.length, before);

  // Nothing to resolve: the list comes back as it is.
  const plain = [{ name: 'a.txt', data: b64('x') }];
  assert.equal(await up.resolve(caller(), plain), plain);
  assert.equal(await up.resolve(caller(), undefined), undefined);
});

test('resolve: too large in total is refused, and the upload is still deleted', async () => {
  const storage = fakeStorage();
  const up = uploadsFor(storage, { UPLOADS_MAX_MB: '1' });
  const link = await up.sign(caller(), { name: 'big.bin', size: 1024 }, 'ip');
  storage.put(link.upload_url, Buffer.alloc(1024 * 1024 + 1));   // more than it said
  await assert.rejects(up.resolve(caller(), [{ name: 'big.bin', upload: link.id }]), (e) => e.status === 413);
  assert.equal(storage.objects.size, 0);
});

test('purge: removes only uploads older than an hour', async () => {
  let t = Date.parse('2026-10-12T00:00:00Z');
  const storage = fakeStorage({ now: () => t });
  const up = uploadsFor(storage, {}, { now: () => t });
  const old = await up.sign(caller(), { name: 'a', size: 1 }, 'ip');
  storage.put(old.upload_url, 'a');
  t += 50 * 60 * 1000;
  const fresh = await up.sign(caller(), { name: 'b', size: 1 }, 'ip');
  storage.put(fresh.upload_url, 'b');
  storage.objects.set('not-ours.txt', { bytes: Buffer.from('x'), created: 0 });
  t += 20 * 60 * 1000;
  assert.equal(await up.purge(), 1);
  assert.deepEqual([...storage.objects.keys()].sort(), [`${ownerKey(caller())}_${fresh.id}`, 'not-ours.txt'].sort());
});

test('end to end: a direct upload reaches the model like an inline file; status offers it', async () => {
  const storage = fakeStorage();
  const provider = createFakeProvider({ dataLeavesServer: true, reply: () => 'Got it.' });
  const built = buildTestApp({ provider, env: ENV, storageFetch: storage.fetchImpl });
  const srv = await serve(built.app);
  try {
    const status = await (await fetch(srv.url + '/v1/status')).json();
    assert.deepEqual(status.uploads, { direct: true, max_mb: 20 });
    const g = (await (await fetch(srv.url + '/v1/guest/sessions', { method: 'POST' })).json()).token;
    const sign = await postJson(srv.url + '/v1/uploads', { name: 'notes.txt', type: 'text/plain', size: 25 }, bearer(g));
    assert.equal(sign.status, 200);
    const link = await sign.json();
    storage.put(link.upload_url, 'Meeting moved to Tuesday.');
    const r = await postJson(srv.url + '/v1/chat', { message: 'Summarise', attachments: [{ name: 'notes.txt', type: 'text/plain', upload: link.id }] }, bearer(g));
    assert.equal(r.status, 200);
    assert.match(provider.calls[0].messages.at(-1).content, /Meeting moved to Tuesday/);
    assert.equal(storage.objects.size, 0);
    // Without a session, no link.
    assert.equal((await postJson(srv.url + '/v1/uploads', { name: 'x', size: 1 })).status, 401);
  } finally { await srv.close(); }

  // Off: no route, and status says so.
  const off = buildTestApp({ provider });
  const srv2 = await serve(off.app);
  try {
    assert.deepEqual((await (await fetch(srv2.url + '/v1/status')).json()).uploads, { direct: false });
    const g = (await (await fetch(srv2.url + '/v1/guest/sessions', { method: 'POST' })).json()).token;
    assert.equal((await postJson(srv2.url + '/v1/uploads', { name: 'x', size: 1 }, bearer(g))).status, 404);
    assert.equal((await postJson(srv2.url + '/v1/chat', { message: 'hi', attachments: [{ name: 'x', upload: '00000000-0000-4000-8000-000000000000' }] }, bearer(g))).status, 400);
  } finally { await srv2.close(); }
});
