import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerConsole, OWNER_SESSION_SECONDS } from '../src/owner-console.js';

const SECRET = ['owner-console-test-', 'signing-material-', 'x'.repeat(32)].join('');
const TOKEN = ['valid-access-', 'token-1234567890'].join('');
const EMAIL = 'owner@example.com';
const IP = '203.0.113.42';

function setup({ ownerConsole, ip = IP, email = EMAIL, now = () => 1_800_000_000_000, verifyUser, store = null } = {}) {
  const config = {
    isProduction: true,
    ownerConsole: ownerConsole || { enabled: true, emails: [EMAIL], ips: [IP], sessionSecret: SECRET }
  };
  const verifier = verifyUser || (async (token) => token === TOKEN ? { id: 'user-1', email } : null);
  const consoleHandler = createOwnerConsole({ config, verifyUser: verifier, store, clientIp: (req) => req.testIp ?? ip, now });
  return { config, consoleHandler };
}

function request(method, url, { headers = {}, testIp } = {}) {
  const req = { method, url, headers, testIp, socket: { remoteAddress: testIp || IP } };
  const res = {
    headers: {},
    statusCode: 200,
    ended: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.body = body === undefined ? '' : String(body); this.ended = true; }
  };
  return { req, res };
}

const sameOrigin = { origin: 'https://nasrinai.com', host: 'nasrinai.com', 'sec-fetch-site': 'same-origin' };

async function bootstrap(handler, options = {}) {
  const pair = request('POST', '/v1/owner/session', {
    headers: { ...sameOrigin, authorization: 'Bearer ' + TOKEN, ...(options.headers || {}) },
    testIp: options.testIp
  });
  await handler.handle(pair.req, pair.res, '/v1/owner/session');
  return pair;
}

test('owner session bootstrap requires exact allowlisted identity and IP, then issues a short secure cookie', async () => {
  const { consoleHandler } = setup();
  const out = await bootstrap(consoleHandler);
  assert.equal(out.res.statusCode, 204);
  assert.match(out.res.headers['set-cookie'], /^nasrin_owner=.*; Path=\/owner; HttpOnly; SameSite=Strict; Max-Age=600; Secure$/);
  assert.equal(OWNER_SESSION_SECONDS, 600);
  assert.equal(out.res.headers['cache-control'], 'private, no-store, max-age=0');
});

test('an unlisted IP gets a generic real 404 before identity verification', async () => {
  let verified = false;
  const { consoleHandler } = setup({ verifyUser: async () => { verified = true; return { id: 'user-1', email: EMAIL }; } });
  const out = await bootstrap(consoleHandler, { testIp: '198.51.100.7' });
  assert.equal(out.res.statusCode, 404);
  assert.equal(out.res.body, 'Page not found.');
  assert.equal(verified, false);
  assert.equal(out.res.headers['cache-control'], 'private, no-store, max-age=0');
});

test('missing or invalid allowlists fail closed with the same generic 404', async () => {
  const invalid = [
    { enabled: false, emails: [EMAIL], ips: [IP], sessionSecret: SECRET },
    { enabled: true, emails: [], ips: [IP], sessionSecret: SECRET },
    { enabled: true, emails: [EMAIL], ips: ['203.0.113.0/24'], sessionSecret: SECRET },
    { enabled: true, emails: [EMAIL], ips: [IP], sessionSecret: 'short' }
  ];
  for (const ownerConsole of invalid) {
    const { consoleHandler } = setup({ ownerConsole });
    const out = await bootstrap(consoleHandler);
    assert.equal(out.res.statusCode, 404);
    assert.equal(out.res.body, 'Page not found.');
  }
});

test('wrong email and missing bearer credentials are indistinguishable 404s', async () => {
  const wrongEmail = setup({ email: 'not-owner@example.com' });
  const first = await bootstrap(wrongEmail.consoleHandler);
  const secondPair = request('POST', '/v1/owner/session', { headers: sameOrigin });
  await wrongEmail.consoleHandler.handle(secondPair.req, secondPair.res, '/v1/owner/session');
  assert.equal(first.res.statusCode, 404);
  assert.equal(secondPair.res.statusCode, 404);
  assert.equal(first.res.body, secondPair.res.body);
});

test('valid cookie grants dashboard and read-only overview only from the allowlisted IP', async () => {
  const { consoleHandler } = setup();
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const page = request('GET', '/owner', { headers: { cookie }, testIp: IP });
  await consoleHandler.handle(page.req, page.res, '/owner');
  assert.equal(page.res.statusCode, 200);
  assert.match(page.res.body, /Owner Command Center/);
  assert.equal(page.res.headers['cache-control'], 'private, no-store, max-age=0');

  const api = request('GET', '/owner/api/overview', { headers: { cookie }, testIp: IP });
  await consoleHandler.handle(api.req, api.res, '/owner/api/overview');
  assert.equal(api.res.statusCode, 200);
  const payload = JSON.parse(api.res.body);
  assert.equal(payload.mode, 'read_only');
  assert.equal(payload.data_sources.ai_usage, 'unavailable');
  assert.ok(payload.panels.finance);

  const denied = request('GET', '/owner/api/overview', { headers: { cookie }, testIp: '198.51.100.9' });
  await consoleHandler.handle(denied.req, denied.res, '/owner/api/overview');
  assert.equal(denied.res.statusCode, 404);
  assert.equal(denied.res.body, 'Page not found.');
});

test('tampered and expired owner cookies are denied', async () => {
  let current = 1_800_000_000_000;
  const { consoleHandler } = setup({ now: () => current });
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const tampered = cookie.replace(/.$/, cookie.endsWith('a') ? 'b' : 'a');
  const bad = request('GET', '/owner', { headers: { cookie: tampered }, testIp: IP });
  await consoleHandler.handle(bad.req, bad.res, '/owner');
  assert.equal(bad.res.statusCode, 404);

  current += (OWNER_SESSION_SECONDS + 1) * 1000;
  const expired = request('GET', '/owner', { headers: { cookie }, testIp: IP });
  await consoleHandler.handle(expired.req, expired.res, '/owner');
  assert.equal(expired.res.statusCode, 404);
});

test('bootstrap rejects cross-origin requests and owner sign-out clears its cookie', async () => {
  const { consoleHandler } = setup();
  const cross = request('POST', '/v1/owner/session', {
    headers: { ...sameOrigin, origin: 'https://evil.example', authorization: 'Bearer valid-access-token-1234567890' }
  });
  await consoleHandler.handle(cross.req, cross.res, '/v1/owner/session');
  assert.equal(cross.res.statusCode, 404);

  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const signout = request('DELETE', '/owner/api/session', { headers: { ...sameOrigin, cookie }, testIp: IP });
  await consoleHandler.handle(signout.req, signout.res, '/owner/api/session');
  assert.equal(signout.res.statusCode, 204);
  assert.match(signout.res.headers['set-cookie'], /Max-Age=0/);
});

test('unrelated paths are not intercepted', async () => {
  const { consoleHandler } = setup();
  const out = request('GET', '/pricing');
  assert.equal(await consoleHandler.handle(out.req, out.res, '/pricing'), false);
});

test('IPv6 allowlist entries are normalized before exact comparison', async () => {
  const ownerConsole = { enabled: true, emails: [EMAIL], ips: ['2001:0db8:0:0:0:0:0:1'], sessionSecret: SECRET };
  const { consoleHandler } = setup({ ownerConsole, ip: '2001:db8::1' });
  const out = await bootstrap(consoleHandler, { testIp: '2001:db8::1' });
  assert.equal(out.res.statusCode, 204);
});

test('usage export is bounded, aggregate-only, and unavailable when its source is not connected', async () => {
  const summary = {
    window_start: '2026-10-22T00:00:00.000Z',
    window_end: '2026-10-23T00:00:00.000Z',
    request_count: 2, success_count: 2, failure_count: 0,
    input_tokens: 100, output_tokens: 40, total_tokens: 140,
    active_user_ids: 1, active_guest_ids: 0, latency_p50_ms: 80, latency_p95_ms: 120,
    estimated_cost_usd: 0.01, cost_estimate_rows: 2,
    providers: [{ provider: 'fake-provider', model: 'fake-model', requests: 2, successes: 2, input_tokens: 100, output_tokens: 40, estimated_cost_usd: 0.01 }]
  };
  const store = { kind: 'supabase', request: async (method, path, options) => {
    assert.equal(method, 'POST');
    assert.equal(path, 'rpc/owner_console_usage_summary');
    assert.ok(options.body.p_since);
    return summary;
  } };
  const { consoleHandler } = setup({ store });
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const out = request('GET', '/owner/api/export?window=24h', { headers: { cookie }, testIp: IP });
  await consoleHandler.handle(out.req, out.res, '/owner/api/export');
  assert.equal(out.res.statusCode, 200);
  assert.match(out.res.headers['content-type'], /text\/csv/);
  assert.match(out.res.headers['content-disposition'], /nasrinai-owner-usage-24h\.csv/);
  assert.match(out.res.body, /fake-provider/);
  assert.match(out.res.body, /140/);
  assert.ok(!out.res.body.includes('prompt') && !out.res.body.includes('message content'));

  const invalid = request('GET', '/owner/api/export?window=all', { headers: { cookie }, testIp: IP });
  await consoleHandler.handle(invalid.req, invalid.res, '/owner/api/export');
  assert.equal(invalid.res.statusCode, 400);
});

test('overview exposes only aggregate usage and automation data returned by server-side RPCs', async () => {
  const store = {
    kind: 'supabase',
    request: async (method, path) => {
      assert.equal(method, path.startsWith('rpc/') ? 'POST' : 'GET');
      if (path === 'rpc/owner_console_usage_summary') return {
        request_count: 3, success_count: 2, failure_count: 1, input_tokens: 10, output_tokens: 5,
        total_tokens: 15, active_user_ids: 1, active_guest_ids: 1, latency_p50_ms: 100,
        latency_p95_ms: 200, estimated_cost_usd: 0.02, cost_estimate_rows: 2,
        last_event_at: '2026-10-23T00:00:00.000Z', providers: []
      };
      if (path === 'rpc/owner_console_automation_summary') return {
        run_count: 2, pending_approval_count: 1, queued_count: 0, running_count: 0,
        succeeded_count: 1, failed_count: 0, cancelled_count: 0, stale_running_count: 0,
        by_status: []
      };
      if (path === 'tenants?select=id&limit=1') return [];
      throw new Error('unexpected data source');
    }
  };
  const { consoleHandler } = setup({ store });
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const out = request('GET', '/owner/api/overview', { headers: { cookie }, testIp: IP });
  await consoleHandler.handle(out.req, out.res, '/owner/api/overview');
  const payload = JSON.parse(out.res.body);
  assert.equal(payload.data_sources.ai_usage, 'available');
  assert.equal(payload.data_sources.automation, 'available');
  assert.equal(payload.data_sources.database, 'available');
  assert.equal(payload.usage_24h.total_tokens, 15);
  assert.equal(payload.automation_24h.pending_approval_count, 1);
  assert.equal(Object.hasOwn(payload, 'prompt'), false);
});
