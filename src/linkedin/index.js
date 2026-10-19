import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { seal, open } from '../connectors/secret.js';
import { HttpError } from '../http/errors.js';

const TTL_SECONDS = 600;
const COOKIE = 'nasrin_linkedin_oauth';
const EMAIL = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
const ALLOWED_SCOPES = new Set(['openid', 'profile', 'email', 'r_organization_social', 'r_member_social']);
const DEFAULT_SCOPES = ['openid', 'profile', 'email'];

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {}
  }
  return out;
}

const nonceHash = (key, nonce) => createHmac('sha256', key).update(nonce).digest('base64url');

export function createLinkedInIntegration({ config, logger = null, fetchImpl = (...args) => fetch(...args), now = () => Date.now() }) {
  const env = process.env;
  const clientId = String(env.LINKEDIN_CLIENT_ID || '').trim();
  const clientSecret = String(env.LINKEDIN_CLIENT_SECRET || '').trim();
  const publicUrl = String(config.publicUrl || '').replace(/\\/$/, '');
  const redirectUri = publicUrl + '/v1/linkedin/callback';
  const key = config.connectors?.key || null;
  const dbUrl = config.supabaseUrl;
  const dbKey = config.supabaseSecretKey;
  const apiVersion = /^\\d{6}$/.test(String(env.LINKEDIN_API_VERSION || '')) ? String(env.LINKEDIN_API_VERSION) : '202610';
  const requestedScopes = String(env.LINKEDIN_OAUTH_SCOPES || DEFAULT_SCOPES.join(' ')).split(/[\\s,]+/).filter(Boolean);
  const scopesValid = requestedScopes.length > 0 && requestedScopes.every((scope) => ALLOWED_SCOPES.has(scope)) &&
    requestedScopes.includes('openid') && requestedScopes.includes('profile') && requestedScopes.includes('email');
  const available = Boolean(clientId && clientSecret && publicUrl && key && dbUrl && dbKey && scopesValid);
  const stateKey = key ? createHmac('sha256', key).update('linkedin-oauth-state').digest() : null;

  async function db(method, path, body) {
    const response = await fetchImpl(dbUrl + '/rest/v1/' + path, {
      method,
      headers: {
        apikey: dbKey,
        Authorization: 'Bearer ' + dbKey,
        'Content-Type': 'application/json',
        Prefer: method === 'POST' ? 'resolution=merge-duplicates,return=representation' : 'return=representation'
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(8000),
      redirect: 'error'
    });
    if (!response.ok) throw new Error('LinkedIn connection storage failed (' + response.status + ').');
    return response.status === 204 ? [] : response.json().catch(() => []);
  }

  function signedState(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return body + '.' + createHmac('sha256', stateKey).update(body).digest('base64url');
  }

  function readState(value) {
    if (!value || value.length > 1500) return null;
    const [body, mac, extra] = value.split('.');
    if (!body || !mac || extra) return null;
    const expected = createHmac('sha256', stateKey).update(body).digest();
    const actual = Buffer.from(mac, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      return p && typeof p.u === 'string' && typeof p.t === 'string' && typeof p.n === 'string' &&
        Number.isInteger(p.e) && p.e > Math.floor(now() / 1000) ? p : null;
    } catch { return null; }
  }

  function who(caller) {
    if (caller?.actor?.type !== 'user' || !caller.actor.id || !caller.tenantId) {
      throw new HttpError(403, 'sign_in_required', 'Sign in to connect LinkedIn.');
    }
    return { tenant_id: caller.tenantId, user_id: String(caller.actor.id) };
  }

  const sealOpts = (w) => ({ tenantId: w.tenant_id, name: 'linkedin:' + w.user_id });
  async function connectionFor(w) {
    const rows = await db('GET', 'linkedin_connections?select=*&tenant_id=eq.' + encodeURIComponent(w.tenant_id) +
      '&user_id=eq.' + encodeURIComponent(w.user_id) + '&limit=1');
    return rows?.[0] || null;
  }

  async function tokenFor(w) {
    const row = await connectionFor(w);
    if (!row) throw new HttpError(409, 'linkedin_not_connected', 'Connect LinkedIn first.');
    if (Date.parse(row.expires_at || '') <= now() + 30000) {
      throw new HttpError(409, 'linkedin_reconnect_required', 'LinkedIn authorization expired. Please reconnect LinkedIn.');
    }
    let access;
    try { access = open(key, row.access_token_enc, sealOpts(w)); }
    catch { throw new HttpError(409, 'linkedin_reconnect_required', 'Please disconnect and reconnect LinkedIn.'); }
    return { access, row };
  }

  async function linkedinApi(path, token) {
    const response = await fetchImpl('https://api.linkedin.com' + path, {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
        'LinkedIn-Version': apiVersion,
        'X-Restli-Protocol-Version': '2.0.0'
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const status = response.status === 401 ? 409 : response.status === 403 ? 403 : response.status === 429 ? 429 : 502;
      const code = status === 409 ? 'linkedin_reconnect_required' : status === 403 ? 'linkedin_permission_denied' : status === 429 ? 'linkedin_rate_limited' : 'linkedin_api_error';
      const message = status === 409 ? 'LinkedIn authorization expired. Please reconnect LinkedIn.' :
        status === 403 ? 'LinkedIn denied this request. Confirm your app approval, organization role, and granted permissions.' :
        status === 429 ? 'LinkedIn rate limit reached. Try again later.' : 'LinkedIn is temporarily unavailable.';
      throw new HttpError(status, code, message);
    }
    return data || {};
  }

  const redirectBack = (res, result) => { res.writeHead(302, { Location: '/?linkedin=' + encodeURIComponent(result), 'Cache-Control': 'no-store' }); res.end(); };
  const routes = [
    {
      method: 'GET', path: '/v1/linkedin/status', scope: 'chat',
      handler: async ({ caller }) => {
        if (!available || caller?.actor?.type !== 'user') {
          return { body: { available, connected: false, scopes: [], capabilities: { profile: false, organization_posts: false }, note: 'Requires LinkedIn developer credentials, secure token storage, and approved product permissions.' } };
        }
        const w = who(caller);
        const row = await connectionFor(w);
        const scopes = Array.isArray(row?.scopes) ? row.scopes : [];
        return { body: {
          available, connected: Boolean(row), email: row?.email || null, scopes,
          connected_at: row?.connected_at || null,
          capabilities: { profile: Boolean(row), organization_posts: scopes.includes('r_organization_social') },
          categories: {
            posts_discussions: scopes.includes('r_organization_social') ? 'organization_posts_only' : 'requires_approved_organization_social_scope',
            jobs_hiring: 'not_available_from_general_member_search_api',
            pay_benefits: 'not_available_from_general_member_search_api',
            reviews_workplace: 'not_available_from_general_member_search_api',
            opportunities: 'not_available_from_general_member_search_api',
            terms_requirements: 'not_available_from_general_member_search_api'
          }
        } };
      }
    },
    {
      method: 'POST', path: '/v1/linkedin/connect', scope: 'chat', body: true,
      handler: async ({ caller, res }) => {
        const w = who(caller);
        if (!available) throw new HttpError(503, 'linkedin_not_configured', 'LinkedIn integration is not configured on this deployment yet.');
        const nonce = randomBytes(24).toString('base64url');
        const state = signedState({ u: w.user_id, t: w.tenant_id, n: nonceHash(key, nonce), e: Math.floor(now() / 1000) + TTL_SECONDS });
        res.appendHeader('Set-Cookie', COOKIE + '=' + encodeURIComponent(nonce) + '; Path=/v1/linkedin; Max-Age=' + TTL_SECONDS + '; HttpOnly; Secure; SameSite=Lax');
        const query = new URLSearchParams({
          response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
          state, scope: requestedScopes.join(' ')
        });
        return { body: { url: 'https://www.linkedin.com/oauth/v2/authorization?' + query.toString() } };
      }
    },
    {
      method: 'GET', path: '/v1/linkedin/callback', public: true,
      handler: async ({ req, res }) => {
        const query = new URL(req.url, 'https://nasrinai.com').searchParams;
        const nonce = cookies(req)[COOKIE] || '';
        res.appendHeader('Set-Cookie', COOKIE + '=; Path=/v1/linkedin; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
        const state = readState(query.get('state'));
        if (!available || query.get('error') || !state || !nonce || nonceHash(key, nonce) !== state.n ||
            !/^[\\w./~-]{8,2048}$/.test(query.get('code') || '')) return redirectBack(res, 'failed');
        try {
          const tokenResponse = await fetchImpl('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'authorization_code', code: query.get('code'), client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
            redirect: 'error', signal: AbortSignal.timeout(10000)
          });
          const token = await tokenResponse.json().catch(() => null);
          if (!tokenResponse.ok || typeof token?.access_token !== 'string' || !Number.isFinite(Number(token.expires_in))) return redirectBack(res, 'failed');
          const profileResponse = await fetchImpl('https://api.linkedin.com/v2/userinfo', {
            headers: { Authorization: 'Bearer ' + token.access_token, Accept: 'application/json' },
            redirect: 'error', signal: AbortSignal.timeout(10000)
          });
          const profile = await profileResponse.json().catch(() => null);
          if (!profileResponse.ok || typeof profile?.sub !== 'string' || typeof profile?.email !== 'string' || !EMAIL.test(profile.email)) return redirectBack(res, 'failed');
          const w = { tenant_id: state.t, user_id: state.u };
          const previous = await connectionFor(w);
          const opts = sealOpts(w);
          const grantedScopes = String(token.scope || requestedScopes.join(' ')).split(/[\\s,]+/).filter((scope) => ALLOWED_SCOPES.has(scope));
          const row = {
            tenant_id: w.tenant_id, user_id: w.user_id, email: profile.email.toLowerCase(),
            linkedin_subject: profile.sub.slice(0, 200),
            access_token_enc: seal(key, token.access_token, opts),
            refresh_token_enc: typeof token.refresh_token === 'string' ? seal(key, token.refresh_token, opts) : (previous?.refresh_token_enc || null),
            expires_at: new Date(now() + Number(token.expires_in) * 1000).toISOString(),
            scopes: grantedScopes, connected_at: previous?.connected_at || new Date(now()).toISOString(), updated_at: new Date(now()).toISOString()
          };
          await db('POST', 'linkedin_connections?on_conflict=tenant_id,user_id', row);
          logger?.info('linkedin integration connected', { email_domain: profile.email.split('@')[1], scopes: grantedScopes });
          return redirectBack(res, 'connected');
        } catch (error) {
          logger?.warn('linkedin integration callback failed', { code: error?.code || 'failed' });
          return redirectBack(res, 'failed');
        }
      }
    },
    {
      method: 'DELETE', path: '/v1/linkedin', scope: 'chat',
      handler: async ({ caller }) => {
        const w = who(caller);
        if (!available) throw new HttpError(503, 'linkedin_not_configured', 'LinkedIn integration is not configured.');
        await db('DELETE', 'linkedin_connections?tenant_id=eq.' + encodeURIComponent(w.tenant_id) + '&user_id=eq.' + encodeURIComponent(w.user_id));
        return { body: { connected: false } };
      }
    },
    {
      method: 'GET', path: '/v1/linkedin/organization-posts', scope: 'chat',
      handler: async ({ caller, req }) => {
        const w = who(caller);
        if (!available) throw new HttpError(503, 'linkedin_not_configured', 'LinkedIn integration is not configured.');
        const query = new URL(req.url, 'https://nasrinai.com').searchParams;
        const organizationId = String(query.get('organization_id') || '').trim();
        if (!/^\\d{1,30}$/.test(organizationId)) throw new HttpError(400, 'invalid_organization_id', 'Enter a numeric LinkedIn organization ID.');
        const searchTerm = String(query.get('query') || '').trim().slice(0, 200);
        const max = Math.max(1, Math.min(20, Number(query.get('count') || 10)));
        const { access, row } = await tokenFor(w);
        if (!Array.isArray(row.scopes) || !row.scopes.includes('r_organization_social')) {
          throw new HttpError(403, 'linkedin_permission_required', 'Your LinkedIn app must be approved for organization post read access and the connected member must have an eligible role on that organization.');
        }
        const author = encodeURIComponent('urn:li:organization:' + organizationId);
        const data = await linkedinApi('/rest/posts?q=author&author=' + author + '&count=' + max, access);
        const elements = Array.isArray(data.elements) ? data.elements : [];
        const posts = elements.map((post) => ({
          id: String(post.id || ''),
          author: String(post.author || ''),
          text: String(post.commentary || '').slice(0, 5000),
          created_at: Number.isFinite(Number(post.createdAt)) ? new Date(Number(post.createdAt)).toISOString() : null,
          source_url: typeof post.id === 'string' && /^urn:li:(?:share|ugcPost):[A-Za-z0-9-]+$/.test(post.id)
            ? 'https://www.linkedin.com/feed/update/' + encodeURIComponent(post.id) + '/' : null,
          channel: 'linkedin_authorized'
        })).filter((post) => !searchTerm || post.text.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, max);
        return { body: { source: 'LinkedIn authorized API', category: 'posts_discussions', organization_id: organizationId, retrieved_at: new Date(now()).toISOString(), posts, note: 'Only posts returned by the approved organization API are included; this is not a global LinkedIn search.' } };
      }
    }
  ];
  return { routes, available };
}
