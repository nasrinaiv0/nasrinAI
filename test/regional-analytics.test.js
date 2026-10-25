import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalAnalytics, regionFromTrustedHeaders } from '../src/regional-analytics.js';

test('regionFromTrustedHeaders ignores browser-supplied location without Vercel edge marker', () => {
  assert.deepEqual(regionFromTrustedHeaders({
    'x-vercel-ip-country': 'PH',
    'x-vercel-ip-country-region': 'Davao',
    'x-vercel-ip-city': 'Davao City'
  }), { countryCode: null, region: null, city: null });
});

test('regionFromTrustedHeaders normalizes trusted coarse region data', () => {
  assert.deepEqual(regionFromTrustedHeaders({
    'x-vercel-id': 'sin1::test',
    'x-vercel-ip-country': 'ph',
    'x-vercel-ip-country-region': 'DVO',
    'x-vercel-ip-city': 'Davao City'
  }), { countryCode: 'PH', region: 'DVO', city: 'Davao City' });
});

test('regional analytics stores only a pseudonymous actor hash and coarse location', async () => {
  let request;
  const analytics = createRegionalAnalytics({
    url: 'https://example.supabase.co',
    serviceKey: 'service-secret',
    hashSecret: 'test-hash-secret',
    platformTenantId: 'platform',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true };
    }
  });
  const result = await analytics.record({
    req: { headers: { 'x-vercel-id': 'sin1::test', 'x-vercel-ip-country': 'PH', 'x-vercel-ip-country-region': 'DVO', 'x-vercel-ip-city': 'Davao City' } },
    caller: { tenantId: 'platform', actor: { type: 'user', id: 'auth-user-id-secret' } }
  });
  assert.equal(result, true);
  assert.equal(request.url, 'https://example.supabase.co/rest/v1/rpc/record_regional_analytics_event');
  assert.equal(request.body.p_event_type, 'session_start');
  assert.equal(request.body.p_actor_type, 'user');
  assert.match(request.body.p_actor_key_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(request.body.p_actor_key_hash, 'auth-user-id-secret');
  assert.equal(request.body.p_country_code, 'PH');
  assert.equal(request.body.p_region, 'DVO');
  assert.equal(request.body.p_city, 'Davao City');
  assert.equal(JSON.stringify(request.body).includes('auth-user-id-secret'), false);
});

test('regional analytics skips other tenants and missing trusted location', async () => {
  let calls = 0;
  const analytics = createRegionalAnalytics({
    url: 'https://example.supabase.co',
    serviceKey: 'service-secret',
    platformTenantId: 'platform',
    fetchImpl: async () => { calls += 1; return { ok: true }; }
  });
  assert.equal(await analytics.record({
    req: { headers: { 'x-vercel-id': 'sin1::test', 'x-vercel-ip-country': 'PH' } },
    caller: { tenantId: 'customer-tenant', actor: { type: 'user', id: 'u1' } }
  }), false);
  assert.equal(await analytics.record({
    req: { headers: { 'x-vercel-ip-country': 'PH' } },
    caller: { tenantId: 'platform', actor: { type: 'guest', id: 'g1' } }
  }), false);
  assert.equal(calls, 0);
});

test('regional analytics fails open when telemetry storage is unavailable', async () => {
  const analytics = createRegionalAnalytics({
    url: 'https://example.supabase.co',
    serviceKey: 'service-secret',
    platformTenantId: 'platform',
    logger: { warn() {} },
    fetchImpl: async () => ({ ok: false, status: 500 })
  });
  assert.equal(await analytics.record({
    req: { headers: { 'x-vercel-id': 'sin1::test', 'x-vercel-ip-country': 'PH' } },
    caller: { tenantId: 'platform', actor: { type: 'guest', id: 'g1' } }
  }), false);
});
