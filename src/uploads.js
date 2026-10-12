import { createHash, randomUUID } from 'node:crypto';
import { HttpError, UpstreamError } from './http/errors.js';
import { cleanName } from './attachments.js';

// Direct uploads (docs/uploads.md). Photos and files go from the browser
// straight to a private Supabase Storage bucket, so they are not held to
// Vercel's 4.5 MB request limit:
//
//   1. POST /v1/uploads { name, type, size } -> a one-time upload link for one
//      new object (Supabase signs it; it works for that object only).
//   2. The browser PUTs the file to that link.
//   3. The chat (or picture) request names it: { upload: id, name }.
//      The server reads it back with the secret key, deletes it, and checks it
//      exactly like a file sent inside the request (src/attachments.js).
//
// - The bucket is private (no policies): only the server's secret key and a
//   one-time link can touch it. The secret key never leaves the server.
// - Object names start with a hash of who asked for the link, so a caller can
//   only ever use their own uploads; the browser never chooses a path.
// - Files are kept only until they are used. What is never used is removed by
//   the hourly clean-up (purge) after an hour.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TYPE = /^[\w.+-]{1,60}\/[\w.+-]{1,80}$/;
const KEY = /^[0-9a-f]{32}_[0-9a-f-]{36}$/;
const STALE_MS = 60 * 60 * 1000;

const bad = (message) => new HttpError(400, 'invalid_attachment', message);
const mb = (n) => Math.round(n / 1048576);

export function ownerKey(caller) {
  return createHash('sha256').update(`${caller.tenantId}:${caller.actor.type}:${caller.actor.id}`).digest('hex').slice(0, 32);
}

export function createUploads({ config, limiter, fetchImpl = fetch, logger = null, now = () => Date.now(), timeoutMs = 20000 }) {
  const { enabled, bucket, maxBytes, perHour } = config.uploads;
  const base = `${config.supabaseUrl}/storage/v1`;
  const key = config.supabaseSecretKey;

  async function call(method, path, { json, accept = 'json' } = {}) {
    let resp;
    try {
      resp = await fetchImpl(base + path, {
        method,
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          ...(json === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: json === undefined ? undefined : JSON.stringify(json),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (err) {
      throw new UpstreamError('storage request failed: ' + (err?.name || 'error'));
    }
    if (accept === 'raw') return resp;
    const text = await resp.text().catch(() => '');
    if (!resp.ok) throw new UpstreamError(`storage answered ${resp.status} for ${method} ${path.split('?')[0].replace(/[0-9a-f]{32}_[0-9a-f-]{36}/, '<object>')}`);
    return text ? JSON.parse(text) : null;
  }

  // Reads a response body, never more than `limit` bytes.
  async function readCapped(resp, limit) {
    const declared = Number(resp.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > limit) return null;
    const parts = [];
    let size = 0;
    for await (const chunk of resp.body) {
      size += chunk.length;
      if (size > limit) return null;
      parts.push(chunk);
    }
    return Buffer.concat(parts.map((c) => Buffer.from(c)));
  }

  async function remove(keys) {
    if (!keys.length) return;
    try {
      await call('DELETE', `/object/${bucket}`, { json: { prefixes: keys } });
    } catch (err) {
      logger?.warn?.('could not remove uploads', { error: err?.message });
    }
  }

  return {
    enabled,
    maxBytes,

    // Step 1: a one-time link to upload one file.
    async sign(caller, body, ip) {
      if (!enabled) throw new HttpError(404, 'not_found', 'Direct uploads are not available.');
      const name = cleanName(body?.name);
      const type = body?.type === undefined || body.type === '' ? 'application/octet-stream' : body.type;
      if (typeof type !== 'string' || !TYPE.test(type)) throw bad(`"${name}" has a file type that is not valid.`);
      const size = body?.size;
      if (!Number.isInteger(size) || size < 1) throw bad(`"${name}" is empty.`);
      if (size > maxBytes) throw new HttpError(413, 'attachments_too_large', `Files can be up to ${mb(maxBytes)} MB in total.`);
      await limiter.upload(caller, ip, perHour);
      const id = randomUUID();
      const object = `${ownerKey(caller)}_${id}`;
      const data = await call('POST', `/object/upload/sign/${bucket}/${object}`, { json: {} });
      const signed = typeof data?.url === 'string' ? data.url : '';
      // The answer is a path under /storage/v1 carrying the one-time token.
      if (!signed.startsWith(`/object/upload/sign/${bucket}/${object}?`) || !/[?&]token=[^&]+/.test(signed)) {
        throw new UpstreamError('storage returned an unexpected upload link');
      }
      return { id, upload_url: base + signed, max_bytes: maxBytes };
    },

    // Step 3: replaces { upload: id, name, type } items in a request's file
    // list with { name, type, data } (base64), read back from storage. Items
    // sent inline are left as they are; parseAttachments checks everything.
    async resolve(caller, list) {
      if (!Array.isArray(list) || !list.some((item) => item && typeof item === 'object' && item.upload !== undefined)) return list;
      if (!enabled) throw bad('Direct uploads are not available. Please add the file again.');
      if (list.length > config.ai.attachments.maxCount) throw bad(`Send at most ${config.ai.attachments.maxCount} files at a time.`);
      const owner = ownerKey(caller);
      const used = [];
      let total = 0;
      try {
        const out = [];
        for (const item of list) {
          if (!item || typeof item !== 'object' || item.upload === undefined) { out.push(item); continue; }
          const name = cleanName(item.name);
          if (typeof item.upload !== 'string' || !UUID.test(item.upload)) throw bad(`"${name}" could not be found. Please add it again.`);
          const object = `${owner}_${item.upload}`;
          const resp = await call('GET', `/object/${bucket}/${object}`, { accept: 'raw' });
          if (resp.status === 400 || resp.status === 404) {
            await resp.body?.cancel?.().catch(() => {});
            throw bad(`"${name}" could not be found. Please add it again.`);
          }
          if (!resp.ok) {
            await resp.body?.cancel?.().catch(() => {});
            throw new UpstreamError(`storage answered ${resp.status} for GET /object/${bucket}/<object>`);
          }
          used.push(object);
          const bytes = await readCapped(resp, maxBytes - total);
          if (!bytes) throw new HttpError(413, 'attachments_too_large', `Files can be up to ${mb(maxBytes)} MB in total.`);
          total += bytes.length;
          out.push({ name, type: typeof item.type === 'string' ? item.type : '', data: bytes.toString('base64') });
        }
        return out;
      } finally {
        // Used once: removed whether or not the request goes on to succeed.
        await remove(used);
      }
    },

    // Hourly clean-up: removes uploads that were never used.
    async purge() {
      if (!enabled) return 0;
      const rows = await call('POST', `/object/list/${bucket}`, {
        json: { prefix: '', limit: 1000, offset: 0, sortBy: { column: 'created_at', order: 'asc' } }
      });
      const cutoff = now() - STALE_MS;
      const stale = (Array.isArray(rows) ? rows : [])
        .filter((r) => r && KEY.test(String(r.name)) && Date.parse(r.created_at) < cutoff)
        .map((r) => r.name);
      if (stale.length) await call('DELETE', `/object/${bucket}`, { json: { prefixes: stale } });
      return stale.length;
    }
  };
}
