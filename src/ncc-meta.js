// NCC's Meta channels (docs/ncc.md): a business's own Facebook Page,
// Instagram professional account, Threads profile and WhatsApp Business
// number, through Meta's official APIs only.
//
// - Facebook Page post: POST graph.facebook.com/{page-id}/feed (message).
// - Instagram post: POST /{ig-user-id}/media (image_url, caption), wait for
//   the container, then POST /{ig-user-id}/media_publish (creation_id).
//   Instagram needs a picture: text-only posts are not possible.
// - Threads post: POST graph.threads.net/v1.0/{user-id}/threads
//   (media_type TEXT, text), then /threads_publish (creation_id).
// - WhatsApp: POST graph.facebook.com/{phone-number-id}/messages, a template
//   (needed outside the customer's 24-hour window) or plain text.
//
// Tokens are given to this module only to make the call; they are never
// logged or returned. Meta's answers are untrusted: only ids and a short,
// cleaned error message are kept.

const GRAPH = 'https://graph.facebook.com';
const THREADS = 'https://graph.threads.net/v1.0';

export class MetaError extends Error {
  constructor(category, message) {
    super(message);
    this.category = category;
  }
}

const ID = /^[0-9]{1,30}$/;
const clean = (s, n = 160) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// Meta's error -> a short, plain reason the business can act on.
export function explain(error, status) {
  const code = Number(error?.code);
  const sub = Number(error?.error_subcode);
  if (code === 190 || sub === 463 || sub === 467) return new MetaError('token', 'The connection has expired. Connect this channel again.');
  if (code === 10 || (code >= 200 && code <= 299)) return new MetaError('permission', 'Meta has not given this permission yet. The Meta app needs approval for it.');
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80004 || code === 130429) return new MetaError('rate', 'Meta is limiting how often this can be sent. Try again later.');
  if (code === 131047) return new MetaError('window', 'Outside WhatsApp\'s 24-hour window: send an approved template instead.');
  if (code === 132001) return new MetaError('template', 'WhatsApp does not know that template (or that language).');
  if (code === 131026 || code === 131030) return new MetaError('recipient', 'That number cannot receive this WhatsApp message.');
  if (code === 100) return new MetaError('invalid', 'Meta did not accept this: ' + (clean(error?.message) || 'a value is not valid.'));
  return new MetaError(status >= 500 ? 'unavailable' : 'refused', 'Meta refused this' + (error?.message ? ': ' + clean(error.message) : '.'));
}

export function createMeta({ graphVersion = null, fetchImpl = fetch, timeoutMs = 15_000, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const graph = (path) => `${GRAPH}${graphVersion ? '/' + graphVersion : ''}${path}`;

  // One call. GET params in the query; POST params as a form. The token goes
  // in the Authorization header for graph.facebook.com and as access_token for Threads.
  async function call(url, { method = 'GET', params = {}, json = null, token, threads = false }) {
    const u = new URL(url);
    const headers = { Accept: 'application/json' };
    let body;
    if (threads) params = { ...params, access_token: token };
    else headers.Authorization = 'Bearer ' + token;
    if (method === 'GET') for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
    else if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    else { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString(); }
    let resp;
    try {
      resp = await fetchImpl(u.toString(), { method, headers, body, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new MetaError('unavailable', 'Meta could not be reached. Try again later.');
    }
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data || data.error) throw explain(data?.error, resp.status);
    return data;
  }
  const idOf = (data) => {
    const id = String(data?.id || '');
    if (!/^[0-9_]{1,80}$/.test(id)) throw new MetaError('refused', 'Meta answered without an id.');
    return id;
  };

  return {
    // A Page access token -> the Page, and its Instagram account when one is linked.
    async checkPage(token) {
      const me = await call(graph('/me'), { params: { fields: 'id,name' }, token });
      if (!ID.test(String(me.id))) throw new MetaError('invalid', 'That is not a Facebook Page token.');
      let instagram = null;
      try {
        const p = await call(graph('/' + me.id), { params: { fields: 'instagram_business_account{id,username}' }, token });
        const ig = p.instagram_business_account;
        if (ig && ID.test(String(ig.id))) instagram = { id: String(ig.id), name: clean(ig.username, 120) };
      } catch { /* no Instagram account, or no permission for it */ }
      return { id: String(me.id), name: clean(me.name, 120), instagram };
    },
    async checkThreads(token) {
      const me = await call(THREADS + '/me', { params: { fields: 'id,username' }, token, threads: true });
      if (!ID.test(String(me.id))) throw new MetaError('invalid', 'That is not a Threads token.');
      return { id: String(me.id), name: clean(me.username, 120) };
    },
    async checkWhatsapp(phoneId, token) {
      if (!ID.test(String(phoneId))) throw new MetaError('invalid', 'The phone number ID is a number from WhatsApp Manager.');
      const p = await call(graph('/' + phoneId), { params: { fields: 'display_phone_number,verified_name' }, token });
      return { id: String(phoneId), name: clean([p.verified_name, p.display_phone_number].filter(Boolean).join(' · '), 120) };
    },

    async postFacebook(pageId, token, { text }) {
      return { id: idOf(await call(graph(`/${pageId}/feed`), { method: 'POST', params: { message: text }, token })) };
    },

    async postInstagram(igId, token, { text, image_url: imageUrl }) {
      const container = idOf(await call(graph(`/${igId}/media`), { method: 'POST', params: { image_url: imageUrl, caption: text || '' }, token }));
      // Meta fetches the picture first; publish when the container is ready.
      for (let i = 0; i < 6; i++) {
        const s = await call(graph('/' + container), { params: { fields: 'status_code' }, token }).catch(() => null);
        if (!s || s.status_code === 'FINISHED') break;
        if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new MetaError('invalid', 'Instagram could not use that picture. Use a public JPEG link.');
        await wait(2000);
      }
      return { id: idOf(await call(graph(`/${igId}/media_publish`), { method: 'POST', params: { creation_id: container }, token })) };
    },

    async postThreads(userId, token, { text }) {
      const container = idOf(await call(`${THREADS}/${userId}/threads`, { method: 'POST', params: { media_type: 'TEXT', text }, token, threads: true }));
      let last;
      for (let i = 0; i < 4; i++) {
        try {
          return { id: idOf(await call(`${THREADS}/${userId}/threads_publish`, { method: 'POST', params: { creation_id: container }, token, threads: true })) };
        } catch (err) {
          last = err;
          if (err.category === 'token' || err.category === 'permission') throw err;
          await wait(3000);
        }
      }
      throw last;
    },

    async sendWhatsapp(phoneId, token, { to, mode, template, language, text }) {
      const json = mode === 'text'
        ? { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }
        : { messaging_product: 'whatsapp', to, type: 'template', template: { name: template, language: { code: language } } };
      const data = await call(graph(`/${phoneId}/messages`), { method: 'POST', json, token });
      const id = String(data?.messages?.[0]?.id || '');
      if (!id || id.length > 200) throw new MetaError('refused', 'WhatsApp answered without a message id.');
      return { id };
    }
  };
}
