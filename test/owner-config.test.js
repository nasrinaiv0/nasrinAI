import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('owner console is disabled unless all server-side allowlist settings are valid', () => {
  const disabled = loadConfig({ NODE_ENV: 'test' });
  assert.equal(disabled.ownerConsole.enabled, false);
  assert.deepEqual(disabled.ownerConsole.emails, []);
  assert.deepEqual(disabled.ownerConsole.ips, []);
  assert.equal(disabled.ownerConsole.sessionSecret, '');
});

test('owner console accepts exact email and IPv4 allowlists from environment', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    OWNER_ALLOWED_EMAILS: 'Owner@example.com, second@example.org',
    OWNER_ALLOWED_IPS: '203.0.113.7,198.51.100.8',
    OWNER_SESSION_SECRET: 's'.repeat(40)
  });
  assert.equal(config.ownerConsole.enabled, true);
  assert.deepEqual(config.ownerConsole.emails, ['owner@example.com', 'second@example.org']);
  assert.deepEqual(config.ownerConsole.ips, ['203.0.113.7', '198.51.100.8']);
  assert.equal(config.ownerConsole.sessionSecret, 's'.repeat(40));
});

test('malformed entries or a short session secret disable the owner console without breaking the app config', () => {
  for (const env of [
    { OWNER_ALLOWED_EMAILS: 'not-an-email', OWNER_ALLOWED_IPS: '203.0.113.7', OWNER_SESSION_SECRET: 's'.repeat(40) },
    { OWNER_ALLOWED_EMAILS: 'owner@example.com', OWNER_ALLOWED_IPS: '203.0.113.0/24', OWNER_SESSION_SECRET: 's'.repeat(40) },
    { OWNER_ALLOWED_EMAILS: 'owner@example.com', OWNER_ALLOWED_IPS: '203.0.113.7', OWNER_SESSION_SECRET: 'short' },
    { OWNER_ALLOWED_EMAILS: 'owner@example.com', OWNER_ALLOWED_IPS: '203.0.113.7,invalid', OWNER_SESSION_SECRET: 's'.repeat(40) }
  ]) {
    const config = loadConfig({ NODE_ENV: 'test', ...env });
    assert.equal(config.ownerConsole.enabled, false);
    assert.deepEqual(config.ownerConsole.emails, []);
    assert.deepEqual(config.ownerConsole.ips, []);
    assert.equal(config.ownerConsole.sessionSecret, '');
  }
});
