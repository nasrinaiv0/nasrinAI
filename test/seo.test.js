import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/http/app.js';
import { createStatic } from '../src/http/static.js';
import { createClosedGateway } from '../src/gateway/index.js';
import { buildRoutes } from '../src/routes.js';
import { PUBLIC_DIR } from '../src/main.js';
import { testConfig, memoryLogger, serve } from './helpers.js';

let srv;
before(async () => {
  const gateway = createClosedGateway();
  srv = await serve(createApp({
    config: testConfig(), logger: memoryLogger(), gateway,
    routes: buildRoutes({ config: testConfig(), gateway }), serveStatic: createStatic(PUBLIC_DIR)
  }));
});
after(() => srv.close());

test('an unknown page opened in a browser gets the branded 404 page with status 404 and noindex', async () => {
  const r = await fetch(srv.url + '/no-such-page', { headers: { accept: 'text/html,application/xhtml+xml' } });
  assert.equal(r.status, 404);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.ok(r.headers.get('content-security-policy'), 'the strict page policy still applies');
  const html = await r.text();
  assert.match(html, /Page not found/);
  assert.match(html, /<meta name="robots" content="noindex">/);
});

test('other clients keep the plain 404, and API paths stay JSON', async () => {
  const plain = await fetch(srv.url + '/no-such-page', { headers: { accept: '*/*' } });
  assert.equal(plain.status, 404);
  assert.equal(await plain.text(), 'Not found');
  const api = await fetch(srv.url + '/v1/no-such-route', { headers: { accept: 'text/html' } });
  assert.equal(api.status, 404);
  assert.match(api.headers.get('content-type'), /json/);
});

test('the 404 page itself is not cached as a normal page and does not answer 304', async () => {
  const r = await fetch(srv.url + '/missing', { headers: { accept: 'text/html', 'if-none-match': '*' } });
  assert.equal(r.status, 404);
});

test('robots.txt hides private areas and points to the sitemap', async () => {
  const r = await fetch(srv.url + '/robots.txt');
  assert.equal(r.status, 200);
  const t = await r.text();
  for (const p of ['/v1/', '/chat/', '/ncc/']) assert.match(t, new RegExp('Disallow: ' + p));
  assert.match(t, /Sitemap: https:\/\/nasrinai\.com\/sitemap\.xml/);
});

test('sitemap.xml lists only public pages, as XML', async () => {
  const r = await fetch(srv.url + '/sitemap.xml');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /application\/xml/);
  const xml = await r.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, [
    'https://nasrinai.com/', 'https://nasrinai.com/faq.html',
    'https://nasrinai.com/legal.html?doc=terms', 'https://nasrinai.com/legal.html?doc=privacy'
  ]);
  for (const bad of ['/chat/', '/ncc/', '/v1/']) assert.ok(!locs.some((l) => l.includes(bad)));
});

test('public pages have a description, a canonical address and share tags', async () => {
  for (const [file, canon] of [['index.html', '/'], ['faq.html', '/faq.html'], ['legal.html', '/legal.html']]) {
    const html = await readFile(new URL('../public/' + file, import.meta.url), 'utf8');
    assert.equal((html.match(/<meta name="description"/g) || []).length, 1, file + ' has exactly one description');
    assert.ok(html.includes(`<link rel="canonical" href="https://nasrinai.com${canon}">`), file + ' canonical');
    assert.match(html, /<meta property="og:title"/);
    assert.match(html, /<meta property="og:image" content="https:\/\/nasrinai\.com\/icon-512\.png">/);
  }
  const chat = await readFile(new URL('../public/chat.html', import.meta.url), 'utf8');
  assert.match(chat, /noindex/, 'shared chat links stay out of search');
});
