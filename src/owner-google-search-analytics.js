import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GA_URL = 'https://analyticsdata.googleapis.com/v1beta/properties/';
const SC_URL = 'https://searchconsole.googleapis.com/webmasters/v3/sites/';
const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly'
].join(' ');

function b64url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
    .toString('base64url');
}
function isoDate(date) {
  return date.toISOString().slice(0, 10);
}
function validDateWindow(value) {
  return ({ '7d': 7, '28d': 28, '90d': 90 })[value] || 28;
}
function parseCredentials(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (typeof value.client_email !== 'string' || !value.client_email.includes('@') ||
        typeof value.private_key !== 'string' || !value.private_key.includes('PRIVATE KEY')) return null;
    return value;
  } catch { return null; }
}

export function createGoogleSearchAnalytics({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => Date.now()
} = {}) {
  async function accessToken(credentials) {
    const issued = Math.floor(now() / 1000);
    const header = b64url({ alg: 'RS256', typ: 'JWT' });
    const claims = b64url({
      iss: credentials.client_email,
      scope: SCOPES,
      aud: TOKEN_URL,
      iat: issued,
      exp: issued + 300
    });
    const unsigned = header + '.' + claims;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const assertion = unsigned + '.' + signer.sign(credentials.private_key).toString('base64url');
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error'
    });
    if (!response.ok) throw new Error('google_token_unavailable');
    const payload = await response.json();
    if (typeof payload.access_token !== 'string' || !payload.access_token) throw new Error('google_token_unavailable');
    return payload.access_token;
  }

  async function googleJson(url, token, options = {}) {
    const response = await fetchImpl(url, {
      ...options,
      headers: { authorization: 'Bearer ' + token, accept: 'application/json', ...(options.headers || {}) },
      signal: AbortSignal.timeout(12000),
      redirect: 'error'
    });
    if (!response.ok) throw new Error('google_api_unavailable');
    return response.json();
  }

  async function getReport(windowName = '28d') {
    const propertyId = String(env.GOOGLE_ANALYTICS_PROPERTY_ID || '').trim();
    const siteUrl = String(env.GOOGLE_SEARCH_CONSOLE_SITE_URL || '').trim();
    const credentials = parseCredentials(env.GOOGLE_SEARCH_ANALYTICS_SERVICE_ACCOUNT_JSON);
    const configReady = Boolean(propertyId && /^\d{1,30}$/.test(propertyId) && siteUrl &&
      /^(https:\/\/|sc-domain:)[^\s]{1,250}$/.test(siteUrl) && credentials && typeof fetchImpl === 'function');
    const days = validDateWindow(windowName);
    const end = new Date(now());
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days + 1);
    const startDate = isoDate(start), endDate = isoDate(end);
    if (!configReady) {
      return {
        status: 'not_configured',
        generated_at: new Date(now()).toISOString(),
        window: days + 'd',
        date_range: { start: startDate, end: endDate },
        analytics: { status: 'unavailable', sessions: null, total_users: null, new_users: null, screen_page_views: null, engagement_rate: null, top_pages: [] },
        search_console: { status: 'unavailable', clicks: null, impressions: null, ctr: null, average_position: null, top_queries: [], top_pages: [] },
        setup: 'Configure GOOGLE_ANALYTICS_PROPERTY_ID, GOOGLE_SEARCH_CONSOLE_SITE_URL, and GOOGLE_SEARCH_ANALYTICS_SERVICE_ACCOUNT_JSON as server-only environment variables. Grant the service account Viewer access to the GA4 property and access to the verified Search Console property.'
      };
    }
    const token = await accessToken(credentials);
    const outcomes = await Promise.allSettled([
      googleJson(GA_URL + encodeURIComponent(propertyId) + ':runReport', token, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          metricAggregations: ['TOTAL'],
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' }, { name: 'screenPageViews' }, { name: 'engagementRate' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 10
        })
      }),
      googleJson(SC_URL + encodeURIComponent(siteUrl) + '/searchAnalytics/query', token, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startDate, endDate, dimensions: ['query'], rowLimit: 10,
          aggregationType: 'auto'
        })
      }),
      googleJson(SC_URL + encodeURIComponent(siteUrl) + '/searchAnalytics/query', token, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startDate, endDate, dimensions: ['page'], rowLimit: 10,
          aggregationType: 'auto'
        })
      })
    ]);
    const ga = outcomes[0].status === 'fulfilled' ? outcomes[0].value : null;
    const queries = outcomes[1].status === 'fulfilled' ? outcomes[1].value : null;
    const pages = outcomes[2].status === 'fulfilled' ? outcomes[2].value : null;
    const gaRows = Array.isArray(ga?.rows) ? ga.rows : [];
    const queryRows = Array.isArray(queries?.rows) ? queries.rows : [];
    const pageRows = Array.isArray(pages?.rows) ? pages.rows : [];
    const gaTotals = ga?.totals?.[0]?.metricValues || [];
    const num = (value) => value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    const metric = (row, index) => num(row?.metricValues?.[index]?.value);
    const searchTotals = (rows) => rows.reduce((acc, row) => ({
      clicks: acc.clicks + (num(row.clicks) || 0),
      impressions: acc.impressions + (num(row.impressions) || 0),
      weightedPosition: acc.weightedPosition + ((num(row.position) || 0) * (num(row.impressions) || 0))
    }), { clicks: 0, impressions: 0, weightedPosition: 0 });
    const totals = searchTotals(pageRows.length ? pageRows : queryRows);
    const searchAvailable = outcomes[1].status === 'fulfilled' || outcomes[2].status === 'fulfilled';
    return {
      status: ga || searchAvailable ? 'available' : 'unavailable',
      generated_at: new Date(now()).toISOString(),
      window: days + 'd',
      date_range: { start: startDate, end: endDate },
      analytics: {
        status: ga ? 'available' : 'unavailable',
        sessions: metric({ metricValues: gaTotals }, 0),
        total_users: metric({ metricValues: gaTotals }, 1),
        new_users: metric({ metricValues: gaTotals }, 2),
        screen_page_views: metric({ metricValues: gaTotals }, 3),
        engagement_rate: metric({ metricValues: gaTotals }, 4),
        top_pages: gaRows.map(row => ({
          page: String(row.dimensionValues?.[0]?.value || '').slice(0, 300),
          sessions: metric(row, 0),
          users: metric(row, 1),
          page_views: metric(row, 3)
        }))
      },
      search_console: {
        status: searchAvailable ? 'available' : 'unavailable',
        clicks: searchAvailable ? totals.clicks : null,
        impressions: searchAvailable ? totals.impressions : null,
        ctr: searchAvailable && totals.impressions > 0 ? totals.clicks / totals.impressions : searchAvailable ? 0 : null,
        average_position: searchAvailable && totals.impressions > 0 ? totals.weightedPosition / totals.impressions : null,
        top_queries: queryRows.map(row => ({ query: String(row.keys?.[0] || '').slice(0, 250), clicks: num(row.clicks), impressions: num(row.impressions), ctr: num(row.ctr), position: num(row.position) })),
        top_pages: pageRows.map(row => ({ page: String(row.keys?.[0] || '').slice(0, 500), clicks: num(row.clicks), impressions: num(row.impressions), ctr: num(row.ctr), position: num(row.position) }))
      }
    };
  }
  return { getReport };
}
