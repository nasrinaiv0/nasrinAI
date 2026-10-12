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
  assert.doesNotMatch(JSON.stringify(d.response), /SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(JSON.stringify(d.response), /missing:/);
});

test('startup diagnostics identify app initialization failures without exposing stack or exception', () => {
  const error = new TypeError('Cannot read private configuration');
  error.stack = 'secret stack details';
  const d = createStartupDiagnostic('buildApp', error, 'startup-test-2');
  assert.equal(d.stage, 'application');
  assert.equal(d.log.stage, 'buildApp');
  assert.equal(d.response.error.incident_id, 'startup-test-2');
  assert.doesNotMatch(JSON.stringify(d.response), /private configuration|secret stack details/);
});
