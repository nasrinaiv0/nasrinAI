import { randomUUID } from 'node:crypto';
import { HttpError, UpstreamError } from './http/errors.js';
import { ownerKey } from './uploads.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 50 * 1024 * 1024;
const BUCKET = 'video-studio-assets';
const MIME = /^(video\/(mp4|webm|quicktime|x-matroska)|image\/(jpeg|png|webp|gif)|audio\/(mpeg|mp4|wav|webm|ogg|aac|x-m4a))$/i;

export function createVideoStudioAssets({ config, limiter, fetchImpl = fetch, timeoutMs = 20000 }) {
  const enabled = Boolean(config.supabaseUrl && config.supabaseSecretKey);
  const base = `${config.supabaseUrl}/storage/v1`;
  const key = config.supabaseSecretKey;

  async function call(method, path, body) {
    let response;
    try {
      response = await fetchImpl(base + path, {
        method,
        headers: { apikey: key, Authorization: 'Bearer ' + key, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (err) {
      throw new UpstreamError('Video Studio asset storage request failed: ' + (err?.name || 'error'));
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new UpstreamError(`Video Studio asset storage answered ${response.status} for ${method} ${path.split('?')[0]}`);
    return data;
  }

  function requireUser(caller) {
    if (caller?.actor?.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to save media to Video Studio cloud projects.');
    if (!enabled) throw new HttpError(503, 'video_assets_unavailable', 'Cloud media storage is not configured yet.');
  }

  return {
    enabled,
    maxBytes: MAX_BYTES,

    async sign(caller, body, ip) {
      requireUser(caller);
      const name = typeof body?.name === 'string' ? body.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : '';
      const type = typeof body?.type === 'string' ? body.type.toLowerCase().split(';')[0].trim() : '';
      const size = body?.size;
      if (!name) throw new HttpError(400, 'invalid_video_asset', 'Give this media file a name.');
      if (!MIME.test(type)) throw new HttpError(415, 'unsupported_video_asset', 'Upload a supported video, image, or audio file.');
      if (!Number.isSafeInteger(size) || size < 1) throw new HttpError(400, 'invalid_video_asset', 'The selected media file is empty or invalid.');
      if (size > MAX_BYTES) throw new HttpError(413, 'video_asset_too_large', 'Video Studio media files must be 50 MB or smaller.');
      await limiter.upload(caller, ip, Math.min(20, config.uploads?.perHour || 20));
      const id = randomUUID();
      const object = `${ownerKey(caller)}_${id}`;
      const data = await call('POST', `/object/upload/sign/${BUCKET}/${object}`, {});
      const signed = typeof data?.url === 'string' ? data.url : '';
      if (!signed.startsWith(`/object/upload/sign/${BUCKET}/${object}?`) || !/[?&]token=[^&]+/.test(signed)) {
        throw new UpstreamError('Storage returned an unexpected Video Studio upload link');
      }
      return { id, upload_url: base + signed, max_bytes: MAX_BYTES };
    },

    async read(caller, id) {
      requireUser(caller);
      if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(404, 'not_found', 'Media asset not found.');
      const object = ownerKey(caller) + '_' + id;
      let response;
      try {
        response = await fetchImpl(base + '/object/' + BUCKET + '/' + object, {
          method: 'GET', headers: { apikey: key, Authorization: 'Bearer ' + key },
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (err) { throw new UpstreamError('Video Studio asset download failed: ' + (err?.name || 'error')); }
      if (!response.ok) {
        await response.arrayBuffer().catch(() => {});
        if (response.status === 404) throw new HttpError(404, 'not_found', 'Media asset not found.');
        throw new UpstreamError('Video Studio asset storage answered ' + response.status + ' while reading media.');
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_BYTES) throw new HttpError(413, 'video_asset_too_large', 'The stored media is empty or exceeds the 50 MB limit.');
      return { id, bytes, mime: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream' };
    },

    async readUrl(caller, id) {
      requireUser(caller);
      if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(404, 'not_found', 'Media asset not found.');
      const object = `${ownerKey(caller)}_${id}`;
      const data = await call('POST', `/object/sign/${BUCKET}/${object}`, { expiresIn: 60 });
      const signed = typeof data?.signedURL === 'string' ? data.signedURL : typeof data?.signedUrl === 'string' ? data.signedUrl : '';
      if (!signed || !(signed.startsWith('/object/sign/') || signed.startsWith('http://') || signed.startsWith('https://'))) {
        throw new UpstreamError('Storage returned an unexpected Video Studio download link');
      }
      return { url: signed.startsWith('http') ? signed : base + signed, expires_in: 60 };
    },

    async remove(caller, id) {
      requireUser(caller);
      if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(404, 'not_found', 'Media asset not found.');
      const object = `${ownerKey(caller)}_${id}`;
      await call('DELETE', `/object/${BUCKET}`, { prefixes: [object] });
      return { deleted: true };
    }
  };
}
