import { readLink, readBytes } from './read-link.js';

// Site logos for a reply's sources (docs/web.md, "Site logos"): the site's
// own icon, so each source is credited with its real logo.
//
// - The browser asks our server (GET /v1/site-icon?host=…), never the site:
//   the strict CSP stays 'self' and the person's browser contacts no one else.
// - Our server reads the site's home page for its declared icon
//   (apple-touch-icon, then icon), else /favicon.ico, with the SSRF-safe
//   reader (public addresses only, 8 s, 100 KB).
// - Only real raster images are passed on (PNG, ICO, JPEG, GIF, WebP, checked
//   by their first bytes). SVG is refused: it can carry scripts.
// - Answers are kept in memory for a day (misses for an hour), so a site is
//   asked at most once a day per server instance.

const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const DAY = 86_400_000;
const MISS = 3_600_000;
const MAX_ENTRIES = 1000;

export function validHost(raw) {
  const h = String(raw || '').trim().toLowerCase().replace(/\.$/, '');
  return HOST.test(h) ? h : null;
}

// The image kind from its first bytes, or null.
export function imageType(b) {
  if (!b || b.length < 4) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x00 && b[1] === 0x00 && (b[2] === 0x01 || b[2] === 0x02) && b[3] === 0x00) return 'image/x-icon';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString('ascii', 0, 6))) return 'image/gif';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// <link rel="… icon …" href="…"> in a page, best first: apple-touch-icon
// (large, usually PNG), then icons with the biggest declared size.
export function iconLinks(html, base) {
  const out = [];
  for (const m of String(html || '').slice(0, 200_000).matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (/\brel\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1] || '';
    const href = (/\bhref\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1];
    if (!href || !/(^|\s)(icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/i.test(rel)) continue;
    if (/\.svg(\?|#|$)/i.test(href) || /image\/svg/i.test(tag)) continue;
    let url;
    try { url = new URL(href.replace(/&amp;/g, '&'), base).href; } catch { continue; }
    const size = Number((/\bsizes\s*=\s*["'](\d+)x\d+/i.exec(tag) || [])[1] || 0);
    out.push({ url, score: (/apple-touch-icon/i.test(rel) ? 1000 : 0) + Math.min(size, 256) });
  }
  return out.sort((a, b) => b.score - a.score).map((x) => x.url);
}

export function createSiteIcons({ readLinkImpl = readLink, readBytesImpl = readBytes, now = () => Date.now() } = {}) {
  const cache = new Map();   // host -> { at, icon: { type, bytes } | null }
  const pending = new Map();

  async function find(host) {
    const home = 'https://' + host + '/';
    const tried = new Set();
    const page = await readLinkImpl(home, { withHtml: true, maxChars: 100 });
    const candidates = [...(page.html ? iconLinks(page.html, page.url || home) : []), 'https://' + host + '/favicon.ico'];
    for (const url of candidates.slice(0, 4)) {
      if (tried.has(url)) continue;
      tried.add(url);
      const got = await readBytesImpl(url, { maxBytes: 100_000 });
      if (got.error) continue;
      const type = imageType(got.bytes);
      if (type) return { type, bytes: got.bytes };
    }
    return null;
  }

  // host -> { type, bytes } or null. Misses are remembered for an hour.
  async function icon(rawHost) {
    const host = validHost(rawHost);
    if (!host) return null;
    const hit = cache.get(host);
    if (hit && now() - hit.at < (hit.icon ? DAY : MISS)) return hit.icon;
    if (pending.has(host)) return pending.get(host);
    const job = find(host).catch(() => null).then((found) => {
      pending.delete(host);
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
      cache.set(host, { at: now(), icon: found });
      return found;
    });
    pending.set(host, job);
    return job;
  }

  return { icon, cached: (host) => cache.has(validHost(host) || '') };
}
