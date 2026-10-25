import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerConsole, OWNER_SESSION_SECONDS } from '../src/owner-console.js';

const SECRET = ['owner-console-test-', 'signing-material-', 'x'.repeat(32)].join('');
const TOKEN = ['valid-access-', 'token-1234567890'].join('');
const EMAIL = 'owner@example.com';
const IP = '203.0.113.42';

function setup({ ownerConsole, ip = IP, email = EMAIL, now = () => 1_800_000_000_000, verifyUser, store = null, fetchImpl, openrouterManagementKey = '', openrouterApiKey = '' } = {}) {
  const config = {
    isProduction: true,
    ownerConsole: ownerConsole || { enabled: true, emails: [EMAIL], ips: [IP], sessionSecret: SECRET }
  };
  const verifier = verifyUser || (async (token) => token === TOKEN ? { id: 'user-1', email } : null);
  const activeStore = store || { kind: 'supabase', request: async (_method, path) => { if (path === 'rpc/owner_console_record_audit') return null; throw new Error('source unavailable'); } };
  const consoleHandler = createOwnerConsole({ config, verifyUser: verifier, store: activeStore, clientIp: (req) => req.testIp ?? ip, now, fetchImpl, openrouterManagementKey, openrouterApiKey });
  return { config, consoleHandler };
}

function request(method, url, { headers = {}, testIp } = {}) {
  const req = { method, url, headers: { host: 'owner.nasrinai.com', ...headers }, testIp, socket: { remoteAddress: testIp || IP } };
  const res = {
    headers: {},
    statusCode: 200,
    ended: false,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body) { this.body = body === undefined ? '' : String(body); this.ended = true; }
  };
  return { req, res };
}

const sameOrigin = { origin: 'https://owner.nasrinai.com', host: 'owner.nasrinai.com', 'sec-fetch-site': 'same-origin' };

async function bootstrap(handler, options = {}) {
  const pair = request('POST', '/v1/owner/session', {
    headers: { origin: 'https://nasrinai.com', host: 'owner.nasrinai.com', 'sec-fetch-site': 'same-site', authorization: 'Bearer ' + TOKEN, ...(options.headers || {}) },
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

test('production console page and APIs are hidden on the main site host', async () => {
  const { consoleHandler } = setup();
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  for (const path of ['/owner', '/owner/api/overview']) {
    const out = request('GET', path, { headers: { host: 'nasrinai.com', cookie }, testIp: IP });
    await consoleHandler.handle(out.req, out.res, path);
    assert.equal(out.res.statusCode, 404);
    assert.equal(out.res.body, 'Page not found.');
  }
});

test('production bootstrap cannot mint an owner session on the main site host', async () => {
  const { consoleHandler } = setup();
  const out = request('POST', '/v1/owner/session', {
    headers: { origin: 'https://nasrinai.com', host: 'nasrinai.com', 'sec-fetch-site': 'same-origin', authorization: 'Bearer ' + TOKEN },
    testIp: IP
  });
  await consoleHandler.handle(out.req, out.res, '/v1/owner/session');
  assert.equal(out.res.statusCode, 404);
  assert.equal(out.res.headers['set-cookie'], undefined);
});

test('tampered and expired owner cookies are denied', async () => {
  let current = 1_800_000_000_000;
  const { consoleHandler } = setup({ now: () => current });
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const [cookieName, cookieValue] = cookie.split('=');
  const [payload, signature] = cookieValue.split('.');
  const changedChar = signature[1] === 'a' ? 'b' : 'a';
  const tampered = `${cookieName}=${payload}.${signature[0]}${changedChar}${signature.slice(2)}`;
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
    headers: { origin: 'https://evil.example', host: 'owner.nasrinai.com', 'sec-fetch-site': 'cross-site', authorization: 'Bearer ' + TOKEN }
  });
  await consoleHandler.handle(cross.req, cross.res, '/v1/owner/session');
  assert.equal(cross.res.statusCode, 404);

  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const signout = request('DELETE', '/owner/api/session', { headers: { origin: 'https://owner.nasrinai.com', host: 'owner.nasrinai.com', 'sec-fetch-site': 'same-origin', cookie }, testIp: IP });
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
    provider_reported_cost_usd: 0.01, cost_known_rows: 2, cost_unknown_rows: 0,
    providers: [{ provider: 'fake-provider', model: 'fake-model', requests: 2, successes: 2, input_tokens: 100, output_tokens: 40, provider_reported_cost_usd: 0.01, cost_known_rows: 2, cost_unknown_rows: 0 }]
  };
  const store = { kind: 'supabase', request: async (method, path, options) => {
    assert.equal(method, 'POST');
    if (path === 'rpc/owner_console_record_audit') return null;
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
        latency_p95_ms: 200, provider_reported_cost_usd: 0.02, cost_known_rows: 2,
        last_event_at: '2026-10-23T00:00:00.000Z', providers: [], features: [{ feature: 'conversation', requests: 3, active_user_ids: 2, active_guest_ids: 1, total_tokens: 45, estimated_cost_usd: 0.02 }]
      };
      if (path === 'rpc/owner_console_automation_summary') return {
        run_count: 2, pending_approval_count: 1, queued_count: 0, running_count: 0,
        succeeded_count: 1, failed_count: 0, cancelled_count: 0, stale_running_count: 0,
        by_status: []
      };
      if (path === 'rpc/owner_console_plan_summary') return { active_paid_periods: 3, active_pro_periods: 1, active_max_periods: 1, active_ultra_periods: 1, new_periods: 2, paid_payment_count: 1, gross_paid_by_currency: [{ currency: 'PHP', payment_count: 1, gross_amount_minor: 12345 }] };
      if (path === 'rpc/owner_console_user_summary') return { auth_user_records: 12, new_auth_records_24h: 2, new_auth_records_7d: 4, active_signins_30d: 7, last_signup_at: '2026-10-22T00:00:00.000Z' };
      if (path === 'rpc/owner_console_growth_summary') return { active_user_ids_24h: 2, active_guest_ids_24h: 1, active_user_ids_7d: 3, active_guest_ids_7d: 2, active_user_ids_30d: 5, active_guest_ids_30d: 4, returning_user_ids_7d: 1, prior_week_user_ids: 2, return_rate_pct: 50 };
      if (path === 'rpc/owner_console_retention_summary') return { window_days: 14, definition: 'First observed signed-in model-call activity date', cohorts: [{ cohort_date: '2026-10-15', cohort_size: 4, day_1_eligible: 4, day_1_returned: 2, day_1_retention_pct: 50, day_7_eligible: 0, day_7_returned: 0, day_7_retention_pct: null }] };
      if (path === 'rpc/owner_console_incident_summary') return { ai_failed_requests: 1, automation_failed_runs: 1, stale_running_runs: 1, last_failure_at: '2026-10-23T00:00:00.000Z' };
      if (path === 'rpc/owner_console_audit_summary') return { event_count: 2, last_event_at: '2026-10-23T00:00:00.000Z', by_type: [] };
      if (path === 'rpc/owner_console_auth_audit_summary') return { available: true, event_count: 8, sign_in_events: 5, account_recovery_events: 1, password_change_events: 1, sign_out_events: 1, last_event_at: '2026-10-23T00:00:00.000Z', by_category: [] };
      if (path === 'rpc/owner_console_record_audit') return null;
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
  assert.equal(payload.data_sources.security_audit, 'available');
  assert.equal(payload.data_sources.platform_security, 'available');
  assert.equal(payload.platform_auth_audit_24h.event_count, 8);
  assert.equal(payload.platform_auth_audit_24h.sign_in_events, 5);
  assert.equal(Object.hasOwn(payload.platform_auth_audit_24h, 'payload'), false);
  assert.equal(payload.data_sources.incidents, 'available');
  assert.equal(payload.data_sources.finance, 'available');
  assert.equal(payload.plans_24h.paid_payment_count, 1);
  assert.equal(payload.plans_24h.gross_paid_by_currency[0].gross_amount_minor, 12345);
  assert.equal(payload.incidents_24h.stale_running_runs, 1);
  assert.equal(payload.audit_24h.event_count, 2);
  assert.equal(payload.user_summary.auth_user_records, 12);
  assert.equal(payload.user_summary.new_auth_records_24h, 2);
  assert.equal(payload.growth_summary.active_user_ids_24h, 2);
  assert.equal(payload.growth_summary.return_rate_pct, 50);
  assert.equal(payload.data_sources.retention, 'available');
  assert.equal(payload.retention_summary.cohorts[0].day_1_retention_pct, 50);
  assert.equal(payload.data_sources.users, 'available');
  assert.equal(Object.hasOwn(payload.user_summary, 'email'), false);
  assert.equal(payload.usage_24h.total_tokens, 15);
  assert.equal(payload.usage_24h.features[0].feature, 'conversation');
  assert.equal(payload.automation_24h.pending_approval_count, 1);
  assert.equal(Object.hasOwn(payload, 'prompt'), false);
});


test('Vercel deployment telemetry is sanitized and appears only when the optional source is configured', async () => {
  const ownerConsole = { enabled: true, emails: [EMAIL], ips: [IP], sessionSecret: SECRET, vercel: { enabled: true, token: 'v'.repeat(32), projectId: 'prj_test123', teamId: 'team_test123' } };
  let requestedUrl = '';
  const fetchImpl = async (url, options) => {
    requestedUrl = String(url);
    assert.match(options.headers.Authorization, /^Bearer /);
    return { ok: true, json: async () => ({ deployments: [
      { state: 'READY', url: 'nasrinai.example.vercel.app', target: 'production', created: 1792700000000, meta: { githubCommitRef: 'main', githubCommitSha: 'abcdef1234567890', privateThing: 'must-not-leak' } },
      { state: 'ERROR', url: 'bad-build.example.vercel.app', target: 'production', created: 1792690000000, meta: { githubCommitRef: 'main', githubCommitSha: '1234567890abcdef' } }
    ] }) };
  };
  const { consoleHandler } = setup({ ownerConsole, fetchImpl });
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const out = request('GET', '/owner/api/overview', { headers: { cookie }, testIp: IP });
  await consoleHandler.handle(out.req, out.res, '/owner/api/overview');
  const payload = JSON.parse(out.res.body);
  assert.match(requestedUrl, /^https:\/\/api\.vercel\.com\/v6\/deployments\?/);
  assert.equal(payload.data_sources.infrastructure, 'available');
  assert.equal(payload.deployment_summary.deployment_count, 2);
  assert.equal(payload.deployment_summary.ready_count, 1);
  assert.equal(payload.deployment_summary.failed_count, 1);
  assert.equal(Object.hasOwn(payload.deployment_summary.deployments[0], 'privateThing'), false);
});


test('cross-origin bootstrap sets a host-only owner cookie only for canonical same-site origins', async () => {
  const { consoleHandler } = setup();
  const headers = {
    origin: 'https://www.nasrinai.com',
    host: 'owner.nasrinai.com',
    'sec-fetch-site': 'same-site',
    authorization: 'Bearer ' + TOKEN
  };
  const preflight = request('OPTIONS', '/v1/owner/session', { headers, testIp: IP });
  await consoleHandler.handle(preflight.req, preflight.res, '/v1/owner/session');
  assert.equal(preflight.res.statusCode, 204);
  assert.equal(preflight.res.headers['access-control-allow-origin'], 'https://www.nasrinai.com');
  assert.equal(preflight.res.headers['access-control-allow-credentials'], 'true');
  assert.match(preflight.res.headers['access-control-allow-headers'], /Authorization/);

  const post = request('POST', '/v1/owner/session', { headers, testIp: IP });
  await consoleHandler.handle(post.req, post.res, '/v1/owner/session');
  assert.equal(post.res.statusCode, 204);
  assert.equal(post.res.headers['access-control-allow-origin'], 'https://www.nasrinai.com');
  assert.match(post.res.headers['set-cookie'], /^nasrin_owner=.*; Path=\/owner; HttpOnly; SameSite=Strict; Max-Age=600; Secure$/);
});

test('cross-origin owner bootstrap rejects unapproved origins and host combinations', async () => {
  const { consoleHandler } = setup();
  for (const headers of [
    { origin: 'https://evil.example', host: 'owner.nasrinai.com', 'sec-fetch-site': 'cross-site', authorization: 'Bearer ' + TOKEN },
    { origin: 'https://www.nasrinai.com', host: 'nasrinai.com', 'sec-fetch-site': 'same-site', authorization: 'Bearer ' + TOKEN },
    { origin: 'https://nasrinai.com', host: 'owner.nasrinai.com', 'sec-fetch-site': 'cross-site', authorization: 'Bearer ' + TOKEN }
  ]) {
    const out = request('POST', '/v1/owner/session', { headers, testIp: IP });
    await consoleHandler.handle(out.req, out.res, '/v1/owner/session');
    assert.equal(out.res.statusCode, 404);
    assert.equal(out.res.body, 'Page not found.');
    assert.equal(out.res.headers['set-cookie'], undefined);
  }
});


test('OpenRouter billing uses Analytics API and keeps optional credits failures from hiding spend', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/analytics/meta')) return {
      ok: true, json: async () => ({ data: { metrics: [
        { name: 'total_usage' }, { name: 'request_count' }, { name: 'tokens_prompt' },
        { name: 'tokens_completion' }, { name: 'tokens_total' }
      ] } })
    };
    if (String(url).endsWith('/analytics/query')) return {
      ok: true, json: async () => ({ data: { data: [
        { date__day: '2026-10-24T00:00:00.000Z', model: 'nvidia/test:free',
          total_usage: 0.02, request_count: 2, tokens_prompt: 100,
          tokens_completion: 40, tokens_total: 140 }
      ], metadata: { row_count: 1, truncated: false } } })
    };
    if (String(url).endsWith('/credits')) return { ok: false, status: 403, json: async () => ({}) };
    throw new Error('unexpected upstream URL');
  };
  const { consoleHandler } = setup({ fetchImpl, openrouterManagementKey: 'management-test-key', openrouterApiKey: 'inference-test-key' });
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const out = request('GET', '/owner/api/openrouter-billing?window=7d', { headers: { cookie }, testIp: IP });
  await consoleHandler.handle(out.req, out.res, '/owner/api/openrouter-billing');
  assert.equal(out.res.statusCode, 200);
  const payload = JSON.parse(out.res.body);
  assert.equal(payload.source, 'openrouter_analytics_api');
  assert.equal(payload.totals.provider_reported_cost_usd, 0.02);
  assert.equal(payload.totals.requests, 2);
  assert.equal(payload.totals.total_tokens, 140);
  assert.equal(payload.by_model[0].model, 'nvidia/test:free');
  assert.equal(payload.credits.total_credits, null);
  assert.ok(calls.some((call) => call.url.endsWith('/analytics/meta')));
  const query = calls.find((call) => call.url.endsWith('/analytics/query'));
  assert.ok(query);
  assert.equal(query.options.method, 'POST');
  assert.equal(query.options.headers.Authorization, 'Bearer management-test-key');
  const creditsCall = calls.find((call) => call.url.endsWith('/credits'));
  assert.ok(creditsCall);
  assert.equal(creditsCall.options.headers.Authorization, 'Bearer inference-test-key');
  assert.equal(JSON.parse(query.options.body).time_range.start, new Date(1_800_000_000_000 - 7 * 86400000).toISOString());
  assert.equal(calls.some((call) => call.url.endsWith('/activity')), false);
});

test('OpenRouter Analytics 403 is reported safely as a Management API permission error', async () => {
  const secretSentinel = 'never-echo-management-secret';
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ message: secretSentinel }) });
  const { consoleHandler } = setup({ fetchImpl, openrouterManagementKey: secretSentinel });
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const out = request('GET', '/owner/api/openrouter-billing?window=7d', { headers: { cookie }, testIp: IP });
  await consoleHandler.handle(out.req, out.res, '/owner/api/openrouter-billing');
  assert.equal(out.res.statusCode, 403);
  const payload = JSON.parse(out.res.body);
  assert.equal(payload.error.code, 'openrouter_management_forbidden');
  assert.match(payload.error.message, /authorized Management API key/);
  assert.equal(out.res.body.includes(secretSentinel), false);
});

test('OpenRouter request logs are available only inside the authenticated owner boundary and return sanitized rows', async () => {
  let queriedPath = '';
  const store = {
    kind: 'supabase',
    request: async (method, path) => {
      if (path === 'rpc/owner_console_record_audit') return null;
      assert.equal(method, 'GET');
      queriedPath = path;
      return [{
        id: 'row-1',
        request_id: 'request-1',
        created_at: '2026-10-24T10:00:00.000Z',
        provider: 'openrouter',
        upstream_provider: 'Example Provider',
        endpoint: '/chat/completions',
        http_method: 'POST',
        requested_model: 'example/model',
        model: 'example/model',
        prompt_tokens: 12,
        cached_tokens: 5,
        completion_tokens: 34,
        total_tokens: 46,
        total_cost_usd: 0.001,
        request_summary: { raw_prompt: 'must not be returned' },
        response_summary: { finish_reason: 'stop' },
        status: 'success',
        http_status: 200,
        error_code: null,
        latency_ms: 120,
        provider_request_id: 'gen-1',
        openrouter_generation_id: 'gen-1',
        provider_cost_source: 'openrouter_generation_api',
        provider_cost_reconciled_at: '2026-10-24T10:01:00.000Z',
        finish_reason: 'stop',
        generation_time_seconds: 0.5,
        upstream_inference_time_seconds: 0.4
      }];
    }
  };
  const { consoleHandler } = setup({ store });
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const out = request('GET', '/owner/api/openrouter-logs?window=7d&status=success&model=example%2Fmodel&endpoint=%2Fchat%2Fcompletions&limit=50&offset=0', {
    headers: { cookie }, testIp: IP
  });
  await consoleHandler.handle(out.req, out.res, '/owner/api/openrouter-logs');
  assert.equal(out.res.statusCode, 200);
  const payload = JSON.parse(out.res.body);
  assert.equal(payload.source, 'supabase.openrouter_logs');
  assert.equal(payload.rows.length, 1);
  assert.equal(payload.rows[0].upstream_provider, 'Example Provider');
  assert.equal(payload.rows[0].generation_time_seconds, 0.5);
  assert.equal(payload.rows[0].total_tokens, 46);
  assert.equal(payload.rows[0].cached_tokens, 5);
  assert.equal(Object.hasOwn(payload.rows[0], 'request_summary'), false);
  assert.equal(out.res.body.includes('must not be returned'), false);
  assert.match(queriedPath, /created_at=gte\./);
  assert.match(queriedPath, /status=eq.success/);
  assert.match(queriedPath, /endpoint=eq.%2Fchat%2Fcompletions/);
});

test('OpenRouter request log filters reject invalid windows and model syntax', async () => {
  let queries = 0;
  const store = { kind: 'supabase', request: async (_method, path) => {
    if (path === 'rpc/owner_console_record_audit') return null;
    queries++;
    return [];
  }};
  const { consoleHandler } = setup({ store });
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  for (const query of ['window=all', 'model=%3Cscript%3E']) {
    const out = request('GET', '/owner/api/openrouter-logs?' + query, { headers: { cookie }, testIp: IP });
    await consoleHandler.handle(out.req, out.res, '/owner/api/openrouter-logs');
    assert.equal(out.res.statusCode, 400);
  }
  assert.equal(queries, 0);
});

test('OpenRouter request logs remain hidden from non-allowlisted IP addresses', async () => {
  const { consoleHandler } = setup();
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const out = request('GET', '/owner/api/openrouter-logs', { headers: { cookie }, testIp: '198.51.100.99' });
  await consoleHandler.handle(out.req, out.res, '/owner/api/openrouter-logs');
  assert.equal(out.res.statusCode, 404);
  assert.equal(out.res.body, 'Page not found.');
});
test('cross-provider model inventory is owner-authenticated, sanitized, and does not mislabel auto aliases', async () => {
  const store = { kind: 'supabase', request: async (_method, path) => {
    if (path === 'rpc/owner_console_record_audit') return null;
    if (path.startsWith('usage_events?')) return [
      { provider: 'anthropic', model: 'claude-sonnet-example', task: 'chat', outcome: 'ok', created_at: '2026-10-24T10:00:00.000Z', input_tokens: 10, output_tokens: 20, latency_ms: 50, cost_usd: 0.01 }
    ];
    if (path.startsWith('openrouter_logs?')) return [
      { provider: 'openrouter', upstream_provider: 'ProviderX', requested_model: 'openrouter/auto', model: null, endpoint: '/chat/completions', status: 'success', created_at: '2026-10-24T11:00:00.000Z', prompt_tokens: 20, completion_tokens: 30, total_cost_usd: null },
      { provider: 'openrouter', upstream_provider: 'ProviderX', requested_model: 'openrouter/auto', model: 'providerx/actual-model', endpoint: '/chat/completions', status: 'success', created_at: '2026-10-24T11:01:00.000Z', prompt_tokens: 20, completion_tokens: 30, total_cost_usd: null }
    ];
    throw new Error('unexpected query');
  }};
  const { consoleHandler } = setup({ store, fetchImpl: async () => { throw new Error('catalog unavailable'); } });
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const out = request('GET', '/owner/api/unlisted-models?window=7d', { headers: { cookie }, testIp: IP });
  await consoleHandler.handle(out.req, out.res, '/owner/api/unlisted-models');
  assert.equal(out.res.statusCode, 200);
  const payload = JSON.parse(out.res.body);
  assert.ok(payload.rows.some((row) => row.provider === 'anthropic' && row.model === 'claude-sonnet-example'));
  assert.ok(payload.rows.some((row) => row.model === 'providerx/actual-model'));
  assert.equal(payload.rows.some((row) => row.model === 'openrouter/auto'), false);
  assert.equal(payload.catalog_coverage.openrouter, 'unavailable');
  assert.equal(out.res.body.includes('prompt_tokens'), false);
});


test('regional analytics API is owner-session protected, bounded, and aggregate-only', async () => {
  let called = false;
  const store = {
    kind: 'supabase',
    request: async (method, path, options) => {
      if (path === 'rpc/owner_console_record_audit') return null;
      assert.equal(method, 'POST');
      assert.equal(path, 'rpc/owner_console_regional_summary');
      assert.ok(options.body.p_since);
      called = true;
      return {
        event_count: 3, unique_actors: 2, countries_seen: 1, user_events: 2, guest_events: 1,
        latest_event_at: '2026-10-25T10:00:00.000Z',
        rows: [{ country_code: 'PH', region: 'Davao del Sur', city: 'Davao City', actor_type: 'user', events: 2, unique_actors: 1, latest_activity: '2026-10-25T10:00:00.000Z' }]
      };
    }
  };
  const { consoleHandler } = setup({ store });
  const opened = await bootstrap(consoleHandler);
  const cookie = opened.res.headers['set-cookie'].split(';')[0];
  const out = request('GET', '/owner/api/regional-analytics?window=7d', { headers: { cookie }, testIp: IP });
  await consoleHandler.handle(out.req, out.res, '/owner/api/regional-analytics');
  assert.equal(out.res.statusCode, 200);
  const payload = JSON.parse(out.res.body);
  assert.equal(payload.summary.event_count, 3);
  assert.equal(payload.rows[0].country_code, 'PH');
  assert.equal(payload.rows[0].actor_type, 'user');
  assert.equal(Object.hasOwn(payload.rows[0], 'actor_key_hash'), false);
  assert.equal(Object.hasOwn(payload.rows[0], 'email'), false);
  assert.equal(called, true);

  const invalid = request('GET', '/owner/api/regional-analytics?window=all', { headers: { cookie }, testIp: IP });
  await consoleHandler.handle(invalid.req, invalid.res, '/owner/api/regional-analytics');
  assert.equal(invalid.res.statusCode, 400);

  const denied = request('GET', '/owner/api/regional-analytics?window=7d', { headers: { cookie }, testIp: '198.51.100.9' });
  await consoleHandler.handle(denied.req, denied.res, '/owner/api/regional-analytics');
  assert.equal(denied.res.statusCode, 404);
});
