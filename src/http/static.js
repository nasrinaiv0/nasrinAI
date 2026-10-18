import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PAGE_CSP } from './headers.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

// Serves files from one folder only. Returns false when nothing matched so the
// caller can answer 404. Paths that try to leave the folder never match.
export function createStatic(rootDir) {
  const root = path.resolve(rootDir);

  return async function serveStatic(req, res, pathname, status = 200) {
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { return false; }
    if (rel.includes('\0') || rel.includes('\\')) return false;
    if (rel === '/' || rel === '') rel = '/index.html';
    else if (rel.endsWith('/')) rel += 'index.html';   // a folder's own page, like /ncc/

    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root + path.sep)) return false;
    if (path.basename(file).startsWith('.')) return false;

    const type = TYPES[path.extname(file).toLowerCase()];
    if (!type) return false;

    let data;
    try { data = await readFile(file); } catch { return false; }

    res.statusCode = status;
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', data.length);
    // The page, its script, styles and manifest are checked on every load
    // (cheap with the ETag): a phone must never pair a new page with an old
    // app.js, or new buttons do nothing. Pictures may be kept for an hour.
    const fresh = /^(text\/html|text\/javascript|text\/css|application\/manifest)/.test(type);
    const etag = '"' + createHash('sha1').update(data).digest('base64url') + '"';
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', fresh ? 'no-cache' : 'public, max-age=3600');
    if (status === 200 && fresh && req.headers['if-none-match'] === etag) {
      if (type.startsWith('text/html')) res.setHeader('Content-Security-Policy', PAGE_CSP);
      res.statusCode = 304;
      res.removeHeader('Content-Length');
      res.removeHeader('Content-Type');
      res.end();
      return true;
    }
    if (type.startsWith('text/html')) res.setHeader('Content-Security-Policy', PAGE_CSP);
    res.end(req.method === 'HEAD' ? undefined : data);
    return true;
  };
}
