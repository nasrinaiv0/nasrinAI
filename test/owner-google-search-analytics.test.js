import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleSearchAnalytics } from '../src/owner-google-search-analytics.js';

test('Google search analytics fails closed with an explicit setup state when credentials are absent', async () => {
  let networkCalls = 0;
  const service = createGoogleSearchAnalytics({
    env: {},
    now: () => Date.parse('2026-10-27T12:00:00.000Z'),
    fetchImpl: async () => { networkCalls++; throw new Error('must not call network without configuration'); }
  });
  const report = await service.getReport('28d');
  assert.equal(report.status, 'not_configured');
  assert.equal(report.window, '28d');
  assert.equal(report.date_range.end, '2026-10-26');
  assert.equal(report.analytics.sessions, null);
  assert.equal(report.search_console.clicks, null);
  assert.match(report.setup, /GOOGLE_ANALYTICS_PROPERTY_ID/);
  assert.equal(networkCalls, 0);
});

test('Google analytics date window is constrained to supported values', async () => {
  const service = createGoogleSearchAnalytics({
    env: {},
    now: () => Date.parse('2026-10-27T12:00:00.000Z')
  });
  assert.equal((await service.getReport('7d')).window, '7d');
  assert.equal((await service.getReport('90d')).window, '90d');
  assert.equal((await service.getReport('999d')).window, '28d');
});
