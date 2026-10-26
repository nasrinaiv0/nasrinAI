const MAX_RANGE_DAYS = 90;

function validWindow(value) {
  return ['7d', '30d', '90d'].includes(value) ? value : null;
}
function isoDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function finiteMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1e12 ? n : null;
}
function parseOpenAICosts(payload) {
  const buckets = Array.isArray(payload?.data) ? payload.data : [];
  let total = 0, seen = false;
  const rows = [];
  for (const bucket of buckets) {
    const results = Array.isArray(bucket?.results) ? bucket.results : [];
    for (const result of results) {
      const currency = typeof result?.amount?.currency === 'string' ? result.amount.currency.toLowerCase() : 'usd';
      if (currency !== 'usd') continue;
      const amount = finiteMoney(result?.amount?.value);
      if (amount === null) continue;
      total += amount; seen = true;
      rows.push({
        start_time: Number.isFinite(Number(bucket.start_time)) ? new Date(Number(bucket.start_time) * 1000).toISOString() : null,
        end_time: Number.isFinite(Number(bucket.end_time)) ? new Date(Number(bucket.end_time) * 1000).toISOString() : null,
        amount_usd: amount,
        line_item: typeof result.line_item === 'string' ? result.line_item.slice(0, 120) : null,
        project_id: typeof result.project_id === 'string' ? result.project_id.slice(0, 120) : null,
        currency
      });
    }
  }
  return { total_usd: seen ? Number(total.toFixed(8)) : null, rows: rows.slice(0, 1000), bucket_count: buckets.length };
}
function parseCloudflareBillableUsage(payload) {
  // Cloudflare's Billable Usage API is account-level and updates daily. Accept
  // only rows with an explicit numeric USD cost; never infer dollars from neurons.
  const rowsIn = Array.isArray(payload?.result) ? payload.result
    : Array.isArray(payload?.result?.data) ? payload.result.data
      : Array.isArray(payload?.data) ? payload.data : [];
  let total = 0, seen = false;
  const rows = [];
  for (const row of rowsIn) {
    if (!row || typeof row !== 'object') continue;
    const currency = String(row.Currency || row.currency || 'USD').toUpperCase();
    if (currency !== 'USD') continue;
    const raw = row.CostUSD ?? row.cost_usd ?? row.Cost ?? row.cost ?? row.TotalCost ?? row.total_cost;
    const amount = finiteMoney(raw);
    if (amount === null) continue;
    const service = row.ServiceName ?? row.service_name ?? row.ProductName ?? row.product_name ?? row.Service ?? row.service;
    const start = row.ChargePeriodStart ?? row.charge_period_start ?? row.start_time ?? row.from;
    const end = row.ChargePeriodEnd ?? row.charge_period_end ?? row.end_time ?? row.to;
    total += amount; seen = true;
    rows.push({
      start_time: isoDate(start),
      end_time: isoDate(end),
      amount_usd: amount,
      service: typeof service === 'string' ? service.slice(0, 120) : null,
      family: typeof (row.ServiceFamilyName ?? row.service_family_name) === 'string'
        ? String(row.ServiceFamilyName ?? row.service_family_name).slice(0, 120) : null
    });
  }
  return { total_usd: seen ? Number(total.toFixed(8)) : null, rows: rows.slice(0, 1000), row_count: rowsIn.length };
}

function parseAnthropicCosts(payload) {
  const buckets = Array.isArray(payload?.data) ? payload.data : [];
  let total = 0, seen = false;
  const rows = [];
  for (const bucket of buckets) {
    for (const result of (Array.isArray(bucket?.results) ? bucket.results : [])) {
      // Anthropic reports costs in cents as decimal strings (lowest unit).
      const cents = finiteMoney(result?.amount);
      if (cents === null) continue;
      const usd = cents / 100;
      total += usd; seen = true;
      rows.push({
        start_time: isoDate(bucket.starting_at || bucket.start_time),
        end_time: isoDate(bucket.ending_at || bucket.end_time),
        amount_usd: Number(usd.toFixed(8)),
        description: typeof result.description === 'string' ? result.description.slice(0, 160) : null,
        workspace_id: typeof result.workspace_id === 'string' ? result.workspace_id.slice(0, 120) : null
      });
    }
  }
  return { total_usd: seen ? Number(total.toFixed(8)) : null, rows: rows.slice(0, 1000), bucket_count: buckets.length };
}

/**
 * Read-only organization-level billing reconciliation. This is intentionally
 * separate from per-request usage and never allocates an aggregate bill to calls.
 */
export async function fetchDirectProviderBilling({
  openaiAdminKey = '',
  anthropicAdminKey = '',
  cloudflareBillingApiToken = '',
  cloudflareAccountId = '',
  window = '7d',
  now = Date.now,
  fetchImpl = fetch
} = {}) {
  const selectedWindow = validWindow(window);
  if (!selectedWindow) throw new TypeError('window must be 7d, 30d, or 90d');
  const days = Number(selectedWindow.slice(0, -1));
  if (days > MAX_RANGE_DAYS) throw new TypeError('billing window exceeds maximum');
  const end = now();
  const start = end - days * 86400000;
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();
  const results = {};
  const requests = [];
  if (String(openaiAdminKey).trim()) requests.push((async () => {
    try {
      const query = new URLSearchParams({
        start_time: String(Math.floor(start / 1000)),
        end_time: String(Math.floor(end / 1000)),
        bucket_width: '1d',
        limit: String(days)
      });
      const response = await fetchImpl('https://api.openai.com/v1/organization/costs?' + query, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + String(openaiAdminKey).trim(), Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        redirect: 'error'
      });
      if (!response.ok) throw new Error('provider_http_' + response.status);
      const parsed = parseOpenAICosts(await response.json());
      results.openai = { status: 'available', source: 'openai_organization_costs_api', ...parsed };
    } catch (error) {
      results.openai = { status: 'unavailable', source: 'openai_organization_costs_api', total_usd: null, rows: [], error_code: String(error?.message || '').match(/^provider_http_\d+$/)?.[0] || (error?.name === 'TimeoutError' ? 'provider_timeout' : 'provider_request_failed') };
    }
  })());
  if (String(anthropicAdminKey).trim()) requests.push((async () => {
    try {
      const rows = [];
      let page = '';
      let pages = 0;
      let bucketCount = 0;
      let totalUsd = 0;
      let sawCost = false;
      do {
        const query = new URLSearchParams({ starting_at: startIso, ending_at: endIso, 'group_by[]': 'description', bucket_width: '1d', limit: '31' });
        if (page) query.set('page', page);
        const response = await fetchImpl('https://api.anthropic.com/v1/organizations/cost_report?' + query, {
          method: 'GET',
          headers: { 'x-api-key': String(anthropicAdminKey).trim(), 'anthropic-version': '2023-06-01', Accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
          redirect: 'error'
        });
        if (!response.ok) throw new Error('provider_http_' + response.status);
        const payload = await response.json();
        const parsed = parseAnthropicCosts(payload);
        rows.push(...parsed.rows);
        if (parsed.total_usd !== null) { totalUsd += parsed.total_usd; sawCost = true; }
        bucketCount += parsed.bucket_count;
        page = payload?.has_more === true && typeof payload?.next_page === 'string' ? payload.next_page : '';
        pages++;
        if (payload?.has_more === true && !page) throw new Error('provider_pagination_invalid');
        if (pages >= 4 && page) throw new Error('provider_pagination_limit');
      } while (page);
      results.anthropic = { status: 'available', source: 'anthropic_organization_cost_report_api', total_usd: sawCost ? Number(totalUsd.toFixed(8)) : null, rows: rows.slice(0, 1000), bucket_count: bucketCount, pages_fetched: pages };
    } catch (error) {
      results.anthropic = { status: 'unavailable', source: 'anthropic_organization_cost_report_api', total_usd: null, rows: [], error_code: String(error?.message || '').match(/^provider_http_\d+$/)?.[0] || (error?.message === 'provider_pagination_limit' ? 'provider_pagination_limit' : error?.message === 'provider_pagination_invalid' ? 'provider_pagination_invalid' : error?.name === 'TimeoutError' ? 'provider_timeout' : 'provider_request_failed') };
    }
  })());
  if (String(cloudflareBillingApiToken).trim() && String(cloudflareAccountId).trim()) requests.push((async () => {
    try {
      const from = new Date(start).toISOString().slice(0, 10);
      const to = new Date(end).toISOString().slice(0, 10);
      const query = new URLSearchParams({ from, to });
      const response = await fetchImpl('https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(String(cloudflareAccountId).trim()) + '/billable-usage?' + query, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + String(cloudflareBillingApiToken).trim(), Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        redirect: 'error'
      });
      if (!response.ok) throw new Error('provider_http_' + response.status);
      const payload = await response.json();
      if (payload?.success === false) throw new Error('provider_response_invalid');
      const parsed = parseCloudflareBillableUsage(payload);
      if (!parsed.row_count && !Array.isArray(payload?.result)) throw new Error('provider_response_invalid');
      results.cloudflare = {
        status: parsed.total_usd === null ? 'unavailable' : 'available',
        source: 'cloudflare_billable_usage_api',
        total_usd: parsed.total_usd,
        rows: parsed.rows,
        row_count: parsed.row_count,
        data_freshness: 'daily'
      };
    } catch (error) {
      results.cloudflare = { status: 'unavailable', source: 'cloudflare_billable_usage_api', total_usd: null, rows: [], error_code: String(error?.message || '').match(/^provider_http_\d+$/)?.[0] || (error?.name === 'TimeoutError' ? 'provider_timeout' : 'provider_request_failed') };
    }
  })());
  await Promise.all(requests);
  for (const provider of ['openai', 'anthropic', 'cloudflare']) {
    if (!results[provider]) results[provider] = { status: 'not_configured', source: provider === 'openai' ? 'openai_organization_costs_api' : provider === 'anthropic' ? 'anthropic_organization_cost_report_api' : 'cloudflare_billable_usage_api', total_usd: null, rows: [] };
  }
  results.cerebras = { status: 'not_available', source: 'cerebras_billing_dashboard', total_usd: null, rows: [], note: 'Cerebras public account billing is not exposed through a verified organization billing API in this integration; use the provider dashboard for actual spend.' };
  return {
    generated_at: new Date(now()).toISOString(),
    window: selectedWindow,
    window_start: startIso,
    window_end: endIso,
    note: 'Organization-level billing totals; not attributed to individual requests. Do not add these totals to per-request costs.',
    providers: results
  };
}

export const providerBillingInternals = Object.freeze({ parseOpenAICosts, parseAnthropicCosts, parseCloudflareBillableUsage, validWindow });
