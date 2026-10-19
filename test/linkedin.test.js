import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLinkedInIntegration } from '../src/linkedin/index.js';

const ENV_KEYS = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_OAUTH_SCOPES', 'LINKEDIN_API_VERSION'];
function withEnv(values, fn) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try { return fn(); }
  finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}
const config = {
  publicUrl: 'https://nasrinai.example',
  connectors: { key: Buffer.alloc(32, 7) },
  supabaseUrl: 'https://project.supabase.co',
  supabaseSecretKey: 'server-only-test-key'
};

test('LinkedIn integration stays unavailable without all server-side prerequisites', () => {
  withEnv({}, () => {
    const integration = createLinkedInIntegration({ config: { publicUrl: null, connectors: {}, supabaseUrl: null, supabaseSecretKey: null }, fetchImpl: async () => { throw new Error('network should not be called'); } });
    assert.equal(integration.available, false);
    assert.ok(integration.routes.some((route) => route.path === '/v1/linkedin/status'));
  });
});

test('LinkedIn OAuth asks only for configured allow-listed scopes and uses a signed-in user', async () => {
  await withEnv({
    LINKEDIN_CLIENT_ID: 'test-client',
    LINKEDIN_CLIENT_SECRET: 'test-secret',
    LINKEDIN_OAUTH_SCOPES: 'openid profile email r_organization_social',
    LINKEDIN_API_VERSION: '202610'
  }, async () => {
    const integration = createLinkedInIntegration({ config, fetchImpl: async () => { throw new Error('network should not be called'); } });
    assert.equal(integration.available, true);
    const route = integration.routes.find((item) => item.method === 'POST' && item.path === '/v1/linkedin/connect');
    const headers = [];
    const response = await route.handler({
      caller: { actor: { type: 'user', id: 'user-1' }, tenantId: '00000000-0000-4000-8000-000000000001' },
      res: { appendHeader: (...args) => headers.push(args) }
    });
    const url = new URL(response.body.url);
    assert.equal(url.origin + url.pathname, 'https://www.linkedin.com/oauth/v2/authorization');
    assert.equal(url.searchParams.get('client_id'), 'test-client');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://nasrinai.example/v1/linkedin/callback');
    assert.deepEqual(url.searchParams.get('scope').split(' ').sort(), ['email', 'openid', 'profile', 'r_organization_social'].sort());
    assert.ok(headers.some(([name, value]) => name === 'Set-Cookie' && value.includes('HttpOnly') && value.includes('SameSite=Lax')));
    await assert.rejects(route.handler({ caller: { actor: { type: 'guest', id: 'guest-1' }, tenantId: 'tenant' }, res: { appendHeader() {} } }), { code: 'sign_in_required' });
  });
});

test('LinkedIn integration rejects unapproved OAuth scopes rather than requesting them', () => {
  withEnv({
    LINKEDIN_CLIENT_ID: 'test-client',
    LINKEDIN_CLIENT_SECRET: 'test-secret',
    LINKEDIN_OAUTH_SCOPES: 'openid profile email r_lots_of_private_data'
  }, () => {
    const integration = createLinkedInIntegration({ config, fetchImpl: async () => { throw new Error('network should not be called'); } });
    assert.equal(integration.available, false);
  });
});

test('organization-post search validates organization IDs and never claims to be global LinkedIn search', async () => {
  await withEnv({
    LINKEDIN_CLIENT_ID: 'test-client',
    LINKEDIN_CLIENT_SECRET: 'test-secret'
  }, async () => {
    const integration = createLinkedInIntegration({ config, fetchImpl: async () => { throw new Error('network should not be called'); } });
    const caller = { actor: { type: 'user', id: 'user-1' }, tenantId: '00000000-0000-4000-8000-000000000001' };
    await assert.rejects(integration.searchOrganizationPosts(caller, { organizationId: 'urn:li:organization:123' }), { code: 'invalid_organization_id' });
    assert.equal(integration.routes.find((route) => route.path === '/v1/linkedin/organization-posts').method, 'GET');
  });
});
