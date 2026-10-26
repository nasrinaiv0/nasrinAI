import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

// Reads a web page a person shared, for the model to use. The server fetches
// it, so the rules matter (SSRF):
//   - only http(s) on ports 80/443, no credentials in the URL
//   - the address is checked at connect time (not just looked up first), so a
//     name cannot switch to a private address in between (DNS rebinding)
//   - private, loopback, link-local, metadata and other internal ranges are refused
//   - at most 3 redirects, each checked the same way
//   - 8 seconds, 1.5 MB, text-like content only
// Returns readable text, never the raw HTML.

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8000;
const TYPES = /^(text\/html|text\/plain|application\/xhtml\+xml|application\/json|text\/markdown)/i;

// Parse all valid IPv6 spellings into eight groups, including embedded IPv4.
function parseIPv6(ip) {
  let value = String(ip).toLowerCase().split('%')[0];
  const tail = value.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (tail) {
    const octets = tail.slice(2).map(Number);
    if (octets.some((n) => n > 255)) return null;
    value = tail[1] + ((octets[0] << 8) | octets[1]).toString(16) + ':' + ((octets[2] << 8) | octets[3]).toString(16);
  }
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...left, ...(halves.length === 2 ? Array(missing).fill('0') : []), ...right];
  const parsed = groups.map((part) => /^[0-9a-f]{1,4}$/.test(part) ? parseInt(part, 16) : NaN);
  return parsed.length === 8 && !parsed.some(Number.isNaN) ? parsed : null;
}

function publicIPv4(ip) {
  if (!net.isIPv4(ip)) return false;
  const [a, b, c] = ip.split('.').map(Number);
  // Reject special-use, private, loopback, link-local, shared, documentation,
  // benchmarking, multicast, and reserved IPv4 ranges.
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 192 && b === 88 && c === 99) return false; // deprecated 6to4 relay range
  if (a === 192 && b === 31 && c === 196) return false; // AS112-v4
  if (a === 192 && b === 52 && c === 193) return false; // AMT
  if (a === 192 && b === 175 && c === 48) return false; // AS112-v4
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function isPublicAddress(ip) {
  if (net.isIPv4(ip)) return publicIPv4(ip);
  if (!net.isIPv6(ip)) return false;
  const g = parseIPv6(ip);
  if (!g) return false;
  const zeros = (from, to) => g.slice(from, to).every((n) => n === 0);
  if (zeros(0, 7) && g[7] <= 1) return false; // unspecified and loopback
  if (zeros(0, 5) && g[5] === 0xffff) return publicIPv4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.')); // IPv4-mapped
  if (zeros(0, 6)) return false; // IPv4-compatible
  if (g[0] === 0x0064 && g[1] === 0xff9b && zeros(2, 6)) {
    return publicIPv4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.')); // well-known NAT64
  }
  if (g[0] === 0x0064 && g[1] === 0xff9b && g[2] === 1) return false; // local-use NAT64 (64:ff9b:1::/48)
  if (g[0] === 0x2002) return publicIPv4([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255].join('.')); // 6to4 embeds IPv4
  if (g[0] === 0x2001 && g[1] <= 0x01ff) return false; // IETF special-purpose 2001::/23
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation range
  // Permit only global-unicast IPv6 (2000::/3), excluding special forms above.
  return (g[0] & 0xe000) === 0x2000;
}

// DNS lookup that refuses non-public answers; used by the socket itself.
export function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = addrs.filter((a) => isPublicAddress(a.address));
    if (!ok.length) return cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }));
    if (options && options.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}

export function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !isPublicAddress(host)) return null;
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) return null;
  return u;
}

function get(u, accept = 'text/html,text/plain;q=0.9,*/*;q=0.1') {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, {
      method: 'GET',
      lookup: safeLookup,
      headers: { 'User-Agent': 'NasrinAI-LinkReader/1.0 (+https://nasrinai.com)', Accept: accept },
      timeout: TIMEOUT_MS
    }, (res) => resolve(res));
    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    req.end();
  });
}

// ---- Linear-time HTML scanning --------------------------------------------
// Pages come from anyone, so the cleaner must never rescan the page again and
// again when a closing tag or ">" is missing (that made one request stall the
// whole server). Everything below moves forward through the text once.
const MAX_TAG = 2000;
// ASCII-only lower-casing keeps every index the same as in the original text.
const asciiLower = (value) => value.replace(/[A-Z]+/g, (m) => m.toLowerCase());
const DROP = new Set(['script', 'style', 'noscript', 'svg', 'nav', 'footer', 'header', 'form', 'iframe', 'template', 'aside', 'dialog', 'menu']);
const BREAK_AFTER = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'section', 'article', 'main', 'blockquote']);
const isNameChar = (c) => (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45 || c === 58;

// Finds the ">" that ends a tag starting at `from`, remembering the last answer
// so a run of "<" with no ">" costs one scan in total, not one per "<".
function gtFinder(src) {
  let last = -2;
  let asked = 0;
  return (from) => {
    // Reuse the last answer only for a later (or equal) start: nothing lies
    // between the two, so it is still the first ">" at or after `from`.
    if (from >= asked && last === -1) return -1;
    if (from < asked || last < from) { last = src.indexOf('>', from); asked = from; }
    return last;
  };
}

// First <name ...>...</name> element: { open, innerStart, innerEnd, end } or null.
function firstElement(src, lower, name, gt) {
  let from = 0;
  for (;;) {
    const open = lower.indexOf('<' + name, from);
    if (open < 0) return null;
    const after = lower.charCodeAt(open + 1 + name.length);
    if (!(isNameChar(after))) {
      const openEnd = gt(open);
      if (openEnd < 0 || openEnd - open > MAX_TAG) { from = open + 1; continue; }
      const close = lower.indexOf('</' + name, openEnd);
      if (close < 0) return null;
      const closeEnd = src.indexOf('>', close);
      return { open, innerStart: openEnd + 1, innerEnd: close, end: closeEnd < 0 ? src.length : closeEnd + 1 };
    }
    from = open + 1;
  }
}

// Every <name ...> start tag, as its raw text (at most MAX_TAG long).
function* startTags(src, lower, name, gt) {
  let from = 0;
  for (;;) {
    const open = lower.indexOf('<' + name, from);
    if (open < 0) return;
    from = open + 1;
    if (isNameChar(lower.charCodeAt(open + 1 + name.length))) continue;
    const end = gt(open);
    if (end < 0) return;
    if (end - open > MAX_TAG) continue;
    yield src.slice(open, end + 1);
  }
}

// Tags and unwanted elements out, block ends turned into line breaks.
function stripHtml(src, lower, gt) {
  const out = [];
  const noClose = new Set();
  let noCommentEnd = false;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { out.push(src.slice(i)); break; }
    if (lt > i) out.push(src.slice(i, lt));
    const c = lower.charCodeAt(lt + 1);
    if (c === 33 && !noCommentEnd && lower.startsWith('<!--', lt)) { // comment
      const end = lower.indexOf('-->', lt + 4);
      if (end >= 0) { out.push(' '); i = end + 3; continue; }
      noCommentEnd = true; // never ends: later "<!--" are plain tags too
    }
    const closing = c === 47;
    const nameStart = lt + (closing ? 2 : 1);
    let nameEnd = nameStart;
    while (nameEnd < n && isNameChar(lower.charCodeAt(nameEnd))) nameEnd++;
    const letter = lower.charCodeAt(nameStart);
    const isTag = nameEnd > nameStart && letter >= 97 && letter <= 122;
    const special = c === 33 || c === 63; // <!doctype>, <?xml?>
    if (!isTag && !special) { out.push('<'); i = lt + 1; continue; } // a plain "<" in the text
    const end = gt(lt);
    if (end < 0 || end - lt > MAX_TAG) { out.push('<'); i = lt + 1; continue; }
    if (special) { out.push(' '); i = end + 1; continue; }
    const name = lower.slice(nameStart, nameEnd);
    i = end + 1;
    if (closing) { out.push(BREAK_AFTER.has(name) ? '\n' : ' '); continue; }
    if (DROP.has(name) && !noClose.has(name)) {
      const close = lower.indexOf('</' + name, i);
      if (close < 0) { noClose.add(name); out.push(' '); continue; } // never closed: keep what follows
      const closeEnd = gt(close);
      out.push(' ');
      i = closeEnd < 0 ? n : closeEnd + 1;
      continue;
    }
    if (name === 'br') out.push('\n');
    else if (name === 'li') out.push('\n- ');
    else out.push(' ');
  }
  return out.join('');
}

// HTML to readable text: drops scripts, styles, navigation chrome and tags.
export function htmlToText(html) {
  const decode = (value) => String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d{1,7});/g, (_, n) => {
      const code = Number(n);
      return Number.isSafeInteger(code) && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
  const attrs = (tag, name) => {
    const quoted = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(["\\x27])([^"\\x27]*)\\1', 'i').exec(tag);
    if (quoted) return decode(quoted[2]).trim();
    const bare = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*([^\\s>]+)', 'i').exec(tag);
    return bare ? decode(bare[1].endsWith('/') ? bare[1].slice(0, -1) : bare[1]).trim() : '';
  };
  const lower = asciiLower(html);
  const gt = gtFinder(html);
  const meta = (key) => {
    for (const tag of startTags(html, lower, 'meta', gt)) {
      const label = (attrs(tag, 'name') || attrs(tag, 'property') || attrs(tag, 'itemprop')).toLowerCase();
      if (label === key.toLowerCase()) return attrs(tag, 'content').slice(0, 500);
    }
    return '';
  };
  const titleEl = firstElement(html, lower, 'title', gt);
  const titleTag = titleEl ? [null, html.slice(titleEl.innerStart, titleEl.innerEnd)] : null;
  const pick = (...values) => values.map((v) => String(v || '').trim()).find(Boolean) || '';
  const title = decode(pick(meta('og:title'), meta('twitter:title'), titleTag?.[1])).replace(/\s+/g, ' ').trim().slice(0, 200);
  const metadata = {
    description: pick(meta('description'), meta('og:description'), meta('twitter:description')).replace(/\s+/g, ' ').slice(0, 500),
    siteName: pick(meta('og:site_name'), meta('application-name')).replace(/\s+/g, ' ').slice(0, 120),
    author: pick(meta('author'), meta('article:author'), meta('parsely-author')).replace(/\s+/g, ' ').slice(0, 160),
    publishedAt: pick(meta('article:published_time'), meta('datePublished'), meta('date'), meta('pubdate')).replace(/\s+/g, ' ').slice(0, 80),
    canonical: (() => {
      for (const tag of startTags(html, lower, 'link', gt)) {
        if (/rel\s*=\s*["'][^"']*\bcanonical\b[^"']*["']/i.test(tag)) {
          const href = attrs(tag, 'href');
          try {
            const u = new URL(href);
            if (['http:', 'https:'].includes(u.protocol) && u.hostname && !u.username && !u.password) return u.href;
          } catch {}
        }
      }
      return '';
    })()
  };
  const region = firstElement(html, lower, 'article', gt) || firstElement(html, lower, 'main', gt);
  const sourceHtml = region ? html.slice(region.open, region.end) : html;
  const body = stripHtml(sourceHtml, region ? lower.slice(region.open, region.end) : lower, region ? gtFinder(sourceHtml) : gt);
  const text = decode(body).replace(/[ \t\r\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, text, ...metadata };
}

// Text from the page's bytes in its declared character set (the Content-Type
// header first, then a <meta charset> near the top). Unknown names fall back
// to UTF-8; decoding never throws.
function decodeBody(bytes, type) {
  let label = /charset\s*=\s*["']?([\w.:-]+)/i.exec(type)?.[1] || '';
  if (!label && /html/i.test(type)) {
    const head = bytes.subarray(0, 2048).toString('latin1');
    label = /<meta[^>]{0,300}charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1] || '';
  }
  if (label && !/^utf-?8$/i.test(label)) {
    try { return new TextDecoder(label, { fatal: false }).decode(bytes); } catch { /* unknown name */ }
  }
  return bytes.toString('utf8');
}

// Resolves { url, title, text } (plus the page's `html` with withHtml) or { url, error }.
export async function readLink(raw, { maxChars = 12_000, getImpl = get, withHtml = false, allowedOrigin = null } = {}) {
  let u = checkUrl(raw);
  if (!u) return { url: raw, error: 'not a public web address' };
  try {
    for (let hop = 0; hop <= 3; hop++) {
      const res = await getImpl(u);
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = checkUrl(new URL(res.headers.location, u).href);
        if (!next) return { url: raw, error: 'redirects to a blocked address' };
        if (allowedOrigin && next.origin !== allowedOrigin) return { url: raw, error: 'redirects outside the allowed origin' };
        u = next;
        continue;
      }
      if (res.statusCode !== 200) { res.resume(); return { url: raw, error: `the site answered ${res.statusCode}` }; }
      const type = String(res.headers['content-type'] || '');
      if (!TYPES.test(type)) { res.resume(); return { url: raw, error: 'not a text page' }; }
      const chunks = []; let size = 0; let tooLarge = false;
      for await (const c of res) {
        size += c.length;
        if (size > MAX_BYTES) { tooLarge = true; res.destroy(); break; }
        chunks.push(c);
      }
      if (tooLarge) return { url: raw, error: 'the page is too large' };
      const body = decodeBody(Buffer.concat(chunks), type);
      const extracted = /html/i.test(type) ? htmlToText(body) : { title: '', text: body };
      const { title, text } = extracted;
      if (!text.trim()) return { url: raw, error: 'the page has no readable text' };
      const boundedText = text.length > maxChars ? text.slice(0, maxChars) + '\n[… the page continues]' : text;
      const metadata = /html/i.test(type) ? {
        description: String(extracted.description || '').slice(0, 500),
        siteName: String(extracted.siteName || '').slice(0, 120),
        author: String(extracted.author || '').slice(0, 160),
        publishedAt: String(extracted.publishedAt || '').slice(0, 80),
        canonical: String(extracted.canonical || '').slice(0, 1000)
      } : {};
      return { url: u.href, title, text: boundedText, ...metadata, ...(withHtml && /html/i.test(type) ? { html: body } : {}) };
    }
    return { url: raw, error: 'too many redirects' };
  } catch (err) {
    return { url: raw, error: err?.code === 'EBLOCKED' ? 'not a public web address' : err?.code === 'ETIMEDOUT' ? 'the site did not answer in time' : 'the page could not be opened' };
  }
}

// Bounded same-origin crawl for explicit scrape/crawl requests. Every candidate
// still passes checkUrl and readLink's connect-time DNS/redirect protections.
export async function crawlSite(raw, { maxPages = 5, maxCharsPerPage = 6_000, getImpl = get } = {}) {
  const limit = Math.max(1, Math.min(5, Number.isFinite(maxPages) ? Math.floor(maxPages) : 5));
  const rootResult = await readLink(raw, { maxChars: maxCharsPerPage, getImpl, withHtml: true });
  if (rootResult.error) return [rootResult];
  const html = String(rootResult.html || '');
  const root = new URL(rootResult.url);
  const rootPage = { ...rootResult };
  delete rootPage.html;
  if (!html || limit === 1) return [rootPage];

  const candidates = [];
  const seen = new Set([root.href]);
  const skipAsset = /\.(?:avif|bmp|css|csv|docx?|gif|ico|jpe?g|js|jsonl?|mp[34]|pdf|png|pptx?|svg|webp|xlsx?|zip)(?:$|[?#])/i;
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const href = String(match[1] ?? match[2] ?? match[3] ?? '')
      .replace(/&amp;/gi, '&').replace(/&#38;/gi, '&').trim();
    if (!href || href.startsWith('#')) continue;
    let candidate;
    try {
      candidate = new URL(href, root.href);
      candidate.hash = '';
    } catch { continue; }
    if (!['http:', 'https:'].includes(candidate.protocol) || candidate.origin !== root.origin) continue;
    if (skipAsset.test(candidate.pathname)) continue;
    const safe = checkUrl(candidate.href);
    if (!safe || safe.origin !== root.origin || seen.has(safe.href)) continue;
    seen.add(safe.href);
    candidates.push(safe.href);
    if (candidates.length >= limit - 1) break;
  }
  const additional = await Promise.all(candidates.map((url) => readLink(url, { maxChars: maxCharsPerPage, getImpl, allowedOrigin: root.origin })));
  return [rootPage, ...additional];
}

// A small binary file (a site's icon) with the same safety rules as pages:
// public addresses only, checked on every redirect (at most 3), a time and
// size limit. Resolves { url, type, bytes } or { url, error }.
export async function readBytes(raw, { maxBytes = 100_000, accept = 'image/*', getImpl = get } = {}) {
  let u = checkUrl(raw);
  if (!u) return { url: raw, error: 'not a public web address' };
  try {
    for (let hop = 0; hop <= 3; hop++) {
      const res = await getImpl(u, accept);
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = checkUrl(new URL(res.headers.location, u).href);
        if (!next) return { url: raw, error: 'redirects to a blocked address' };
        u = next;
        continue;
      }
      if (res.statusCode !== 200) { res.resume(); return { url: raw, error: `the site answered ${res.statusCode}` }; }
      const chunks = []; let size = 0;
      for await (const c of res) {
        size += c.length;
        if (size > maxBytes) { res.destroy(); return { url: raw, error: 'too large' }; }
        chunks.push(c);
      }
      return { url: u.href, type: String(res.headers['content-type'] || ''), bytes: Buffer.concat(chunks) };
    }
    return { url: raw, error: 'too many redirects' };
  } catch (err) {
    return { url: raw, error: err?.code === 'EBLOCKED' ? 'not a public web address' : 'could not be opened' };
  }
}

// The links in a message (at most `max`).
export function linksIn(text, max = 5) {
  const found = String(text || '').match(/https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/g) || [];
  return [...new Set(found)].slice(0, max);
}
