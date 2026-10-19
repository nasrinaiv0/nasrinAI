import { readLink, readBytes } from './read-link.js';

const DAY = 86_400_000;
const MISS = 60 * 60 * 1000;
const MAX_ENTRIES = 300;
const MAX_IMAGE_BYTES = 1_500_000;

// Only permit common, non-active raster formats. Never pass SVG/HTML through.
function rasterType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function metaImage(html, pageUrl) {
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];
  const wanted = [];
  for (const tag of tags) {
    const key = (tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    const value = (tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!value || !/^(og:image|og:image:url|twitter:image|twitter:image:src)$/i.test(key.trim())) continue;
    try {
      const url = new URL(value.replace(/&amp;/g, '&'), pageUrl);
      if (url.protocol === 'https:' || url.protocol === 'http:') wanted.push(url.href);
    } catch {}
  }
  return [...new Set(wanted)].slice(0, 3);
}

export function createPagePreviews({ readLinkImpl = readLink, readBytesImpl = readBytes, now = () => Date.now() } = {}) {
  const cache = new Map();
  const pending = new Map();
  async function find(rawUrl) {
    let pageUrl;
    try {
      pageUrl = new URL(String(rawUrl || ''));
      if (!['https:', 'http:'].includes(pageUrl.protocol) || pageUrl.username || pageUrl.password) return null;
    } catch { return null; }
    const page = await readLinkImpl(pageUrl.href, { withHtml: true, maxChars: 200 });
    if (!page?.html || !page.url) return null;
    for (const imageUrl of metaImage(page.html, page.url)) {
      const got = await readBytesImpl(imageUrl, { maxBytes: MAX_IMAGE_BYTES, accept: 'image/png,image/jpeg,image/gif,image/webp' });
      if (got.error || !got.bytes || got.bytes.length > MAX_IMAGE_BYTES) continue;
      const type = rasterType(got.bytes);
      if (type) return { type, bytes: got.bytes, pageUrl: page.url };
    }
    return null;
  }
  async function preview(rawUrl) {
    const key = String(rawUrl || '').slice(0, 2048);
    if (!key) return null;
    const hit = cache.get(key);
    if (hit && now() - hit.at < (hit.preview ? DAY : MISS)) return hit.preview;
    if (pending.has(key)) return pending.get(key);
    const job = find(key).catch(() => null).then((preview) => {
      pending.delete(key);
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
      cache.set(key, { at: now(), preview });
      return preview;
    });
    pending.set(key, job);
    return job;
  }
  return { preview, cached: (url) => cache.has(String(url || '').slice(0, 2048)) };
}
