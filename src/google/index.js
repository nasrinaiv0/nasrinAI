import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { seal, open } from '../connectors/secret.js';
import { HttpError } from '../http/errors.js';

const TTL = 600;
const COOKIE = 'nasrin_google_oauth';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {}
    }
  }
  return out;
}
const sha = (s) => createHmac('sha256', 'nasrin-google-nonce').update(s).digest('base64url');

export function createGoogleIntegration({ config, logger = null, fetchImpl = (...args) => fetch(...args), now = () => Date.now() }) {
  const env = process.env;
  const clientId = String(env.GOOGLE_INTEGRATION_CLIENT_ID || '').trim();
  const clientSecret = String(env.GOOGLE_INTEGRATION_CLIENT_SECRET || '').trim();
  const publicUrl = String(config.publicUrl || '').replace(/\/$/, '');
  const redirectUri = publicUrl + '/v1/google/callback';
  const key = config.connectors?.key || null;
  const dbUrl = config.supabaseUrl;
  const dbKey = config.supabaseSecretKey;
  const available = Boolean(clientId && clientSecret && publicUrl && key && dbUrl && dbKey);
  const stateKey = key ? createHmac('sha256', key).update('google-oauth-state').digest() : null;

  async function db(method, path, body) {
    const response = await fetchImpl(dbUrl + '/rest/v1/' + path, {
      method,
      headers: { apikey: dbKey, Authorization: 'Bearer ' + dbKey, 'Content-Type': 'application/json', Prefer: method === 'POST' ? 'resolution=merge-duplicates,return=representation' : 'return=representation' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(8000),
      redirect: 'error'
    });
    if (!response.ok) throw new Error('Google connection storage failed (' + response.status + ').');
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
      return p && typeof p.u === 'string' && typeof p.t === 'string' && typeof p.n === 'string' && p.e > Math.floor(now() / 1000) && ['gmail','calendar','both'].includes(p.s) ? p : null;
    } catch { return null; }
  }
  const who = (caller) => {
    if (caller?.actor?.type !== 'user' || !caller.actor.id || !caller.tenantId) throw new HttpError(403, 'sign_in_required', 'Sign in to connect Google.');
    return { tenant_id: caller.tenantId, user_id: caller.actor.id };
  };
  const sealOpts = (w) => ({ tenantId: w.tenant_id, name: 'google:' + w.user_id });
  async function tokenFor(w) {
    const rows = await db('GET', 'google_connections?select=*&tenant_id=eq.' + encodeURIComponent(w.tenant_id) + '&user_id=eq.' + encodeURIComponent(w.user_id) + '&limit=1');
    const row = rows?.[0];
    if (!row) throw new HttpError(409, 'google_not_connected', 'Connect Google first.');
    let access;
    try { access = open(key, row.access_token_enc, sealOpts(w)); } catch { throw new HttpError(409, 'google_reconnect_required', 'Please disconnect and reconnect Google.'); }
    if (Date.parse(row.expires_at || '') - 60000 > now()) return access;
    if (!row.refresh_token_enc) throw new HttpError(409, 'google_reconnect_required', 'Please reconnect Google to refresh access.');
    let refresh;
    try { refresh = open(key, row.refresh_token_enc, sealOpts(w)); } catch { throw new HttpError(409, 'google_reconnect_required', 'Please reconnect Google.'); }
    const res = await fetchImpl('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refresh,grant_type:'refresh_token'}), redirect:'error', signal:AbortSignal.timeout(8000) });
    const data = await res.json().catch(()=>null);
    if (!res.ok || typeof data?.access_token !== 'string') throw new HttpError(409, 'google_reconnect_required', 'Google authorization expired. Please reconnect Google.');
    const update = { access_token_enc: seal(key, data.access_token, sealOpts(w)), expires_at: new Date(now() + Number(data.expires_in || 3600)*1000).toISOString(), updated_at: new Date(now()).toISOString() };
    await db('PATCH', 'google_connections?tenant_id=eq.'+encodeURIComponent(w.tenant_id)+'&user_id=eq.'+encodeURIComponent(w.user_id), update);
    return data.access_token;
  }
  async function googleApi(path, token) {
    const res = await fetchImpl('https://www.googleapis.com/' + path, { headers:{Authorization:'Bearer '+token, Accept:'application/json'}, redirect:'error', signal:AbortSignal.timeout(10000) });
    const data = await res.json().catch(()=>null);
    if (!res.ok) {
      const status = res.status === 401 || res.status === 403 ? 403 : res.status === 429 ? 429 : 502;
      throw new HttpError(status, 'google_api_error', status === 403 ? 'Google denied this request. Check the permissions granted.' : status === 429 ? 'Google rate limit reached. Try again shortly.' : 'Google service is temporarily unavailable.');
    }
    return data;
  }
  const redirectBack = (res, query) => { res.writeHead(302, { Location: '/?google=' + query }); res.end(); };
  const routes = [
    { method:'GET', path:'/v1/google/status', scope:'chat', handler:async ({caller}) => {
      if (!available || caller?.actor?.type !== 'user') return { body:{available,connected:false,scopes:[]} };
      const w=who(caller); const rows=await db('GET','google_connections?select=scopes,email,connected_at&tenant_id=eq.'+encodeURIComponent(w.tenant_id)+'&user_id=eq.'+encodeURIComponent(w.user_id)+'&limit=1');
      return { body:{available,connected:Boolean(rows?.[0]),email:rows?.[0]?.email||null,scopes:rows?.[0]?.scopes||[],connected_at:rows?.[0]?.connected_at||null} };
    }},
    { method:'POST', path:'/v1/google/connect', scope:'chat', body:true, handler:async ({caller,body,res,req}) => {
      const w=who(caller);
      if (!available) throw new HttpError(503,'google_not_configured','Google integration is not configured on this deployment yet.');
      const service = ['gmail','calendar','both'].includes(body?.service) ? body.service : '';
      if (!service) throw new HttpError(400,'invalid_google_service','Choose Gmail, Calendar, or both.');
      const nonce=randomBytes(24).toString('base64url');
      const state=signedState({u:w.user_id,t:w.tenant_id,n:sha(nonce),e:Math.floor(now()/1000)+TTL,s:service});
      res.appendHeader('Set-Cookie', COOKIE+'='+encodeURIComponent(nonce)+'; Path=/v1/google; Max-Age='+TTL+'; HttpOnly; Secure; SameSite=Lax');
      const scopes=['openid','email','profile',...(service==='gmail'||service==='both'?[GMAIL_SCOPE]:[]),...(service==='calendar'||service==='both'?[CALENDAR_SCOPE]:[])];
      const q=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:scopes.join(' '),access_type:'offline',include_granted_scopes:'true',prompt:'consent',state});
      return {body:{url:'https://accounts.google.com/o/oauth2/v2/auth?'+q.toString()}};
    }},
    { method:'GET', path:'/v1/google/callback', public:true, handler:async ({req,res}) => {
      const q=new URL(req.url,'https://nasrinai.com').searchParams;
      const nonce=cookies(req)[COOKIE]||'';
      res.appendHeader('Set-Cookie',COOKIE+'=; Path=/v1/google; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
      const state=readState(q.get('state'));
      if (!available || q.get('error') || !state || !nonce || sha(nonce)!==state.n || !(q.get('code')||'').match(/^[\w./~-]{8,2048}$/)) return redirectBack(res,'failed');
      try {
        const tokenRes=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:q.get('code'),client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code'}),redirect:'error',signal:AbortSignal.timeout(10000)});
        const t=await tokenRes.json().catch(()=>null);
        if(!tokenRes.ok||typeof t?.access_token!=='string') return redirectBack(res,'failed');
        const me=await googleApi('oauth2/v2/userinfo',t.access_token);
        if(typeof me?.email!=='string'||!EMAIL.test(me.email)) return redirectBack(res,'failed');
        const w={tenant_id:state.t,user_id:state.u};
        const existing=await db('GET','google_connections?select=refresh_token_enc,scopes&tenant_id=eq.'+encodeURIComponent(w.tenant_id)+'&user_id=eq.'+encodeURIComponent(w.user_id)+'&limit=1');
        const opts=sealOpts(w);
        const row={tenant_id:w.tenant_id,user_id:w.user_id,email:me.email.toLowerCase(),access_token_enc:seal(key,t.access_token,opts),refresh_token_enc:t.refresh_token?seal(key,t.refresh_token,opts):(existing?.[0]?.refresh_token_enc||null),expires_at:new Date(now()+Number(t.expires_in||3600)*1000).toISOString(),scopes:(t.scope||'').split(' ').filter(Boolean),connected_at:new Date(now()).toISOString(),updated_at:new Date(now()).toISOString()};
        await db('POST','google_connections?on_conflict=tenant_id,user_id',row);
        logger?.info('google integration connected',{service:state.s,email_domain:me.email.split('@')[1]});
        return redirectBack(res,'connected');
      } catch(err) { logger?.warn('google integration callback failed',{code:err?.code||'failed'}); return redirectBack(res,'failed'); }
    }},
    { method:'DELETE', path:'/v1/google', scope:'chat', handler:async ({caller}) => {
      const w=who(caller); if(!available) throw new HttpError(503,'google_not_configured','Google integration is not configured.');
      await db('DELETE','google_connections?tenant_id=eq.'+encodeURIComponent(w.tenant_id)+'&user_id=eq.'+encodeURIComponent(w.user_id));
      return {body:{connected:false}};
    }},
    { method:'GET', path:'/v1/google/gmail/messages', scope:'chat', handler:async ({caller,req}) => {
      const w=who(caller); if(!available) throw new HttpError(503,'google_not_configured','Google integration is not configured.');
      const q=new URL(req.url,'https://nasrinai.com').searchParams;
      const max=Math.max(1,Math.min(20,Number(q.get('maxResults')||10)));
      const token=await tokenFor(w);
      const data=await googleApi('gmail/v1/users/me/messages?maxResults='+max+(q.get('q')?'&q='+encodeURIComponent(q.get('q').slice(0,200)):''),token);
      return {body:{messages:Array.isArray(data.messages)?data.messages:[],resultSizeEstimate:data.resultSizeEstimate||0}};
    }},
    { method:'GET', path:'/v1/google/calendar/events', scope:'chat', handler:async ({caller,req}) => {
      const w=who(caller); if(!available) throw new HttpError(503,'google_not_configured','Google integration is not configured.');
      const q=new URL(req.url,'https://nasrinai.com').searchParams;
      const max=Math.max(1,Math.min(50,Number(q.get('maxResults')||20)));
      const params=new URLSearchParams({maxResults:String(max),singleEvents:'true',orderBy:'startTime',timeMin:q.get('timeMin')||new Date(now()).toISOString()});
      if(q.get('timeMax')) params.set('timeMax',q.get('timeMax'));
      const token=await tokenFor(w);
      const data=await googleApi('calendar/v3/calendars/primary/events?'+params,token);
      return {body:{events:Array.isArray(data.items)?data.items:[],nextPageToken:data.nextPageToken||null}};
    }}
  ];
  return { routes, available };
}
