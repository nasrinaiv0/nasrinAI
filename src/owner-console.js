import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { API_CSP, PAGE_CSP, sendJson } from './http/headers.js';

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
      <button class="nav-item" data-panel="users"><span>♙</span>Users &amp; Growth</button>
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
  users: { title: 'Users & Growth', description: 'Adoption and account trends, with personal data minimized by default.' },
  infra: { title: 'Infrastructure & Releases', description: 'Deployment and dependency status from explicitly connected sources.' },
  security: { title: 'Security & Audit', description: 'Authorization health, security events, and a traceable record of owner actions.' },
  automation: { title: 'Automation & Jobs', description: 'Workflow health, queue state, retries, and execution outcomes.' },
  finance: { title: 'Finance & Costs', description: 'Separate provider estimates, reservations, settled costs, and verified billing.' },
  incidents: { title: 'Incidents & Alerts', description: 'Operational issues and alert delivery, with clear status and ownership.' },
  reports: { title: 'Reports & Exports', description: 'Date-scoped reports from verified data sources.' },
  settings: { title: 'Settings', description: 'Owner-console preferences and access status. Allowlist values stay in Vercel.' }
};

function jsonError(res, head = false) { sendNotFound(res, head); }

export function createOwnerConsole({ config, verifyUser, store = null, clientIp = () => '', now = () => Date.now(), logger = null }) {
  async function usageSince(since) {
    if (store?.kind !== 'supabase' || typeof store.request !== 'function') return null;
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

  async function handle(req, res, pathname) {
    const ownerPath = pathname === '/owner' || pathname === '/owner/' || pathname.startsWith('/owner/api/');
    const bootstrapPath = pathname === '/v1/owner/session';
    if (!ownerPath && !bootstrapPath) return false;

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Content-Security-Policy', pathname === '/owner' || pathname === '/owner/' ? PAGE_CSP : API_CSP);
    res.setHeader('Vary', 'Cookie, Authorization');

    if (bootstrapPath) {
      if (req.method !== 'POST' || !trustedSameOrigin(req)) { jsonError(res, req.method === 'HEAD'); return true; }
      const allowlist = allowedRequest(req, config, clientIp);
      const token = bearer(req);
      if (!allowlist || !token || typeof verifyUser !== 'function') { jsonError(res); return true; }
      let user;
      try { user = await verifyUser(token); } catch { jsonError(res); return true; }
      if (!user?.id || !user?.email || !allowlist.emails.includes(String(user.email).trim().toLowerCase())) { jsonError(res); return true; }
      const issued = Math.floor(now() / 1000);
      const value = sign({ sub: user.id, email: String(user.email).trim().toLowerCase(), iat: issued, exp: issued + SESSION_SECONDS, jti: randomUUID() }, allowlist.sessionSecret);
      const secure = config?.isProduction === true || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
      res.setHeader('Set-Cookie', sessionCookie(value, SESSION_SECONDS, secure));
      res.statusCode = 204;
      res.end();
      return true;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD' && !(pathname === '/owner/api/session' && req.method === 'DELETE')) {
      sendNotFound(res, req.method === 'HEAD'); return true;
    }
    const allowlist = allowedRequest(req, config, clientIp);
    const session = allowlist && verifySession(readCookie(req, SESSION_COOKIE), allowlist.sessionSecret, Math.floor(now() / 1000));
    if (!allowlist || !session || !allowlist.emails.includes(session.email)) {
      sendNotFound(res, req.method === 'HEAD'); return true;
    }

    if (pathname === '/owner/api/session' && req.method === 'DELETE') {
      if (!trustedSameOrigin(req)) { sendNotFound(res); return true; }
      const secure = config?.isProduction === true || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
      res.setHeader('Set-Cookie', sessionCookie('', 0, secure));
      res.statusCode = 204;
      res.end();
      return true;
    }
    if (pathname === '/owner' || pathname === '/owner/') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(dashboardHtml));
      res.end(req.method === 'HEAD' ? undefined : dashboardHtml);
      return true;
    }
    if (pathname === '/owner/api/overview') {
      const at = now();
      let databaseHealth = 'unavailable';
      if (store?.kind === 'supabase' && typeof store.request === 'function') {
        try {
          const rows = await store.request('GET', 'tenants?select=id&limit=1');
          if (Array.isArray(rows)) databaseHealth = 'available';
        } catch {
          logger?.warn?.('owner database health check unavailable', { source: 'database' });
        }
      }
      const [usage24h, usage7d] = await Promise.all([
        usageSince(at - 24 * 60 * 60 * 1000),
        usageSince(at - 7 * 24 * 60 * 60 * 1000)
      ]);
      sendJson(res, 200, {
        generated_at: new Date(at).toISOString(),
        mode: 'read_only',
        data_sources: {
          ai_usage: usage24h || usage7d ? ((Number(usage24h?.request_count || 0) + Number(usage7d?.request_count || 0)) > 0 ? 'available' : 'no_data') : 'unavailable',
          users: 'unavailable',
          infrastructure: 'unavailable',
          database: databaseHealth,
          security_audit: 'unavailable',
          automation: 'unavailable',
          finance: 'unavailable',
          incidents: 'unavailable'
        },
        database_health: { status: databaseHealth, checked_at: new Date(at).toISOString() },
        usage_24h: usage24h,
        usage_7d: usage7d,
        panels
      });
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
      const columns = ['record_type','window','generated_at','window_start','window_end','provider','model','requests','successes','failures','input_tokens','output_tokens','total_tokens','active_user_ids','active_guest_ids','latency_p50_ms','latency_p95_ms','estimated_cost_usd','cost_estimate_rows'];
      const rows = [columns, [
        'summary', windowName, new Date(at).toISOString(), summary.window_start, summary.window_end, '',
        '', summary.request_count, summary.success_count, summary.failure_count, summary.input_tokens,
        summary.output_tokens, summary.total_tokens, summary.active_user_ids, summary.active_guest_ids,
        summary.latency_p50_ms, summary.latency_p95_ms, summary.estimated_cost_usd, summary.cost_estimate_rows
      ]];
      for (const item of Array.isArray(summary.providers) ? summary.providers : []) {
        rows.push([
          'provider', windowName, new Date(at).toISOString(), summary.window_start, summary.window_end,
          item.provider, item.model, item.requests, item.successes, null, item.input_tokens,
          item.output_tokens, Number(item.input_tokens || 0) + Number(item.output_tokens || 0),
          null, null, null, null, item.estimated_cost_usd, null
        ]);
      }
      const csv = rows.map((row) => row.map((value) => {
        const cell = value === null || value === undefined ? '' : String(value);
        return '"' + cell.replace(/"/g, '""') + '"';
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
