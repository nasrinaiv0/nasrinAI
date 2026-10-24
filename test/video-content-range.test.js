import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseByteRange } from '../src/http/range.js';
import { buildRoutes } from '../src/routes.js';
import { testConfig } from './helpers.js';

test('parseByteRange handles the single ranges browsers send', () => {
  assert.deepEqual(parseByteRange('bytes=0-', 1000), { type: 'range', start: 0, end: 999 });
  assert.deepEqual(parseByteRange('bytes=0-1', 1000), { type: 'range', start: 0, end: 1 });
  assert.deepEqual(parseByteRange('bytes=100-199', 1000), { type: 'range', start: 100, end: 199 });
  assert.deepEqual(parseByteRange('bytes=900-5000', 1000), { type: 'range', start: 900, end: 999 }, 'end is clamped to the file');
  assert.deepEqual(parseByteRange('bytes=-100', 1000), { type: 'range', start: 900, end: 999 });
  assert.deepEqual(parseByteRange('bytes=-5000', 1000), { type: 'range', start: 0, end: 999 });
});

test('parseByteRange reports ranges outside the file as unsatisfiable', () => {
  assert.deepEqual(parseByteRange('bytes=1000-', 1000), { type: 'unsatisfiable' });
  assert.deepEqual(parseByteRange('bytes=2000-3000', 1000), { type: 'unsatisfiable' });
  assert.deepEqual(parseByteRange('bytes=-0', 1000), { type: 'unsatisfiable' });
});

test('parseByteRange ignores missing, multiple and malformed ranges', () => {
  for (const header of [undefined, null, '', 'bytes=', 'bytes=-', 'bytes=0-1,5-9', 'items=0-1', 'bytes=abc-def', 'bytes=9-3', 'bytes=0-1; evil']) {
    assert.deepEqual(parseByteRange(header, 1000), { type: 'none' }, String(header));
  }
  assert.deepEqual(parseByteRange('bytes=0-', 0), { type: 'none' }, 'an empty file has nothing to range over');
});

function contentRoute(bytes) {
  const routes = buildRoutes({
    config: testConfig(), gateway: {}, limiter: {}, conversations: {}, chat: {},
    videos: { async read(_caller, id) { return { id, mime: 'video/mp4', bytes }; } }
  });
  const route = routes.find((r) => r.method === 'GET' && r.path === '/v1/videos/:id/content');
  assert.ok(route, 'content route exists');
  return route;
}

async function call(bytes, range) {
  const out = { status: null, headers: null, body: null };
  const res = { writeHead(status, headers) { out.status = status; out.headers = headers; }, end(body) { out.body = body ?? null; } };
  const req = { headers: range ? { range } : {} };
  await contentRoute(bytes).handler({ caller: {}, params: { id: '11111111-1111-4111-8111-111111111111' }, req, res });
  return out;
}

const file = Buffer.from('0123456789'.repeat(10)); // 100 bytes

test('video content without a Range header is a full 200 that advertises byte ranges', async () => {
  const out = await call(file, null);
  assert.equal(out.status, 200);
  assert.equal(out.headers['Accept-Ranges'], 'bytes');
  assert.equal(out.headers['Content-Length'], 100);
  assert.equal(out.body.length, 100);
});

test('video content answers a Range request with 206 and the right bytes', async () => {
  const out = await call(file, 'bytes=10-19');
  assert.equal(out.status, 206);
  assert.equal(out.headers['Content-Range'], 'bytes 10-19/100');
  assert.equal(out.headers['Content-Length'], 10);
  assert.equal(out.headers['Accept-Ranges'], 'bytes');
  assert.equal(out.body.toString(), '0123456789');
  const probe = await call(file, 'bytes=0-1');
  assert.equal(probe.status, 206, 'the Safari probe request for the first two bytes');
  assert.equal(probe.headers['Content-Range'], 'bytes 0-1/100');
});

test('video content refuses an out-of-range request with 416', async () => {
  const out = await call(file, 'bytes=500-');
  assert.equal(out.status, 416);
  assert.equal(out.headers['Content-Range'], 'bytes */100');
  assert.equal(out.body, null);
});
