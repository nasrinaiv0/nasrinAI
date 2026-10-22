import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerConsole, OWNER_SESSION_SECONDS } from '../src/owner-console.js';

const SECRET = 'test-owner-console-session-secret-32-bytes-minimum';
const EMAIL = 'owner@example.com';
const IP = '203.0.113.42';

function setup({ ownerConsole, ip = IP, email = EMAIL, now = () => 1_800_000_000_000, verifyUser } = {}) {
  const config = {
    isProduction: true,
    ownerConsole: ownerConsole || { enabled: true, emails: [EMAIL], ips: [IP], sessionSecret: SECRET }
  };
  const verifier = verifyUser || (async (token) => token === 'valid-access-token-1234567890' ? { id: 'user-1', email } : null);
  const consoleHandler = createOwnerConsole({ config, verifyUser: verifier, clientIp: (req) => req.testIp ?? ip, now });
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
    headers: { ...sameOrigin, authorization: 'Bearer valid-access-token-1234567890', ...(options.headers || {}) },
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
