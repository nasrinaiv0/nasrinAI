import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDirectProviderBilling, providerBillingInternals } from '../src/ai/provider-cost-reconciliation.js';

test('OpenAI organization cost parser totals valid USD line items and ignores malformed amounts', () => {
  const result = providerBillingInternals.parseOpenAICosts({ data: [
    { start_time: 1792800000, end_time: 1792886400, results: [
      { amount: { value: 1.25, currency: 'usd' }, line_item: 'Text generation', project_id: 'proj_1' },
      { amount: { value: '0.75', currency: 'usd' }, line_item: 'Cached input' },
      { amount: { value: null, currency: 'usd' }, line_item: 'Missing amount' },
      { amount: { value: 9, currency: 'eur' }, line_item: 'Unexpected currency' },
      { amount: { value: -5, currency: 'usd' } }
    ] }
  ] });
  assert.equal(result.total_usd, 2);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].line_item, 'Text generation');
});

test('Anthropic cost parser converts provider-reported cents to USD', () => {
  const result = providerBillingInternals.parseAnthropicCosts({ data: [
    { starting_at: '2026-10-25T00:00:00Z', ending_at: '2026-10-26T00:00:00Z', results: [
      { amount: '125', description: 'Claude messages', workspace_id: 'workspace_1' },
      { amount: '50', description: 'Tool usage' }
    ] }
  ] });
  assert.equal(result.total_usd, 1.75);
  assert.equal(result.rows[0].amount_usd, 1.25);
});

test('direct provider billing is bounded, read-only, and reports unconfigured providers explicitly', async () => {
  const result = await fetchDirectProviderBilling({
    window: '7d',
    now: () => Date.parse('2026-10-26T00:00:00Z'),
    fetchImpl: async () => { throw new Error('must not fetch without keys'); }
  });
  assert.equal(result.window, '7d');
  assert.equal(result.providers.openai.status, 'not_configured');
  assert.equal(result.providers.anthropic.status, 'not_configured');
  assert.match(result.note, /not attributed to individual requests/i);
});

test('OpenAI and Anthropic billing calls use their respective admin endpoints and never expose credentials in output', async () => {
  const calls = [];
  const result = await fetchDirectProviderBilling({
    openaiAdminKey: 'openai-admin-secret-test',
    anthropicAdminKey: 'anthropic-admin-secret-test',
    window: '7d',
    now: () => Date.parse('2026-10-26T00:00:00Z'),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('api.openai.com')) return { ok: true, status: 200, json: async () => ({ data: [{ results: [{ amount: { value: 2, currency: 'usd' } }] }] }) };
      return { ok: true, status: 200, json: async () => ({ data: [{ results: [{ amount: '350', description: 'Claude messages' }] }] }) };
    }
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.some((call) => call.url.startsWith('https://api.openai.com/v1/organization/costs?')));
  assert.ok(calls.some((call) => call.url.startsWith('https://api.anthropic.com/v1/organizations/cost_report?')));
  assert.equal(result.providers.openai.total_usd, 2);
  assert.equal(result.providers.anthropic.total_usd, 3.5);
  assert.equal(JSON.stringify(result).includes('admin-secret-test'), false);
  assert.equal(calls.find((call) => call.url.includes('api.openai.com')).options.headers.Authorization, 'Bearer openai-admin-secret-test');
});

test('Anthropic billing follows bounded pagination for 90-day reports and sums complete page totals', async () => {
  const pages = [];
  const result = await fetchDirectProviderBilling({
    anthropicAdminKey: 'anthropic-admin-test-key',
    window: '90d',
    now: () => Date.parse('2026-10-26T00:00:00Z'),
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      pages.push(parsed.searchParams.get('page') || 'first');
      if (!parsed.searchParams.has('page')) return {
        ok: true, status: 200,
        json: async () => ({ data: [{ results: [{ amount: '100', description: 'first page' }] }], has_more: true, next_page: 'cursor-2' })
      };
      return {
        ok: true, status: 200,
        json: async () => ({ data: [{ results: [{ amount: '250', description: 'second page' }] }], has_more: false, next_page: null })
      };
    }
  });
  assert.deepEqual(pages, ['first', 'cursor-2']);
  assert.equal(result.providers.anthropic.total_usd, 3.5);
  assert.equal(result.providers.anthropic.pages_fetched, 2);
});

test('invalid billing windows are rejected before any network request', async () => {
  let called = false;
  await assert.rejects(() => fetchDirectProviderBilling({ window: '365d', fetchImpl: async () => { called = true; } }), /window must be/);
  assert.equal(called, false);
});
