import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { API_CSP, PAGE_CSP, sendJson } from './http/headers.js';
import { ownerCatalogStatus } from './ai/owner-model-catalog.js';

const SESSION_COOKIE = 'nasrin_owner';
const SESSION_SECONDS = 10 * 60;
const NOT_FOUND = 'Page not found.';

function sendNotFound(res, head = false) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie, Authorization');
  res.end(head ? undefined : NOT_FOUND);
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0 || part.slice(0, i).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ''; }
  }
  return '';
}

async function readOwnerJson(req, maxBytes = 8192) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error('body too large');
    chunks.push(buffer);
  }
  if (!size) throw new Error('body required');
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
  return value;
}

function bearer(req) {
  const match = /^Bearer ([A-Za-z0-9._~-]{20,4096})$/.exec(String(req.headers.authorization || ''));
  return match ? match[1] : '';
}

function trustedSameOrigin(req) {
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  const origin = String(req.headers.origin || '');
  const host = String(req.headers.host || '').split(',')[0].trim().toLowerCase();
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

// The signed-in main site bootstraps a host-only session cookie on the owner
// subdomain. Cross-origin bootstrap is limited to the two canonical site
// origins, the exact owner host, and same-site browser requests.
function trustedBootstrapOrigin(req, res, config) {
  const origin = String(req.headers.origin || '').trim();
  const host = String(req.headers.host || '').split(',')[0].trim().toLowerCase();
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();

  // Production bootstrap must terminate on the dedicated owner host. A same-origin
  // request to nasrinai.com must not mint a cookie for the main application host.
  if (!config?.isProduction) return trustedSameOrigin(req);
  if (host !== 'owner.nasrinai.com') return false;
  if (origin === 'https://owner.nasrinai.com' &&
      (!fetchSite || fetchSite === 'same-origin' || fetchSite === 'none')) return true;
  if (!['https://nasrinai.com', 'https://www.nasrinai.com'].includes(origin) ||
      (fetchSite && fetchSite !== 'same-site')) return false;

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin, Cookie, Authorization');
  return true;
}

function normalizeIp(value) {
  const ip = String(value || '').trim().replace(/^::ffff:/, '');
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) === 6) {
    try { return new URL('http://[' + ip + ']/').hostname.slice(1, -1).toLowerCase(); } catch { return null; }
  }
  return null;
}

function configuredAllowlist(config) {
  const source = config?.ownerConsole;
  if (!source || source.enabled !== true || typeof source.sessionSecret !== 'string' || source.sessionSecret.length < 32) return null;
  if (!Array.isArray(source.emails) || !source.emails.length || !Array.isArray(source.ips) || !source.ips.length) return null;
  if (source.emails.some((email) => !/^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,63}$/.test(email))) return null;
  const ips = source.ips.map(normalizeIp);
  if (ips.some((ip) => !ip)) return null;
  return { ...source, ips };
}

function allowedRequest(req, config, clientIp) {
  const allowlist = configuredAllowlist(config);
  if (!allowlist) return null;
  let ip = '';
  try { ip = normalizeIp(clientIp(req)); } catch { return null; }
  if (!ip || !allowlist.ips.includes(ip)) return null;
  return allowlist;
}

function sign(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return encoded + '.' + signature;
}

function verifySession(token, secret, now) {
  if (!token || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  let supplied;
  try { supplied = Buffer.from(parts[1], 'base64url'); } catch { return null; }
  // Buffer's base64url decoder accepts non-canonical final characters whose unused bits differ.
  // Require a canonical round-trip so signature mutations cannot decode to the same bytes.
  if (supplied.toString('base64url') !== parts[1]) return null;
  if (Buffer.from(parts[0], 'base64url').toString('base64url') !== parts[0]) return null;
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return null; }
  if (!payload || typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string') return null;
  if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.exp <= now || payload.iat > now + 30 || payload.exp - payload.iat > SESSION_SECONDS) return null;
  return payload;
}

function sessionCookie(value, maxAge, secure) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/owner; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<title>Owner Command Center · NasrinAI</title>
<link rel="stylesheet" href="/owner-console.css">
<script defer src="/owner-console.js"></script>
</head>
<body>
<div class="shell">
  <aside class="sidebar" aria-label="Owner navigation">
    <a class="brand" href="/owner" aria-label="NasrinAI Owner Command Center"><span class="brand-mark">N</span><span><strong>NasrinAI</strong><small>OWNER COMMAND CENTER</small></span></a>
    <div class="nav-label">WORKSPACE</div>
    <nav id="navigation">
      <button class="nav-item active" data-panel="overview"><span>◫</span>Overview</button>
      <button class="nav-item" data-panel="ai"><span>✳</span>AI Operations</button>
      <button class="nav-item" data-panel="logs"><span>≋</span>AI Logs</button>
      <button class="nav-item" data-panel="openrouter-unlisted"><span>⌕</span>Unlisted Models</button>
      <button class="nav-item" data-panel="other-unlisted"><span>◇</span>AI Models Activities</button>
      <button class="nav-item" data-panel="learning"><span>✓</span>Community Learning</button>
      <button class="nav-item" data-panel="users"><span>♙</span>Users &amp; Growth</button>
      <button class="nav-item" data-panel="regional"><span>◎</span>Regional Analytics</button>
      <button class="nav-item" data-panel="infra"><span>⌘</span>Infrastructure &amp; Releases</button>
      <button class="nav-item" data-panel="security"><span>◇</span>Security &amp; Audit</button>
      <button class="nav-item" data-panel="automation"><span>↗</span>Automation &amp; Jobs</button>
      <button class="nav-item" data-panel="finance"><span>▤</span>Finance &amp; Costs</button>
      <button class="nav-item" data-panel="incidents"><span>◎</span>Incidents &amp; Alerts</button>
      <button class="nav-item" data-panel="reports"><span>▥</span>Reports &amp; Exports</button>
      <button class="nav-item" data-panel="settings"><span>⚙</span>Settings</button>
    </nav>
    <div class="sidebar-bottom"><span class="status-dot"></span><span>Private owner workspace</span></div>
  </aside>
  <main class="main">
    <header class="topbar"><div class="crumb">NasrinAI <span>/</span> <b id="crumb">Overview</b></div><div class="top-actions"><span class="live"><i></i>Private session</span><button id="signout" class="quiet-button">Sign out</button></div></header>
    <section class="page-heading"><div><p class="eyebrow">OPERATIONS INTELLIGENCE</p><h1 id="page-title">Good to have you back.</h1><p id="page-description">A clear view of platform health, AI operations, and business signals.</p></div><div class="heading-meta"><span class="pill"><i></i>Read-only mode</span><span class="freshness" id="freshness">Checking data sources…</span></div></section>
    <section id="content" aria-live="polite"><div class="loading"><span class="spinner"></span>Loading secure workspace…</div></section>
    <footer><span>NASRINAI · OWNER CONSOLE</span><span>Least privilege by default <b>·</b> Sensitive actions disabled until reviewed</span></footer>
  </main>
</div>
</body>
</html>`;

const panels = {
  overview: { title: 'Good to have you back.', description: 'A clear view of platform health, AI operations, and business signals.' },
  ai: { title: 'AI Operations', description: 'Provider performance, routing, latency, and token usage — only from verified telemetry.' },
  logs: { title: 'AI Logs', description: 'Request-level provider telemetry, status, tokens, cost, latency, and response metadata.' },
  'openrouter-unlisted': { title: 'Unlisted Models', description: 'Logged models missing from NasrinAI’s configured catalog.' },
  'other-unlisted': { title: 'AI Models Activities', description: 'All logged models: listed and unlisted.' },
  learning: { title: 'Community Learning Review', description: 'Review eligible examples before they can help future NasrinAI responses.' },
  users: { title: 'Users & Growth', description: 'Adoption and account trends, with personal data minimized by default.' },
  regional: { title: 'Regional Analytics', description: 'Approximate country, region, and city trends for registered users and guests. No raw IPs, emails, or GPS coordinates.' },
  infra: { title: 'Infrastructure & Releases', description: 'Deployment and dependency status from explicitly connected sources.' },
  security: { title: 'Security & Audit', description: 'Authorization health, security events, and a traceable record of owner actions.' },
  automation: { title: 'Automation & Jobs', description: 'Workflow health, queue state, retries, and execution outcomes.' },
  finance: { title: 'Finance & Costs', description: 'Provider-reported costs, unknown-cost coverage, and verified provider billing.' },
  incidents: { title: 'Incidents & Alerts', description: 'Operational issues and alert delivery, with clear status and ownership.' },
  reports: { title: 'Reports & Exports', description: 'Date-scoped reports from verified data sources.' },
  settings: { title: 'Settings', description: 'Owner-console preferences and access status. Allowlist values stay in Vercel.' }
};

function jsonError(res, head = false) { sendNotFound(res, head); }

export function createOwnerConsole({ config, verifyUser, store = null, limiter = null, clientIp = () => '', now = () => Date.now(), logger = null, fetchImpl = globalThis.fetch, openrouterManagementKey = '', openrouterApiKey = '' }) {
  async function usageSince(since) {
    if (typeof store?.request !== 'function') return null;
    try {
      const value = await store.request('POST', 'rpc/owner_console_usage_summary', {
        body: { p_since: new Date(since).toISOString() }
      });
      const summary = Array.isArray(value) ? value[0] : value;
      return summary && typeof summary === 'object' && Number.isFinite(Number(summary.request_count)) ? summary : null;
    } catch {
      logger?.warn?.('owner metrics source unavailable', { source: 'usage_events' });
      return null;
    }
  }

  async function rateAllowed(req) {
    if (!limiter || typeof limiter.signIn !== 'function') return true;
    let ip = '';
    try { ip = normalizeIp(clientIp(req)); } catch { return false; }
    if (!ip) return false;
    const limit = Math.min(Number(config?.limits?.signInRefreshIpHour) || 120, 300);
    try { await limiter.signIn('owner-console:' + ip, limit); return true; } catch { return false; }
  }

  async function automationSince(since) {
    if (store?.kind !== 'supabase' || typeof store.request !== 'function') return null;
    try {
      const value = await store.request('POST', 'rpc/owner_console_automation_summary', {
        body: { p_since: new Date(since).toISOString() }
      });
      const summary = Array.isArray(value) ? value[0] : value;
      return summary && typeof summary === 'object' && Number.isFinite(Number(summary.run_count)) ? summary : null;
    } catch {
      logger?.warn?.('owner automation source unavailable', { source: 'automation_runs' });
      return null;
    }
  }

  async function vercelDeploymentSummary() {
    const source = config?.ownerConsole?.vercel;
    if (!source?.enabled || typeof fetchImpl !== 'function') return null;
    try {
      const query = new URLSearchParams({ projectId: source.projectId, limit: '10', target: 'production', teamId: source.teamId });
      const response = await fetchImpl('https://api.vercel.com/v6/deployments?' + query.toString(), {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + source.token, Accept: 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
      if (!response?.ok) throw new Error('deployment source unavailable');
      const payload = await response.json();
      if (!Array.isArray(payload?.deployments)) throw new Error('invalid deployment response');
      const deployments = payload.deployments.slice(0, 10).map((item) => ({
        state: typeof item?.state === 'string' ? item.state.toLowerCase() : 'unknown',
        url: typeof item?.url === 'string' ? item.url.slice(0, 240) : null,
        target: typeof item?.target === 'string' ? item.target : null,
        created_at: Number.isFinite(Number(item?.created)) ? new Date(Number(item.created)).toISOString() : null,
        branch: typeof item?.meta?.githubCommitRef === 'string' ? item.meta.githubCommitRef.slice(0, 120) : null,
        commit: typeof item?.meta?.githubCommitSha === 'string' && /^[a-f0-9]{7,40}$/i.test(item.meta.githubCommitSha) ? item.meta.githubCommitSha : null
      }));
      return { deployment_count: deployments.length, ready_count: deployments.filter((item) => item.state === 'ready').length, failed_count: deployments.filter((item) => ['error','canceled','cancelled'].includes(item.state)).length, latest: deployments[0] || null, deployments };
    } catch {
      logger?.warn?.('owner Vercel deployment telemetry unavailable', { source: 'vercel_api' });
      return null;
    }
  }

  async function incidentSince(since) {
    if (store?.kind !== 'supabase' || typeof store.request !== 'function') return null;
    try {
      const value = await store.request('POST', 'rpc/owner_console_incident_summary', {
        body: { p_since: new Date(since).toISOString() }
      });
      const summary = Array.isArray(value) ? value[0] : value;
      return summary && typeof summary === 'object' && Number.isFinite(Number(summary.ai_failed_requests)) ? summary : null;
    } catch {
      logger?.warn?.('owner operational signals unavailable', { source: 'usage_events,automation_runs' });
      return null;
    }
  }

  async function plansSince(since) {
    if (typeof store?.request !== 'function') return null;
    try {
      const value = await store.request('POST', 'rpc/owner_console_plan_summary', {
        body: { p_since: new Date(since).toISOString() }
      });
      const summary = Array.isArray(value) ? value[0] : value;
      return summary && typeof summary === 'object' && Number.isFinite(Number(summary.active_paid_periods)) ? summary : null;
    } catch {
      logger?.warn?.('owner plan entitlement source unavailable', { source: 'plan_periods' });
      return null;
    }
  }

  async function growthSummary() {
    if (typeof store?.request !== 'function') return null;
    try {
      const value = await store.request('POST', 'rpc/owner_console_growth_summary', { body: {} });
      const summary = Array.isArray(value) ? value[0] : value;
      return summary && typeof summary === 'object' && Number.isFinite(Number(summary.active_user_ids_24h)) ? summary : null;
    } catch {
      logger?.warn?.('owner growth summary unavailable', { source: 'usage_events' });
      return null;
    }
  }

  async function retentionSummary() {
    if (typeof store?.request !== 'function') return null;
    try {
      const value = await store.request('POST', 'rpc/owner_console_retention_summary', { body: {} });
      const summary = Array.isArray(value) ? value[0] : value;
      return summary && typeof summary === 'object' && Array.isArray(summary.cohorts) ? summary : null;
    } catch {
      logger?.warn?.('owner retention cohort source unavailable', { source: 'usage_events' });
      return null;
    }
  }

  async function userSummary() {
    if (typeof store?.request !== 'function') return null;
    try {
      const value = await store.request('POST', 'rpc/owner_console_user_summary', { body: {} });
      const summary = Array.isArray(value) ? value[0] : value;
      return summary && typeof summary === 'object' && Number.isFinite(Number(summary.auth_user_records)) ? summary : null;
    } catch {
      logger?.warn?.('owner account summary unavailable', { source: 'auth.users' });
      return null;
    }
  }

  async function auditSince(since) {
    if (store?.kind !== 'supabase' || typeof store.request !== 'function') return null;
    try {
      const value = await store.request('POST', 'rpc/owner_console_audit_summary', {
        body: { p_since: new Date(since).toISOString() }
      });
      const summary = Array.isArray(value) ? value[0] : value;
      return summary && typeof summary === 'object' && Number.isFinite(Number(summary.event_count)) ? summary : null;
    } catch {
      logger?.warn?.('owner audit summary unavailable', { source: 'owner_audit_events' });
      return null;
    }
  }

  async function authAuditSince(since) {
    if (store?.kind !== 'supabase' || typeof store.request !== 'function') return null;
    try {
      const value = await store.request('POST', 'rpc/owner_console_auth_audit_summary', {
        body: { p_since: new Date(since).toISOString() }
      });
      const summary = Array.isArray(value) ? value[0] : value;
      return summary && typeof summary === 'object' &&
        typeof summary.available === 'boolean' &&
        Number.isFinite(Number(summary.event_count)) &&
        Array.isArray(summary.by_category) ? summary : null;
    } catch {
      logger?.warn?.('owner platform auth audit source unavailable', { source: 'auth.audit_log_entries' });
      return null;
    }
  }

  async function recordAudit(eventType, actorId, req) {
    if (typeof store?.request !== 'function') return false;
    let ip = '';
    try { ip = normalizeIp(clientIp(req)); } catch { return false; }
    if (!ip || typeof actorId !== 'string' || !actorId) return false;
    const ipHash = createHash('sha256').update(ip).digest('hex');
    try {
      await store.request('POST', 'rpc/owner_console_record_audit', {
        body: { p_event_type: eventType, p_actor_id: actorId, p_ip_hash: ipHash, p_outcome: 'success' }
      });
      return true;
    } catch {
      logger?.warn?.('owner audit write unavailable', { source: 'owner_audit_events', event_type: eventType });
      return false;
    }
  }

  async function handle(req, res, pathname) {
    const ownerPath = pathname === '/owner' || pathname.startsWith('/owner/');
    const bootstrapPath = pathname === '/v1/owner/session';
    const reservedOwnerApi = pathname === '/v1/owner' || pathname.startsWith('/v1/owner/');
    const incidentCollectionPath = pathname === '/owner/api/incidents';
    const communityCollectionPath = pathname === '/owner/api/community-learning';
    const communityAction = /^\/owner\/api\/community-learning\/([0-9a-f-]{36})\/(approve|reject)$/.exec(pathname);
    const communityWrite = req.method === 'POST' && Boolean(communityAction);
    const workflowDispatchPath = pathname === '/owner/api/verify-openrouter-models';
    const workflowWrite = req.method === 'POST' && workflowDispatchPath;
    const incidentAction = /^\/owner\/api\/incidents\/([0-9a-f-]{36})\/(acknowledge|resolve)$/.exec(pathname);
    const incidentWrite = req.method === 'POST' && (incidentCollectionPath || Boolean(incidentAction));
    const reconciliationWrite = req.method === 'POST' && pathname === '/owner/api/openrouter-billing/reconcile';
    if (!ownerPath && !bootstrapPath && !reservedOwnerApi) return false;

    // In production the console UI/API exists only on the dedicated subdomain.
    // Keep the bootstrap endpoint separate because it is called cross-origin by the main site.
    const requestHost = String(req.headers.host || '').split(',')[0].trim().toLowerCase();
    if (ownerPath && config?.isProduction && requestHost !== 'owner.nasrinai.com') {
      sendNotFound(res, req.method === 'HEAD');
      return true;
    }

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Content-Security-Policy', pathname === '/owner' || pathname === '/owner/' ? PAGE_CSP : API_CSP);
    res.setHeader('Vary', 'Cookie, Authorization');

    if (reservedOwnerApi && !bootstrapPath) { sendNotFound(res, req.method === 'HEAD'); return true; }

    if (bootstrapPath) {
      const trustedOrigin = trustedBootstrapOrigin(req, res, config);
      const bootstrapReject = (reason) => {
        // Never log access tokens, email addresses, cookies, or raw client IPs.
        logger?.warn?.('owner session bootstrap rejected', { reason, method: req.method, host: String(req.headers.host || '').split(',')[0].trim().toLowerCase() });
        jsonError(res, req.method === 'HEAD');
      };
      if (req.method === 'OPTIONS') {
        if (!trustedOrigin) { bootstrapReject('origin_or_host'); return true; }
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
        res.statusCode = 204;
        res.end();
        return true;
      }
      if (req.method !== 'POST' || !trustedOrigin) { bootstrapReject('origin_or_method'); return true; }
      const allowlist = allowedRequest(req, config, clientIp);
      if (!allowlist) { bootstrapReject('allowlist_or_client_ip'); return true; }
      if (!(await rateAllowed(req))) { bootstrapReject('rate_limit'); return true; }
      const token = bearer(req);
      if (!token || typeof verifyUser !== 'function') { bootstrapReject('missing_token_or_verifier'); return true; }
      let user;
      try { user = await verifyUser(token); } catch { bootstrapReject('token_verification'); return true; }
      if (!user?.id || !user?.email || !allowlist.emails.includes(String(user.email).trim().toLowerCase())) { bootstrapReject('email_allowlist'); return true; }
      if (!(await recordAudit('session_issued', user.id, req))) { bootstrapReject('audit_write'); return true; }
      const issued = Math.floor(now() / 1000);
      const value = sign({ sub: user.id, email: String(user.email).trim().toLowerCase(), iat: issued, exp: issued + SESSION_SECONDS, jti: randomUUID() }, allowlist.sessionSecret);
      const secure = config?.isProduction === true || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
      res.setHeader('Set-Cookie', sessionCookie(value, SESSION_SECONDS, secure));
      res.statusCode = 204;
      res.end();
      return true;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD' && !(pathname === '/owner/api/session' && req.method === 'DELETE') && !incidentWrite && !communityWrite && !workflowWrite && !reconciliationWrite) {
      sendNotFound(res, req.method === 'HEAD'); return true;
    }
    const allowlist = allowedRequest(req, config, clientIp);
    const session = allowlist && verifySession(readCookie(req, SESSION_COOKIE), allowlist.sessionSecret, Math.floor(now() / 1000));
    if (!allowlist || !session || !allowlist.emails.includes(session.email)) {
      sendNotFound(res, req.method === 'HEAD'); return true;
    }
    if (!(await rateAllowed(req))) { sendNotFound(res, req.method === 'HEAD'); return true; }

    if (pathname === '/owner/api/session' && req.method === 'DELETE') {
      if (!trustedSameOrigin(req)) { sendNotFound(res); return true; }
      const secure = config?.isProduction === true || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
      await recordAudit('session_revoked', session.sub, req);
      res.setHeader('Set-Cookie', sessionCookie('', 0, secure));
      res.statusCode = 204;
      res.end();
      return true;
    }
    if (incidentCollectionPath && (req.method === 'GET' || req.method === 'HEAD')) {
      try {
        const value = await store.request('POST', 'rpc/owner_console_incidents_list', { body: { p_limit: 50 } });
        const result = Array.isArray(value) ? value[0] : value;
        if (!result || typeof result !== 'object') throw new Error('invalid incident response');
        sendJson(res, 200, result);
      } catch {
        logger?.warn?.('owner incident list unavailable', { source: 'owner_console_incidents' });
        sendJson(res, 503, { error: { code: 'incident_source_unavailable', message: 'Incident storage is unavailable.' } });
      }
      return true;
    }
    if (incidentWrite) {
      if (!trustedSameOrigin(req) || String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') { sendNotFound(res); return true; }
      if (!store || typeof store.request !== 'function') { sendJson(res, 503, { error: { code: 'incident_source_unavailable', message: 'Incident storage is unavailable.' } }); return true; }
      let body;
      try { body = await readOwnerJson(req); } catch { sendJson(res, 400, { error: { code: 'invalid_request', message: 'A valid JSON request is required.' } }); return true; }
      let ip = '';
      try { ip = normalizeIp(clientIp(req)); } catch {}
      if (!ip) { sendNotFound(res); return true; }
      const ipHash = createHash('sha256').update(ip).digest('hex');
      if (incidentCollectionPath) {
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const description = typeof body.description === 'string' ? body.description.trim() : '';
        const severity = typeof body.severity === 'string' ? body.severity : '';
        const source = typeof body.source === 'string' ? body.source : 'manual';
        if (body.confirm !== 'CREATE INCIDENT' || !title || title.length > 160 || description.length > 1200 || !['low','medium','high','critical'].includes(severity) || !['manual','ai_usage','automation','infrastructure','security'].includes(source)) {
          sendJson(res, 400, { error: { code: 'invalid_incident', message: 'Confirm the action and provide a valid title, severity, source, and description.' } }); return true;
        }
        try {
          const value = await store.request('POST', 'rpc/owner_console_incident_create', { body: { p_title: title, p_description: description, p_severity: severity, p_source: source, p_actor_id: session.sub, p_ip_hash: ipHash } });
          const id = Array.isArray(value) ? value[0] : value;
          if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('invalid incident id');
          sendJson(res, 201, { id, status: 'open' });
        } catch {
          logger?.warn?.('owner incident create failed', { source: 'owner_console_incidents' });
          sendJson(res, 503, { error: { code: 'incident_write_unavailable', message: 'The incident could not be recorded. Please try again later.' } });
        }
        return true;
      }
      if (body.confirm !== (incidentAction[2] === 'acknowledge' ? 'ACKNOWLEDGE' : 'RESOLVE')) { sendJson(res, 400, { error: { code: 'confirmation_required', message: 'Explicit confirmation is required.' } }); return true; }
      const note = typeof body.resolution_note === 'string' ? body.resolution_note.trim() : '';
      if (incidentAction[2] === 'resolve' && (note.length < 3 || note.length > 1200)) { sendJson(res, 400, { error: { code: 'resolution_note_required', message: 'Add a resolution note between 3 and 1200 characters.' } }); return true; }
      try {
        const value = await store.request('POST', 'rpc/owner_console_incident_update', { body: { p_incident_id: incidentAction[1], p_action: incidentAction[2], p_actor_id: session.sub, p_ip_hash: ipHash, p_resolution_note: note } });
        const result = Array.isArray(value) ? value[0] : value;
        sendJson(res, 200, result && typeof result === 'object' ? result : { id: incidentAction[1], status: incidentAction[2] === 'resolve' ? 'resolved' : 'acknowledged' });
      } catch {
        logger?.warn?.('owner incident update failed', { source: 'owner_console_incidents', action: incidentAction[2] });
        sendJson(res, 409, { error: { code: 'incident_transition_failed', message: 'The incident status could not be changed. Refresh and try again.' } });
      }
      return true;
    }

    if (communityCollectionPath && (req.method === 'GET' || req.method === 'HEAD')) {
      const url = new URL(req.url, 'http://local');
      const status = url.searchParams.get('status') || 'pending_review';
      if (!['pending_review', 'approved', 'rejected'].includes(status)) {
        sendJson(res, 400, { error: { code: 'invalid_status', message: 'Choose pending_review, approved, or rejected.' } });
        return true;
      }
      try {
        const tenantId = '00000000-0000-0000-0000-000000000001';
        const rows = await store.request('GET', 'improvement_examples?select=id,subject_type,example_text,status,created_at,expires_at,reviewed_at,reviewer_id&tenant_id=eq.' + tenantId +
          '&status=eq.' + status + '&expires_at=gt.' + encodeURIComponent(new Date(now()).toISOString()) +
          '&order=created_at.desc&limit=50');
        sendJson(res, 200, { status, examples: Array.isArray(rows) ? rows : [] });
      } catch {
        logger?.warn?.('owner community learning list unavailable', { source: 'improvement_examples' });
        sendJson(res, 503, { error: { code: 'learning_source_unavailable', message: 'Community learning review storage is unavailable.' } });
      }
      return true;
    }
    if (communityWrite) {
      if (!trustedSameOrigin(req) || String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') { sendNotFound(res); return true; }
      if (typeof store?.request !== 'function') { sendJson(res, 503, { error: { code: 'learning_source_unavailable', message: 'Community learning review storage is unavailable.' } }); return true; }
      let body;
      try { body = await readOwnerJson(req, 4096); } catch { sendJson(res, 400, { error: { code: 'invalid_request', message: 'A valid JSON request is required.' } }); return true; }
      const decision = communityAction[2] === 'approve' ? 'approved' : 'rejected';
      const reason = typeof body.reason_code === 'string' ? body.reason_code : (decision === 'approved' ? 'meets_quality_bar' : 'other');
      const validReasons = ['meets_quality_bar', 'unclear', 'sensitive_content', 'possible_identifier', 'duplicate', 'out_of_scope', 'other'];
      if (!validReasons.includes(reason)) { sendJson(res, 400, { error: { code: 'invalid_reason', message: 'Choose a valid review reason.' } }); return true; }
      if (body.confirm !== (decision === 'approved' ? 'APPROVE' : 'REJECT')) { sendJson(res, 400, { error: { code: 'confirmation_required', message: 'Explicit confirmation is required.' } }); return true; }
      let ip = '';
      try { ip = normalizeIp(clientIp(req)); } catch {}
      if (!ip) { sendNotFound(res); return true; }
      const ipHash = createHash('sha256').update(ip).digest('hex');
      try {
        await store.request('POST', 'rpc/review_improvement_example', { body: {
          p_tenant_id: '00000000-0000-0000-0000-000000000001',
          p_example_id: communityAction[1], p_reviewer_id: session.sub,
          p_decision: decision, p_reason_code: reason
        } });
        if (!(await recordAudit('community_learning_' + decision, session.sub, req))) {
          logger?.warn?.('community learning review audit unavailable after decision', { decision });
        }
        sendJson(res, 200, { id: communityAction[1], status: decision });
      } catch {
        logger?.warn?.('owner community learning decision failed', { decision });
        sendJson(res, 409, { error: { code: 'review_transition_failed', message: 'The example may be expired, already reviewed, or no longer eligible. Refresh the queue and try again.' } });
      }
      return true;
    }
    if (pathname === '/owner/api/community-learning/history' && (req.method === 'GET' || req.method === 'HEAD')) {
      try {
        const rows = await store.request('GET', 'improvement_example_review_events?select=id,example_id,reviewer_id,decision,reason_code,created_at&tenant_id=eq.00000000-0000-0000-0000-000000000001&order=created_at.desc&limit=50');
        sendJson(res, 200, { events: Array.isArray(rows) ? rows : [] });
      } catch {
        logger?.warn?.('owner community learning history unavailable', { source: 'improvement_example_review_events' });
        sendJson(res, 503, { error: { code: 'learning_history_unavailable', message: 'Review history is unavailable.' } });
      }
      return true;
    }
    if (pathname === '/owner' || pathname === '/owner/') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(dashboardHtml));
      res.end(req.method === 'HEAD' ? undefined : dashboardHtml);
      return true;
    }
    if (workflowDispatchPath) {
      if (!trustedSameOrigin(req) || String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
        sendNotFound(res); return true;
      }
      const integration = config?.ownerConsole?.githubActions;
      if (!integration?.enabled || typeof integration.token !== 'string' || integration.token.length < 20 || typeof fetchImpl !== 'function') {
        sendJson(res, 503, { error: { code: 'workflow_dispatch_unavailable', message: 'GitHub Actions integration is not configured.' } });
        return true;
      }
      let body;
      try { body = await readOwnerJson(req, 2048); } catch {
        sendJson(res, 400, { error: { code: 'invalid_request', message: 'A valid JSON request is required.' } }); return true;
      }
      const model = typeof body.model === 'string' ? body.model.trim() : '';
      if (body.confirm_provider_costs !== true || model.length > 200 || (model && !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model))) {
        sendJson(res, 400, { error: { code: 'confirmation_required', message: 'Confirm provider costs and provide a valid optional model ID.' } });
        return true;
      }
      try {
        const response = await fetchImpl('https://api.github.com/repos/primusco20/nasrinAI/actions/workflows/verify-openrouter-models.yml/dispatches', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + integration.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
          body: JSON.stringify({ ref: 'main', inputs: { model, confirm_provider_costs: 'true' } }),
          signal: AbortSignal.timeout(8000)
        });
        if (!response?.ok) {
          logger?.warn?.('owner OpenRouter verification dispatch failed', { http_status: Number(response?.status) || 0 });
          sendJson(res, 503, { error: { code: 'workflow_dispatch_failed', message: 'GitHub could not start the verification workflow. Check the integration token and repository Actions permissions.' } });
          return true;
        }
        if (!(await recordAudit('openrouter_model_verification_dispatched', session.sub, req))) logger?.warn?.('owner verification dispatch audit unavailable', { source: 'owner_audit_events' });
        sendJson(res, 202, { status: 'queued', workflow: 'verify-openrouter-models.yml', model: model || null });
      } catch {
        logger?.warn?.('owner OpenRouter verification dispatch unavailable', { source: 'github_actions' });
        sendJson(res, 503, { error: { code: 'workflow_dispatch_unavailable', message: 'GitHub Actions could not be reached. Check workflow runs before retrying.' } });
      }
      return true;
    }
    if (pathname === '/owner/api/overview') {
      const at = now();
      let databaseHealth = 'unavailable';
      if (typeof store?.request === 'function') {
        try {
          const rows = await store.request('GET', 'tenants?select=id&limit=1');
          if (Array.isArray(rows)) databaseHealth = 'available';
        } catch {
          logger?.warn?.('owner database health check unavailable', { source: 'database' });
        }
      }
      const [usage24h, usage7d, automation24h, automation7d, audit24h, authAudit24h, plans24h, users, incidents24h, growth, retention, deployments] = await Promise.all([
        usageSince(at - 24 * 60 * 60 * 1000),
        usageSince(at - 7 * 24 * 60 * 60 * 1000),
        automationSince(at - 24 * 60 * 60 * 1000),
        automationSince(at - 7 * 24 * 60 * 60 * 1000),
        auditSince(at - 24 * 60 * 60 * 1000),
        authAuditSince(at - 24 * 60 * 60 * 1000),
        plansSince(at - 24 * 60 * 60 * 1000),
        userSummary(),
        incidentSince(at - 24 * 60 * 60 * 1000),
        growthSummary(),
        retentionSummary(),
        vercelDeploymentSummary()
      ]);
      sendJson(res, 200, {
        generated_at: new Date(at).toISOString(),
        mode: 'read_only',
        data_sources: {
          ai_usage: usage24h || usage7d ? ((Number(usage24h?.request_count || 0) + Number(usage7d?.request_count || 0)) > 0 ? 'available' : 'no_data') : 'unavailable',
          users: users || growth ? ((Number(users?.auth_user_records || 0) + Number(growth?.active_user_ids_24h || 0) + Number(growth?.active_guest_ids_24h || 0)) > 0 ? 'available' : 'no_data') : 'unavailable',
          retention: retention ? (retention.cohorts.length > 0 ? 'available' : 'no_data') : 'unavailable',
          infrastructure: deployments ? (deployments.deployment_count > 0 ? 'available' : 'no_data') : 'unavailable',
          database: databaseHealth,
          security_audit: audit24h ? (Number(audit24h.event_count || 0) > 0 ? 'available' : 'no_data') : 'unavailable',
          platform_security: authAudit24h?.available === true ? (Number(authAudit24h.event_count || 0) > 0 ? 'available' : 'no_data') : 'unavailable',
          automation: automation24h || automation7d ? ((Number(automation24h?.run_count || 0) + Number(automation7d?.run_count || 0)) > 0 ? 'available' : 'no_data') : 'unavailable',
          finance: plans24h && Number.isFinite(Number(plans24h.paid_payment_count))
            ? (Number(plans24h.paid_payment_count) > 0 ? 'available' : 'no_data') : 'unavailable',
          plan_entitlements: plans24h ? ((Number(plans24h.active_paid_periods || 0) + Number(plans24h.new_periods || 0)) > 0 ? 'available' : 'no_data') : 'unavailable',
          incidents: incidents24h ? ((Number(incidents24h.ai_failed_requests || 0) + Number(incidents24h.automation_failed_runs || 0) + Number(incidents24h.stale_running_runs || 0)) > 0 ? 'available' : 'no_data') : 'unavailable'
        },
        database_health: { status: databaseHealth, checked_at: new Date(at).toISOString() },
        usage_24h: usage24h,
        usage_7d: usage7d,
        automation_24h: automation24h,
        automation_7d: automation7d,
        audit_24h: audit24h,
        platform_auth_audit_24h: authAudit24h,
        plans_24h: plans24h,
        user_summary: users,
        growth_summary: growth,
        retention_summary: retention,
        deployment_summary: deployments,
        incidents_24h: incidents24h,
        panels
      });
      return true;
    }
    if (pathname === '/owner/api/regional-analytics' && (req.method === 'GET' || req.method === 'HEAD')) {
      if (typeof store?.request !== 'function') {
        sendJson(res, 503, { error: { code: 'regional_analytics_unavailable', message: 'Regional analytics storage is not connected.' } });
        return true;
      }
      const url = new URL(req.url, 'http://local');
      const windowName = url.searchParams.get('window') || '7d';
      const daysByWindow = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
      if (!Object.hasOwn(daysByWindow, windowName)) {
        sendJson(res, 400, { error: { code: 'invalid_window', message: 'Choose 24h, 7d, 30d, or 90d.' } });
        return true;
      }
      try {
        const value = await store.request('POST', 'rpc/owner_console_regional_summary', {
          body: { p_since: new Date(now() - daysByWindow[windowName] * 86400000).toISOString() }
        });
        const summary = Array.isArray(value) ? value[0] : value;
        if (!summary || typeof summary !== 'object' || !Array.isArray(summary.rows)) throw new Error('invalid regional summary');
        sendJson(res, 200, {
          source: 'private.regional_analytics_events',
          generated_at: new Date(now()).toISOString(),
          window: windowName,
          summary: {
            event_count: Number(summary.event_count) || 0,
            unique_actors: Number(summary.unique_actors) || 0,
            countries_seen: Number(summary.countries_seen) || 0,
            user_events: Number(summary.user_events) || 0,
            guest_events: Number(summary.guest_events) || 0,
            latest_event_at: summary.latest_event_at || null
          },
          rows: summary.rows.filter((row) => row && typeof row === 'object').slice(0, 500).map((row) => ({
            country_code: typeof row.country_code === 'string' ? row.country_code.slice(0, 2) : null,
            region: typeof row.region === 'string' ? row.region.slice(0, 100) : null,
            city: typeof row.city === 'string' ? row.city.slice(0, 100) : null,
            actor_type: ['user', 'guest'].includes(row.actor_type) ? row.actor_type : 'unknown',
            events: Math.max(0, Number(row.events) || 0),
            unique_actors: Math.max(0, Number(row.unique_actors) || 0),
            latest_activity: row.latest_activity || null
          }))
        });
      } catch {
        logger?.warn?.('owner regional analytics unavailable', { source: 'regional_analytics_events' });
        sendJson(res, 503, { error: { code: 'regional_analytics_unavailable', message: 'Regional analytics could not be loaded. Confirm migration 071 is applied and regional events are being recorded.' } });
      }
      return true;
    }
    if (pathname === '/owner/api/openrouter-logs' && (req.method === 'GET' || req.method === 'HEAD')) {
      if (typeof store?.request !== 'function') {
        sendJson(res, 503, { error: { code: 'openrouter_logs_unavailable', message: 'OpenRouter request logs are not connected to the owner data store.' } });
        return true;
      }
      const url = new URL(req.url, 'http://local');
      const windowName = url.searchParams.get('window') || '24h';
      const windows = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
      if (!Object.hasOwn(windows, windowName)) {
        sendJson(res, 400, { error: { code: 'invalid_window', message: 'Choose 24h, 7d, 30d, or 90d.' } });
        return true;
      }
      const cutoff = new Date(now() - windows[windowName] * 86400000).toISOString();
      const status = url.searchParams.get('status') || '';
      if (status && !['success', 'error'].includes(status)) {
        sendJson(res, 400, { error: { code: 'invalid_status', message: 'Choose success or error.' } });
        return true;
      }
      const model = String(url.searchParams.get('model') || '').trim().slice(0, 120);
      if (model && !/^[a-zA-Z0-9:._/@ -]+$/.test(model)) {
        sendJson(res, 400, { error: { code: 'invalid_model_filter', message: 'The model filter contains unsupported characters.' } });
        return true;
      }
      const endpoint = String(url.searchParams.get('endpoint') || '').trim().slice(0, 120);
      if (endpoint && !/^\/[a-zA-Z0-9/_-]+$/.test(endpoint)) {
        sendJson(res, 400, { error: { code: 'invalid_endpoint_filter', message: 'The endpoint filter is invalid.' } });
        return true;
      }
      const requestedLimit = Number(url.searchParams.get('limit') || 100);
      const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 100;
      const requestedOffset = Number(url.searchParams.get('offset') || 0);
      const offset = Number.isSafeInteger(requestedOffset) ? Math.max(0, Math.min(requestedOffset, 10000)) : 0;
      const filters = [
        'select=id,request_id,created_at,provider,upstream_provider,finish_reason,generation_time_seconds,upstream_inference_time_seconds,endpoint,http_method,requested_model,model,prompt_tokens,cached_tokens,completion_tokens,total_tokens,total_cost_usd,request_summary,response_summary,status,http_status,error_code,latency_ms,provider_request_id,openrouter_generation_id,provider_cost_source,provider_cost_reconciled_at',
        'created_at=gte.' + encodeURIComponent(cutoff)
      ];
      if (status) filters.push('status=eq.' + encodeURIComponent(status));
      if (model) filters.push('or=(' + ['model','requested_model'].map((field) => field + '.ilike.*' + encodeURIComponent(model) + '*').join(',') + ')');
      if (endpoint) filters.push('endpoint=eq.' + encodeURIComponent(endpoint));
      filters.push('order=created_at.desc', 'limit=' + limit, 'offset=' + offset);
      try {
        const rows = await store.request('GET', 'openrouter_logs?' + filters.join('&'));
        if (!Array.isArray(rows)) throw new Error('invalid log rows');
        sendJson(res, 200, {
          source: 'supabase.openrouter_logs',
          generated_at: new Date(now()).toISOString(),
          window: windowName,
          limit,
          offset,
          count: rows.length,
          has_more: rows.length === limit,
          rows: rows.map((row) => ({
            id: row.id,
            request_id: row.request_id,
            created_at: row.created_at,
            provider: row.provider || 'openrouter',
            upstream_provider: row.upstream_provider,
            finish_reason: row.finish_reason,
            generation_time_seconds: row.generation_time_seconds,
            upstream_inference_time_seconds: row.upstream_inference_time_seconds,
            endpoint: row.endpoint,
            http_method: row.http_method,
            requested_model: row.requested_model,
            model: row.model,
            prompt_tokens: row.prompt_tokens,
            cached_tokens: row.cached_tokens,
            completion_tokens: row.completion_tokens,
            total_tokens: row.total_tokens,
            total_cost_usd: row.total_cost_usd,
            response_summary: row.response_summary && typeof row.response_summary === 'object' ? row.response_summary : {},
            status: row.status,
            http_status: row.http_status,
            error_code: row.error_code,
            latency_ms: row.latency_ms,
            provider_request_id: row.provider_request_id,
            openrouter_generation_id: row.openrouter_generation_id,
            provider_cost_source: row.provider_cost_source,
            provider_cost_reconciled_at: row.provider_cost_reconciled_at
          }))
        });
      } catch {
        logger?.warn?.('OpenRouter request logs unavailable', { source: 'openrouter_logs' });
        sendJson(res, 503, { error: { code: 'openrouter_logs_unavailable', message: 'OpenRouter request logs could not be loaded. Confirm migrations 063 and 064 are applied and server-side database access is configured.' } });
      }
      return true;
    }
    if (pathname === '/owner/api/ai-logs' && (req.method === 'GET' || req.method === 'HEAD')) {
      if (typeof store?.request !== 'function') {
        sendJson(res, 503, { error: { code: 'ai_logs_unavailable', message: 'AI request telemetry is not connected to the owner data store.' } });
        return true;
      }
      const url = new URL(req.url, 'http://local');
      const windowName = url.searchParams.get('window') || '24h';
      const windowsMs = { '15m': 15 * 60e3, '30m': 30 * 60e3, '1h': 60 * 60e3, '5h': 5 * 60 * 60e3, '12h': 12 * 60 * 60e3, '24h': 24 * 60 * 60e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3, '90d': 90 * 86400e3 };
      if (!Object.hasOwn(windowsMs, windowName)) {
        sendJson(res, 400, { error: { code: 'invalid_window', message: 'Choose 15m, 30m, 1h, 5h, 12h, 24h, 7d, 30d, or 90d.' } });
        return true;
      }
      const cutoff = new Date(now() - windowsMs[windowName]).toISOString();
      const providerFilter = String(url.searchParams.get('provider') || 'all').toLowerCase();
      // Provider names are normalized and filtered in memory; allow future integrations without
      // coupling this endpoint to a fixed provider allowlist.
      if (providerFilter.length > 60 || !/^[a-z0-9 _.-]+$/.test(providerFilter)) {
        sendJson(res, 400, { error: { code: 'invalid_provider', message: 'Choose a valid provider name or all.' } });
        return true;
      }
      const statusFilter = String(url.searchParams.get('status') || '').toLowerCase();
      if (statusFilter && !['success', 'error'].includes(statusFilter)) {
        sendJson(res, 400, { error: { code: 'invalid_status', message: 'Choose success or error.' } });
        return true;
      }
      const modelFilter = String(url.searchParams.get('model') || '').trim().slice(0, 120);
      if (modelFilter && !/^[a-zA-Z0-9:._/@ -]+$/.test(modelFilter)) {
        sendJson(res, 400, { error: { code: 'invalid_model_filter', message: 'The model filter contains unsupported characters.' } });
        return true;
      }
      const endpointFilter = String(url.searchParams.get('endpoint') || '').trim().slice(0, 120);
      if (endpointFilter && !/^\/[a-zA-Z0-9/_-]+$/.test(endpointFilter)) {
        sendJson(res, 400, { error: { code: 'invalid_endpoint_filter', message: 'The endpoint filter is invalid.' } });
        return true;
      }
      const requestedScope = url.searchParams.get('scope') || 'listed';
      const scope = ['listed', 'unlisted', 'all'].includes(requestedScope) ? requestedScope : 'listed';
      const requestedLimit = Number(url.searchParams.get('limit') || 50);
      const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 1000)) : 50;
      const requestedOffset = Number(url.searchParams.get('offset') || 0);
      const offset = Number.isSafeInteger(requestedOffset) ? Math.max(0, Math.min(requestedOffset, 10000)) : 0;
      const normalizeProvider = (value) => {
        const p = String(value || '').trim().toLowerCase();
        if (['google', 'google ai studio', 'gemini'].includes(p)) return 'google';
        if (['claude', 'anthropic'].includes(p)) return 'anthropic';
        if (p.includes('openrouter')) return 'openrouter';
        if (p.includes('openai')) return 'openai';
        return p || 'unknown';
      };
      const normalizeModel = (value, provider) => {
        let model = String(value || '').trim();
        if (provider === 'google') model = model.replace(/^models\//i, '');
        if (provider !== 'openrouter') model = model.replace(/^(?:openai|google|gemini|anthropic|claude)[/:]/i, '');
        return model.slice(0, 200);
      };
      const catalogs = {};
      const loadCatalog = async (provider) => {
        try {
          if (typeof fetchImpl !== 'function') return;
          let response;
          if (provider === 'openrouter') {
            response = await fetchImpl('https://openrouter.ai/api/v1/models', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'error' });
          } else if (provider === 'openai' && config?.ai?.openaiApiKey) {
            response = await fetchImpl('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + config.ai.openaiApiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'error' });
          } else if (provider === 'anthropic' && config?.ai?.anthropicApiKey) {
            response = await fetchImpl('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': config.ai.anthropicApiKey, 'anthropic-version': '2023-06-01', Accept: 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'error' });
          } else if (provider === 'google' && config?.ai?.geminiApiKey) {
            response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': config.ai.geminiApiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'error' });
          } else return;
          if (!response?.ok) return;
          const payload = await response.json();
          const entries = provider === 'google' ? payload?.models : payload?.data;
          if (!Array.isArray(entries)) return;
          catalogs[provider] = new Set(entries.map((entry) => normalizeModel(provider === 'google' ? entry?.name : entry?.id, provider)).filter(Boolean));
        } catch { /* Catalog status remains unknown on provider/API failure. */ }
      };
      try {
        const [usageRows, routerRows] = await Promise.all([
          store.request('GET', 'usage_events?select=request_id,endpoint,http_method,http_status,error_code,provider_request_id,finish_reason,provider,model,task,outcome,created_at,input_tokens,output_tokens,latency_ms,cost_usd,cost_source&created_at=gte.' + encodeURIComponent(cutoff) + '&order=created_at.desc&limit=1000'),
          store.request('GET', 'openrouter_logs?select=id,request_id,created_at,provider,upstream_provider,finish_reason,generation_time_seconds,upstream_inference_time_seconds,endpoint,http_method,requested_model,model,prompt_tokens,cached_tokens,completion_tokens,total_tokens,total_cost_usd,status,http_status,error_code,latency_ms,provider_request_id,openrouter_generation_id,provider_cost_source&created_at=gte.' + encodeURIComponent(cutoff) + '&order=created_at.desc&limit=1000')
        ]);
        if (!Array.isArray(usageRows) || !Array.isArray(routerRows)) throw new Error('invalid telemetry rows');
        let generationRows = [];
        let generationSourceAvailable = true;
        try {
          const imported = await store.request('GET', 'openrouter_generations?select=generation_id,created_at,model,provider_name,cost_total,tokens_prompt,tokens_completion,tokens_reasoning,tokens_cached,finish_reason,finish_reason_norm,latency_ms,generation_time_ms,request_id&created_at=gte.' + encodeURIComponent(cutoff) + '&order=created_at.desc&limit=1000');
          if (Array.isArray(imported)) generationRows = imported;
          else generationSourceAvailable = false;
        } catch {
          // Keep existing request logs available until migration 072 is applied or if the sync table is temporarily unavailable.
          generationSourceAvailable = false;
          logger?.warn?.('OpenRouter generation records unavailable', { source: 'openrouter_generations' });
        }
        // Join authoritative generation metadata to local request logs by the
        // provider generation ID. Local logs often arrive before cost reconciliation;
        // without this join the dashboard would hide costs already saved by the sync job.
        const generationById = new Map();
        for (const generationRow of generationRows) {
          const generationId = String(generationRow?.generation_id || '').trim();
          if (/^gen-[0-9A-Za-z-]{1,120}$/.test(generationId)) generationById.set(generationId, generationRow);
        }
        // Deliberately do not use provider live catalogs to classify NasrinAI inventory membership.
        const rows = [];
        for (const row of routerRows) {
          const actual = String(row.model || '').trim();
          // Keep requested aliases visible when OpenRouter does not report the resolved model.
          // Such rows are inferred request targets, not proof that the alias itself executed.
          const model = normalizeModel(actual || row.requested_model || 'Actual model not reported', 'openrouter');
          const status = String(row.status || 'unknown').trim().toLowerCase() || 'unknown';
          const catalogStatus = ownerCatalogStatus(model, 'openrouter');
          const modelStatus = actual ? 'observed' : row.requested_model ? 'inferred' : 'unavailable';
          const generationId = [row.openrouter_generation_id, row.provider_request_id]
            .find((value) => typeof value === 'string' && /^gen-[0-9A-Za-z-]{1,120}$/.test(value.trim()))?.trim() || '';
          const generation = generationId ? generationById.get(generationId) : null;
          const generationCostValue = generation?.cost_total;
          const generationCost = generationCostValue === null || generationCostValue === undefined || generationCostValue === ''
            ? null : Number(generationCostValue);
          const hasGenerationCost = generationCost !== null && Number.isFinite(generationCost) && generationCost >= 0;
          const hasVerifiedLogCost = row.total_cost_usd !== null && row.total_cost_usd !== undefined && row.total_cost_usd !== '' &&
            Number.isFinite(Number(row.total_cost_usd)) && Number(row.total_cost_usd) >= 0;
          const providerCost = hasGenerationCost ? generationCost : hasVerifiedLogCost ? Number(row.total_cost_usd) : null;
          const providerCostSource = providerCost === null ? null
            : hasGenerationCost ? 'openrouter_generation_api'
              : row.provider_cost_source || 'openrouter_logs.total_cost_usd';
          const generationMs = generation?.generation_time_ms === null || generation?.generation_time_ms === undefined
            ? null : Number(generation.generation_time_ms);
          rows.push({
            id: row.id, request_id: row.request_id, created_at: row.created_at, provider: 'openrouter',
            upstream_provider: row.upstream_provider || null, endpoint: row.endpoint, http_method: row.http_method,
            requested_model: row.requested_model, model, status, http_status: row.http_status, error_code: row.error_code,
            prompt_tokens: row.prompt_tokens ?? generation?.tokens_prompt ?? null,
            cached_tokens: row.cached_tokens ?? generation?.tokens_cached ?? null,
            completion_tokens: row.completion_tokens ?? generation?.tokens_completion ?? null,
            total_tokens: row.total_tokens ?? (generation?.tokens_prompt != null && generation?.tokens_completion != null
              ? Number(generation.tokens_prompt) + Number(generation.tokens_completion) : null),
            total_cost_usd: providerCost,
            provider_cost_source: providerCostSource,
            provider_request_id: row.provider_request_id, openrouter_generation_id: row.openrouter_generation_id,
            finish_reason: row.finish_reason || generation?.finish_reason || generation?.finish_reason_norm || null,
            generation_time_seconds: row.generation_time_seconds ?? (Number.isFinite(generationMs) && generationMs >= 0 ? generationMs / 1000 : null),
            upstream_inference_time_seconds: row.upstream_inference_time_seconds, latency_ms: row.latency_ms ?? generation?.latency_ms ?? null,
            catalog_status: catalogStatus, model_status: modelStatus,
            model_status_source: actual ? 'provider_response' : row.requested_model ? 'requested_model_alias' : 'missing_model_metadata',
            telemetry_source: 'openrouter_logs', cost_kind: providerCost !== null ? 'provider_reported' : 'unknown'
          });
        }
        // Include provider-discovered generations even when NasrinAI's best-effort
        // request logger did not persist a corresponding local request row.
        // Avoid double-counting generations already represented by local telemetry.
        const locallyLoggedGenerationIds = new Set(routerRows.flatMap((row) => {
          const candidates = [row.openrouter_generation_id, row.provider_request_id];
          return candidates.filter((value) => typeof value === 'string' && /^gen-[0-9A-Za-z-]{1,120}$/.test(value.trim())).map((value) => value.trim());
        }));
        for (const row of generationRows) {
          const generationId = String(row.generation_id || '').trim();
          if (!/^gen-[0-9A-Za-z-]{1,120}$/.test(generationId) || locallyLoggedGenerationIds.has(generationId)) continue;
          const model = normalizeModel(row.model || 'Actual model not reported', 'openrouter');
          const cost = row.cost_total === null || row.cost_total === undefined || row.cost_total === '' ? null : Number(row.cost_total);
          const validCost = cost !== null && Number.isFinite(cost) && cost >= 0;
          const generationMs = row.generation_time_ms === null || row.generation_time_ms === undefined ? null : Number(row.generation_time_ms);
          rows.push({
            id: null, request_id: row.request_id || null, created_at: row.created_at, provider: 'openrouter',
            upstream_provider: row.provider_name || null, endpoint: '/generation', http_method: 'GET',
            requested_model: model, model, status: 'success', http_status: 200, error_code: null,
            prompt_tokens: row.tokens_prompt, cached_tokens: row.tokens_cached, completion_tokens: row.tokens_completion,
            total_tokens: Number.isFinite(Number(row.tokens_prompt)) && Number.isFinite(Number(row.tokens_completion))
              ? Number(row.tokens_prompt) + Number(row.tokens_completion) : null,
            total_cost_usd: validCost ? cost : null,
            provider_cost_source: validCost ? 'openrouter_generation_api' : null,
            provider_request_id: generationId, openrouter_generation_id: generationId,
            finish_reason: row.finish_reason || row.finish_reason_norm || null,
            generation_time_seconds: Number.isFinite(generationMs) && generationMs >= 0 ? generationMs / 1000 : null,
            upstream_inference_time_seconds: null, latency_ms: row.latency_ms,
            catalog_status: ownerCatalogStatus(model, 'openrouter'),
            model_status: model === 'Actual model not reported' ? 'unavailable' : 'observed',
            model_status_source: model === 'Actual model not reported' ? 'missing_model_metadata' : 'openrouter_generation_api',
            telemetry_source: 'openrouter_generations',
            cost_kind: validCost ? 'provider_reported' : 'unknown'
          });
        }
        for (const row of usageRows) {
          const provider = normalizeProvider(row.provider);
          // OpenRouter's detailed request log is authoritative for that route; do not double-count its aggregate usage event.
          if (provider === 'openrouter') continue;
          const catalogProvider = provider === 'gemini' ? 'google' : provider;
          const model = normalizeModel(row.model, catalogProvider) || 'Actual model not reported';
          const outcome = String(row.outcome || 'unknown').trim().toLowerCase() || 'unknown';
          const successOutcomes = ['ok', 'success', 'succeeded', 'complete', 'completed'];
          const failureOutcomes = ['error', 'failed', 'failure', 'timeout', 'timed_out', 'cancelled', 'canceled'];
          const status = successOutcomes.includes(outcome) ? 'success' : failureOutcomes.includes(outcome) ? 'error' : outcome;
          // Legacy usage_events.cost_usd values may be estimates. Trust only the
          // explicit cost_source marker enforced by migration 062.
          rows.push({
            id: null, request_id: row.request_id || null, created_at: row.created_at, provider: catalogProvider,
            upstream_provider: null, endpoint: row.endpoint || null, http_method: row.http_method || null, requested_model: model, model,
            status, http_status: row.http_status ?? null, error_code: row.error_code || null, prompt_tokens: row.input_tokens, cached_tokens: row.cached_tokens ?? null,
            completion_tokens: row.output_tokens, total_tokens: (Number(row.input_tokens) || 0) + (Number(row.output_tokens) || 0),
            total_cost_usd: row.cost_source === 'provider_reported' && row.cost_usd != null && Number.isFinite(Number(row.cost_usd)) && Number(row.cost_usd) >= 0 ? Number(row.cost_usd) : null,
            provider_cost_source: row.cost_source === 'provider_reported' ? 'usage_events.provider_reported' : null, provider_request_id: row.provider_request_id || null, openrouter_generation_id: null,
            finish_reason: row.finish_reason || null, generation_time_seconds: null, upstream_inference_time_seconds: null, latency_ms: row.latency_ms,
            catalog_status: ownerCatalogStatus(model, catalogProvider),
            model_status: model === 'Actual model not reported' ? 'unavailable' : 'observed',
            model_status_source: model === 'Actual model not reported' ? 'missing_model_metadata' : 'usage_event',
            telemetry_source: 'usage_events', cost_kind: row.cost_source === 'provider_reported' && row.cost_usd != null && Number.isFinite(Number(row.cost_usd)) && Number(row.cost_usd) >= 0 ? 'provider_reported' : 'unknown'
          });
        }
        const canonicalFilter = providerFilter === 'gemini' ? 'google' : providerFilter === 'claude' ? 'anthropic' : providerFilter;
        const filtered = rows.filter((row) => {
          if (canonicalFilter !== 'all' && row.provider !== canonicalFilter) return false;
          if (statusFilter && !((statusFilter === 'success' && ['success', 'ok', 'succeeded', 'complete', 'completed'].includes(row.status)) || (statusFilter === 'error' && ['error', 'failed', 'failure', 'timeout', 'timed_out', 'cancelled', 'canceled'].includes(row.status)))) return false;
          if (modelFilter && ![row.model, row.requested_model].some((value) => String(value || '').toLowerCase().includes(modelFilter.toLowerCase()))) return false;
          if (endpointFilter && row.endpoint !== endpointFilter) return false;
          if (scope === 'listed' && row.catalog_status !== 'listed') return false;
          if (scope === 'unlisted' && row.catalog_status !== 'not_listed') return false;
          return true;
        }).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
        const page = filtered.slice(offset, offset + limit);
        sendJson(res, 200, {
          source: 'nasrinai_configured_catalog+supabase.usage_events+supabase.openrouter_logs+supabase.openrouter_generations',
          generation_source_available: generationSourceAvailable,
          generated_at: new Date(now()).toISOString(), window: windowName, provider: providerFilter, scope,
          limit, offset, count: filtered.length, has_more: offset + limit < filtered.length,
          coverage_limited: usageRows.length === 1000 || routerRows.length === 1000 || generationRows.length === 1000,
          catalog_source: 'nasrinai_configured_catalog',
          rows: page
        });
      } catch {
        logger?.warn?.('AI request logs unavailable', { source: 'provider_logs' });
        sendJson(res, 503, { error: { code: 'ai_logs_unavailable', message: 'AI request logs could not be loaded. Verify provider telemetry, model catalogs, and server-side database access.' } });
      }
      return true;
    }
    if (pathname === '/owner/api/unlisted-models' && (req.method === 'GET' || req.method === 'HEAD')) {
      if (typeof store?.request !== 'function') {
        sendJson(res, 503, { error: { code: 'model_telemetry_unavailable', message: 'Cross-provider model telemetry is not connected.' } });
        return true;
      }
      const url = new URL(req.url, 'http://local');
      const windowName = url.searchParams.get('window') || '7d';
      const daysByWindow = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 };
      if (!Object.hasOwn(daysByWindow, windowName)) {
        sendJson(res, 400, { error: { code: 'invalid_window', message: 'Choose 24h, 7d, 30d, or 90d.' } });
        return true;
      }
      const cutoff = new Date(now() - daysByWindow[windowName] * 86400000).toISOString();
      try {
        // Only collect model/provider metadata. Never return prompt, completion, or raw summaries.
        const usageRows = await store.request('GET',
          'usage_events?select=provider,model,task,outcome,created_at,input_tokens,output_tokens,latency_ms,cost_usd&created_at=gte.' +
          encodeURIComponent(cutoff) + '&order=created_at.desc&limit=1000');
        const routerRows = await store.request('GET',
          'openrouter_logs?select=provider,requested_model,model,upstream_provider,endpoint,status,created_at,prompt_tokens,completion_tokens,total_cost_usd&created_at=gte.' +
          encodeURIComponent(cutoff) + '&order=created_at.desc&limit=1000');
        if (!Array.isArray(usageRows) || !Array.isArray(routerRows)) throw new Error('invalid telemetry');
        const grouped = new Map();
        const add = (provider, model, row, source, actual) => {
          const p = String(provider || 'unknown').trim().toLowerCase().slice(0, 60);
          const m = String(model || '').trim().slice(0, 200);
          if (!m || /^(openrouter\/(auto|free)|auto)$/i.test(m)) return;
          const key = p + '\u0000' + m;
          let item = grouped.get(key);
          if (!item) {
            item = { provider: p, catalog_provider: source === 'openrouter_logs' ? 'openrouter' : p, model: m, first_seen: row.created_at || null, last_seen: row.created_at || null,
              request_count: 0, successes: 0, failures: 0, input_tokens: 0, output_tokens: 0,
              cost_usd: 0, cost_known: false, cost_sources: new Set(), sources: new Set(), actual_model_confirmed: false };
            grouped.set(key, item);
          }
          item.request_count++;
          if (row.created_at && (!item.first_seen || row.created_at < item.first_seen)) item.first_seen = row.created_at;
          if (row.created_at && (!item.last_seen || row.created_at > item.last_seen)) item.last_seen = row.created_at;
          const status = row.outcome || row.status;
          if (status === 'ok' || status === 'success') item.successes++;
          else if (status) item.failures++;
          item.input_tokens += Math.max(0, Number(row.input_tokens ?? row.prompt_tokens) || 0);
          item.output_tokens += Math.max(0, Number(row.output_tokens ?? row.completion_tokens) || 0);
          // Only generation-reconciled OpenRouter cost is verified provider spend.
          // usage_events.cost_usd is an application-side estimate without provenance.
          const cost = source === 'usage_events' && row.cost_source === 'provider_reported' ? row.cost_usd : source === 'openrouter_logs' && ['openrouter_generation_api', 'openrouter_logs.total_cost_usd'].includes(row.provider_cost_source) ? row.total_cost_usd : null;
          if (cost !== null && cost !== undefined && Number.isFinite(Number(cost)) && Number(cost) >= 0) {
            item.cost_usd += Number(cost); item.cost_known = true; item.cost_sources.add(source === 'usage_events' ? 'usage_events.provider_reported' : 'openrouter_generation_api');
          }
          item.sources.add(source);
          item.actual_model_confirmed ||= actual === true;
        };
        for (const row of usageRows) add(row.provider, row.model, row, 'usage_events', true);
        for (const row of routerRows) {
          // For auto-routing, requested_model is not the actual model. Only count returned model.
          if (row.model) add(row.upstream_provider || row.provider, row.model, row, 'openrouter_logs', true);
        }
        const rows = [...grouped.values()].map((item) => {
          const catalogStatus = ownerCatalogStatus(item.model, item.catalog_provider);
          const result = {
            provider: item.provider, model: item.model, first_seen: item.first_seen, last_seen: item.last_seen,
            request_count: item.request_count, successes: item.successes, failures: item.failures,
            input_tokens: item.input_tokens, output_tokens: item.output_tokens,
            cost_usd: item.cost_known ? Number(item.cost_usd.toFixed(8)) : null,
            cost_kind: item.cost_known ? 'provider_reported' : 'unknown',
            provider_cost_source: item.cost_sources.size === 1 ? [...item.cost_sources][0] : item.cost_sources.size > 1 ? 'multiple_verified_sources' : null,
            catalog_status: catalogStatus, sources: [...item.sources].sort()
          };
          return result;
        }).sort((a, b) => {
          const priority = (x) => x.catalog_status === 'not_listed' ? 0 : x.catalog_status === 'unknown' ? 1 : 2;
          return priority(a) - priority(b) || b.request_count - a.request_count;
        });
        sendJson(res, 200, { source: 'supabase.usage_events+openrouter_logs', window: windowName,
          generated_at: new Date(now()).toISOString(), catalog_source: 'nasrinai_configured_catalog',
          count: rows.length, rows });
      } catch {
        logger?.warn?.('Cross-provider model telemetry unavailable', { source: 'model_telemetry' });
        sendJson(res, 503, { error: { code: 'model_telemetry_unavailable', message: 'Model telemetry could not be loaded. Verify owner database access and provider usage logging.' } });
      }
      return true;
    }
    if (pathname === '/owner/api/openrouter-billing' && (req.method === 'GET' || req.method === 'HEAD')) {
      if (!openrouterManagementKey || typeof fetchImpl !== 'function') {
        sendJson(res, 503, { error: { code: 'openrouter_billing_not_configured', message: 'OpenRouter billing analytics is not configured on the server.' } });
        return true;
      }
      const url = new URL(req.url, 'http://local');
      const windowName = url.searchParams.get('window') || '7d';
      if (!['7d', '30d'].includes(windowName)) {
        sendJson(res, 400, { error: { code: 'invalid_window', message: 'Choose 7d or 30d.' } });
        return true;
      }
      const at = now();
      const days = windowName === '7d' ? 7 : 30;
      const timeRange = {
        start: new Date(at - days * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date(at).toISOString()
      };
      const headers = { Authorization: 'Bearer ' + openrouterManagementKey, Accept: 'application/json', 'Content-Type': 'application/json' };
      try {
        // The legacy /activity endpoint is no longer the reliable source for
        // current analytics. Discover metric identifiers first, then issue a
        // bounded query against OpenRouter's supported Analytics API.
        let availableMetrics = [];
        try {
          const metaResponse = await fetchImpl('https://openrouter.ai/api/v1/analytics/meta', {
            method: 'GET', headers, signal: AbortSignal.timeout(8000), redirect: 'error'
          });
          if (metaResponse.status === 401) throw new Error('management_unauthorized');
          if (metaResponse.status === 403) throw new Error('management_forbidden');
          if (metaResponse.ok) {
            const meta = await metaResponse.json();
            const metrics = meta?.data?.metrics ?? meta?.metrics ?? meta?.data;
            if (Array.isArray(metrics)) availableMetrics = metrics.map((item) => typeof item === 'string' ? item : item?.name ?? item?.id).filter((item) => typeof item === 'string');
            else if (metrics && typeof metrics === 'object') availableMetrics = Object.keys(metrics);
          }
        } catch (error) {
          if (error?.message === 'management_unauthorized' || error?.message === 'management_forbidden') throw error;
          /* The documented baseline metrics below remain usable. */
        }
        const metricCandidates = [
          ['total_usage', ['total_usage', 'usage', 'spend']],
          ['requests', ['requests', 'request_count', 'requests_count']],
          ['tokens_prompt', ['tokens_prompt', 'prompt_tokens']],
          ['tokens_completion', ['tokens_completion', 'completion_tokens']],
          ['tokens_total', ['tokens_total', 'total_tokens']]
        ];
        const metrics = availableMetrics.length
          ? metricCandidates.map(([, aliases]) => aliases.find((name) => availableMetrics.includes(name))).filter(Boolean)
          : ['total_usage', 'tokens_total'];
        if (!metrics.includes('total_usage')) throw new Error('analytics schema does not expose total_usage');
        const analyticsResponse = await fetchImpl('https://openrouter.ai/api/v1/analytics/query', {
          method: 'POST', headers, signal: AbortSignal.timeout(10000), redirect: 'error',
          body: JSON.stringify({ metrics, dimensions: ['model'], granularity: 'day', time_range: timeRange, limit: 100 })
        });
        if (analyticsResponse.status === 401) throw new Error('management_unauthorized');
        if (analyticsResponse.status === 403) throw new Error('management_forbidden');
        if (!analyticsResponse.ok) throw new Error('analytics query failed');
        const analyticsPayload = await analyticsResponse.json();
        const rawRows = analyticsPayload?.data?.data ?? analyticsPayload?.data?.rows ?? analyticsPayload?.rows ?? analyticsPayload?.data;
        if (!Array.isArray(rawRows)) throw new Error('invalid analytics payload');
        const readMetric = (row, aliases) => {
          const bag = row?.metrics ?? row?.values ?? row;
          for (const name of aliases) {
            const value = bag?.[name] ?? row?.[name];
            if (value !== null && value !== undefined && value !== '') {
              const number = Number(value);
              if (Number.isFinite(number) && number >= 0) return number;
            }
          }
          return null;
        };
        const byModel = new Map();
        for (const row of rawRows) {
          const dimensions = row?.dimensions ?? row?.group ?? row;
          const model = String(dimensions?.model ?? row?.model ?? 'unknown').slice(0, 160);
          const current = byModel.get(model) || { model, requests: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, total_cost_usd: 0, cost_rows: 0 };
          const cost = readMetric(row, ['total_usage', 'usage', 'spend']);
          const requests = readMetric(row, ['requests', 'request_count', 'requests_count']);
          const prompt = readMetric(row, ['tokens_prompt', 'prompt_tokens']);
          const completion = readMetric(row, ['tokens_completion', 'completion_tokens']);
          const total = readMetric(row, ['tokens_total', 'total_tokens']);
          if (requests !== null) current.requests += requests;
          if (prompt !== null) current.prompt_tokens += prompt;
          if (completion !== null) current.completion_tokens += completion;
          if (total !== null) current.total_tokens += total;
          if (cost !== null) { current.total_cost_usd += cost; current.cost_rows += 1; }
          byModel.set(model, current);
        }
        const credits = { total_credits: null, total_usage: null, remaining_credits: null };
        // Credits are a separate API and use an inference key, not the
        // management key. Failure here must not hide valid Analytics results.
        if (openrouterApiKey) {
          try {
            const creditsResponse = await fetchImpl('https://openrouter.ai/api/v1/credits', {
              method: 'GET',
              headers: { Authorization: 'Bearer ' + openrouterApiKey, Accept: 'application/json' },
              signal: AbortSignal.timeout(8000), redirect: 'error'
            });
            if (creditsResponse.ok) {
              const payload = await creditsResponse.json();
              const value = payload?.data ?? payload;
              const totalCredits = Number(value?.total_credits);
              const totalUsage = Number(value?.total_usage);
              credits.total_credits = Number.isFinite(totalCredits) ? totalCredits : null;
              credits.total_usage = Number.isFinite(totalUsage) ? totalUsage : null;
              credits.remaining_credits = Number.isFinite(totalCredits) && Number.isFinite(totalUsage) ? totalCredits - totalUsage : null;
            }
          } catch { /* Balance metadata is optional; analytics remains authoritative for reported spend. */ }
        }
        const rows = [...byModel.values()].sort((a, b) => b.total_cost_usd - a.total_cost_usd).slice(0, 100);
        const totalOf = (key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
        sendJson(res, 200, {
          source: 'openrouter_analytics_api',
          generated_at: new Date(at).toISOString(),
          window: windowName,
          window_days: days,
          activity_rows: rawRows.length,
          totals: {
            requests: metrics.some((name) => ['requests','request_count','requests_count'].includes(name)) ? totalOf('requests') : null,
            prompt_tokens: metrics.some((name) => ['tokens_prompt','prompt_tokens'].includes(name)) ? totalOf('prompt_tokens') : null,
            completion_tokens: metrics.some((name) => ['tokens_completion','completion_tokens'].includes(name)) ? totalOf('completion_tokens') : null,
            total_tokens: metrics.some((name) => ['tokens_total','total_tokens'].includes(name)) ? totalOf('total_tokens') : null,
            provider_reported_cost_usd: rows.some((row) => row.cost_rows > 0) ? totalOf('total_cost_usd') : null,
            cost_source: 'OpenRouter Analytics API; totals are provider-reported, not estimated'
          },
          credits,
          by_model: rows,
          reconciliation: {
            status: 'not_reconciled',
            note: 'OpenRouter account analytics is shown independently. Do not add it to Supabase request costs; reconcile by generation ID before calculating combined spend.'
          }
        });
      } catch (error) {
        const permissionDenied = error?.message === 'management_forbidden';
        const unauthenticated = error?.message === 'management_unauthorized';
        logger?.warn?.('OpenRouter billing analytics unavailable', { source: 'openrouter_analytics_api', reason: permissionDenied ? 'forbidden' : unauthenticated ? 'unauthorized' : 'upstream_unavailable' });
        sendJson(res, permissionDenied ? 403 : unauthenticated ? 401 : 503, { error: {
          code: permissionDenied ? 'openrouter_management_forbidden' : unauthenticated ? 'openrouter_management_unauthorized' : 'openrouter_billing_unavailable',
          message: permissionDenied ? 'OpenRouter rejected this request. Configure an authorized Management API key.' : unauthenticated ? 'OpenRouter rejected the configured Management API key. Verify it is valid.' : 'OpenRouter analytics could not be retrieved. Check management-key access and provider availability.'
        } });
      }
      return true;
    }
    if (pathname === '/owner/api/openrouter-billing/reconcile' && req.method === 'POST') {
      if (!trustedSameOrigin(req) || String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
        sendNotFound(res);
        return true;
      }
      if (!openrouterApiKey || typeof fetchImpl !== 'function' || typeof store?.request !== 'function') {
        sendJson(res, 503, { error: { code: 'reconciliation_not_configured', message: 'Provider reconciliation is not configured on the server.' } });
        return true;
      }
      try {
        const body = await readOwnerJson(req, 2048);
        if (body.confirm !== 'RECONCILE') {
          sendJson(res, 400, { error: { code: 'confirmation_required', message: 'Explicit reconciliation confirmation is required.' } });
          return true;
        }
        const windowName = body.window === '7d' ? '7d' : '30d';
        const days = windowName === '7d' ? 7 : 30;
        const cutoff = new Date(now() - days * 86400000).toISOString();
        // Query a bounded recent window, then reconcile only rows with a real
        // OpenRouter generation ID. Legacy cost values without provenance are
        // deliberately eligible for authoritative replacement/backfill.
        const rows = await store.request('GET', 'openrouter_logs?select=id,provider_request_id,openrouter_generation_id,created_at,model,prompt_tokens,completion_tokens,total_tokens,total_cost_usd,provider_cost_source&created_at=gte.' + encodeURIComponent(cutoff) + '&order=created_at.desc&limit=500');
        if (!Array.isArray(rows)) throw new Error('invalid telemetry rows');
        const eligible = rows.filter((row) => {
          const candidates = [row.openrouter_generation_id, row.provider_request_id]
            .filter((value) => typeof value === 'string')
            .map((value) => value.trim());
          const validId = candidates.some((id) => /^gen-[0-9A-Za-z-]{1,120}$/.test(id));
          const verified = row.provider_cost_source === 'openrouter_generation_api' &&
            row.total_cost_usd !== null && row.total_cost_usd !== undefined &&
            row.total_cost_usd !== '' && Number.isFinite(Number(row.total_cost_usd)) && Number(row.total_cost_usd) >= 0;
          return validId && !verified;
        });
        let matched = 0, updated = 0, unavailable = 0, failed = 0;
        for (const row of eligible) {
          const generationId = [row.openrouter_generation_id, row.provider_request_id]
            .find((value) => typeof value === 'string' && /^gen-[0-9A-Za-z-]{1,120}$/.test(value.trim()))?.trim() || '';
          try {
            const response = await fetchImpl('https://openrouter.ai/api/v1/generation?id=' + encodeURIComponent(generationId), {
              method: 'GET',
              headers: { Authorization: 'Bearer ' + openrouterApiKey, Accept: 'application/json' },
              signal: AbortSignal.timeout(8000),
              redirect: 'error'
            });
            if (!response.ok) { unavailable++; continue; }
            const payload = await response.json();
            const generation = payload?.data;
            const costValue = generation?.total_cost ?? generation?.usage;
            const cost = costValue === null || costValue === undefined || costValue === '' ? NaN : Number(costValue);
            if (!generation || (generation.id && generation.id !== generationId) || !Number.isFinite(cost) || cost < 0) { unavailable++; continue; }
            const providerModel = typeof generation.model === 'string' ? generation.model.slice(0, 180) : row.model;
            const promptTokens = Number(generation.tokens_prompt ?? generation.prompt_tokens);
            const completionTokens = Number(generation.tokens_completion ?? generation.completion_tokens);
            const totalTokens = Number(generation.tokens ?? generation.total_tokens);
            const generationTime = Number(generation.generation_time);
            const upstreamTime = Number(generation.upstream_inference_time);
            const patch = {
              total_cost_usd: cost,
              model: providerModel || null,
              upstream_provider: typeof generation.provider_name === 'string' ? generation.provider_name.slice(0, 160) : null,
              finish_reason: typeof (generation.native_finish_reason ?? generation.finish_reason) === 'string' ? String(generation.native_finish_reason ?? generation.finish_reason).slice(0, 120) : null,
              generation_time_seconds: Number.isFinite(generationTime) && generationTime >= 0 ? generationTime / 1000 : null,
              upstream_inference_time_seconds: Number.isFinite(upstreamTime) && upstreamTime >= 0 ? upstreamTime / 1000 : null,
              openrouter_generation_id: generationId,
              provider_cost_source: 'openrouter_generation_api',
              provider_cost_reconciled_at: new Date(now()).toISOString()
            };
            if (Number.isSafeInteger(promptTokens) && promptTokens >= 0) patch.prompt_tokens = promptTokens;
            if (Number.isSafeInteger(completionTokens) && completionTokens >= 0) patch.completion_tokens = completionTokens;
            if (Number.isSafeInteger(totalTokens) && totalTokens >= 0) patch.total_tokens = totalTokens;
            // Optimistic concurrency guard: only replace the exact cost/provenance
            // observed above, so a concurrent verified reconciliation is never overwritten.
            const sourceFilter = row.provider_cost_source === null || row.provider_cost_source === undefined || row.provider_cost_source === ''
              ? '&provider_cost_source=is.null'
              : '&provider_cost_source=eq.' + encodeURIComponent(String(row.provider_cost_source));
            const costFilter = row.total_cost_usd === null || row.total_cost_usd === undefined || row.total_cost_usd === ''
              ? '&total_cost_usd=is.null'
              : '&total_cost_usd=eq.' + encodeURIComponent(String(row.total_cost_usd));
            const result = await store.request('PATCH', 'openrouter_logs?id=eq.' + encodeURIComponent(row.id) + sourceFilter + costFilter, { body: patch, headers: { Prefer: 'return=representation' } });
            if (Array.isArray(result) && result.length) updated++;
            else unavailable++;
            matched++;
          } catch {
            failed++;
          }
        }
        const summary = await store.request('GET', 'openrouter_logs?select=id,provider_request_id,openrouter_generation_id,total_cost_usd,provider_cost_source,created_at&created_at=gte.' + encodeURIComponent(cutoff) + '&limit=1000');
        const all = Array.isArray(summary) ? summary : [];
        const reconciled = all.filter((row) => (row.openrouter_generation_id || row.provider_request_id) && row.provider_cost_source === 'openrouter_generation_api' && row.total_cost_usd !== null && row.total_cost_usd !== undefined && Number.isFinite(Number(row.total_cost_usd)) && Number(row.total_cost_usd) >= 0).length;
        sendJson(res, 200, {
          source: 'openrouter_generation_api',
          generated_at: new Date(now()).toISOString(),
          window: windowName,
          attempted: eligible.length,
          matched,
          updated,
          unavailable,
          failed,
          reconciliation: { status: failed || unavailable ? 'partial' : 'complete_for_attempted_rows', rows_with_provider_ids_and_costs: reconciled, note: 'Only request rows with provider generation IDs are eligible. Provider totals are not added to other usage tables.' }
        });
      } catch {
        logger?.warn?.('OpenRouter billing reconciliation failed', { source: 'openrouter_generation_api' });
        sendJson(res, 503, { error: { code: 'reconciliation_failed', message: 'Reconciliation could not complete. Check database access and provider availability.' } });
      }
      return true;
    }
    if (pathname === '/owner/api/export' && req.method === 'GET') {
      const url = new URL(req.url, 'http://local');
      const windowName = url.searchParams.get('window') || '24h';
      if (!['24h', '7d'].includes(windowName)) {
        sendJson(res, 400, { error: { code: 'invalid_window', message: 'Choose 24h or 7d.' } });
        return true;
      }
      const at = now();
      const summary = await usageSince(at - (windowName === '24h' ? 24 : 168) * 60 * 60 * 1000);
      if (!summary) {
        sendJson(res, 503, { error: { code: 'data_unavailable', message: 'Usage telemetry is unavailable until its verified data source is connected.' } });
        return true;
      }
      if (!(await recordAudit('usage_export', session.sub, req))) {
        sendJson(res, 503, { error: { code: 'audit_unavailable', message: 'The export audit service is unavailable. Please try again later.' } });
        return true;
      }
      const columns = ['record_type','window','generated_at','window_start','window_end','provider','model','requests','successes','failures','input_tokens','output_tokens','total_tokens','active_user_ids','active_guest_ids','latency_p50_ms','latency_p95_ms','provider_reported_cost_usd','cost_known_rows','cost_unknown_rows'];
      const rows = [columns, [
        'summary', windowName, new Date(at).toISOString(), summary.window_start, summary.window_end, '',
        '', summary.request_count, summary.success_count, summary.failure_count, summary.input_tokens,
        summary.output_tokens, summary.total_tokens, summary.active_user_ids, summary.active_guest_ids,
        summary.latency_p50_ms, summary.latency_p95_ms, summary.provider_reported_cost_usd, summary.cost_known_rows, summary.cost_unknown_rows
      ]];
      for (const item of Array.isArray(summary.providers) ? summary.providers : []) {
        rows.push([
          'provider', windowName, new Date(at).toISOString(), summary.window_start, summary.window_end,
          item.provider, item.model, item.requests, item.successes, null, item.input_tokens,
          item.output_tokens, Number(item.input_tokens || 0) + Number(item.output_tokens || 0),
          null, null, null, null, item.provider_reported_cost_usd, item.cost_known_rows, item.cost_unknown_rows
        ]);
      }
      const csv = rows.map((row) => row.map((value) => {
        const cell = value === null || value === undefined ? '' : String(value);
        const safeCell = typeof value === 'string' && /^[=+@\t\r-]/.test(cell) ? "'" + cell : cell;
        return '"' + safeCell.replace(/"/g, '""') + '"';
      }).join(',')).join('\r\n') + '\r\n';
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="nasrinai-owner-usage-' + windowName + '.csv"');
      res.setHeader('Content-Length', Buffer.byteLength(csv));
      res.end(csv);
      return true;
    }
    jsonError(res, req.method === 'HEAD');
    return true;
  }
  return { handle };
}

export const OWNER_SESSION_SECONDS = SESSION_SECONDS;
export const OWNER_SESSION_COOKIE = SESSION_COOKIE;