import test from 'node:test';
import assert from 'node:assert/strict';
import { createStartupDiagnostic } from '../src/startup-diagnostics.js';

test('startup diagnostics identify configuration failures without exposing them to clients', () => {
  const d = createStartupDiagnostic('loadConfig', new Error('missing: SUPABASE_SECRET_KEY'), 'startup-test-1');
  assert.equal(d.id, 'startup-test-1');
  assert.equal(d.stage, 'configuration');
  assert.equal(d.log.stage, 'loadConfig');
  assert.match(d.log.error.message, /SUPABASE_SECRET_KEY/);
  assert.equal(d.response.error.incident_id, 'startup-test-1');
  // Owner (2026-10-12): Vercel logs are unavailable during an outage, so the
  // reply names the setting at fault, but never the message text or a value.
  assert.equal(d.response.error.stage, 'configuration');
  assert.deepEqual(d.response.error.settings, ['SUPABASE_SECRET_KEY']);
  assert.doesNotMatch(JSON.stringify(d.response), /missing:/);
});

test('only setting names leave the server, never values or other text', () => {
  const cases = [
    ['CRON_SECRET is required in production for scheduled retention cleanup', ['CRON_SECRET']],
    ['set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY together', ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']],
    ['AI_PROVIDER=openai needs OPENAI_API_KEY', ['AI_PROVIDER', 'OPENAI_API_KEY']],
    ['ROUTING: smart or fixed', ['ROUTING']],
    ['GUEST_SESSION_SECRET: use at least 32 random characters sk-proj-' + 'abc123 sb_secret_xyz', ['GUEST_SESSION_SECRET']]
  ];
  for (const [message, names] of cases) {
    const d = createStartupDiagnostic('loadConfig', new Error(message), 'x');
    assert.deepEqual(d.response.error.settings, names, message);
    const body = JSON.stringify(d.response);
    assert.doesNotMatch(body, /sk-proj|sb_secret|random characters|required in production|together/);
  }
});

test('startup diagnostics identify app initialization failures without exposing stack or exception', () => {
  const error = new TypeError('Cannot read private configuration');
  error.stack = 'secret stack details';
  const d = createStartupDiagnostic('buildApp', error, 'startup-test-2');
  assert.equal(d.stage, 'application');
  assert.equal(d.log.stage, 'buildApp');
  assert.equal(d.response.error.incident_id, 'startup-test-2');
  assert.equal(d.response.error.stage, 'application');
  assert.equal(d.response.error.settings, undefined, 'application errors name no settings');
  assert.doesNotMatch(JSON.stringify(d.response), /private configuration|secret stack details/);
});
