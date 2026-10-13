import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validHost, imageType, iconLinks, createSiteIcons } from '../src/web/site-icon.js';
import { buildTestApp, serve } from './helpers.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const ICO = Buffer.from([0, 0, 1, 0, 1, 0, 16, 16]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

test('hosts, image kinds and a page’s declared icons', () => {
  assert.equal(validHost('WWW.Example.COM.'), 'www.example.com');
  for (const bad of ['localhost', '127.0.0.1', 'a', 'exa mple.com', 'example.com:8080', '../etc', 'x.local/a']) assert.equal(validHost(bad), null, bad);
  assert.equal(imageType(PNG), 'image/png');
  assert.equal(imageType(ICO), 'image/x-icon');
  assert.equal(imageType(SVG), null);   // SVG can carry scripts: never passed on
  assert.equal(imageType(Buffer.from('<html>')), null);
  const html = '<link rel="icon" href="/fav-16.png" sizes="16x16"><link rel="icon" href="/logo.svg"><link rel="apple-touch-icon" href="https://cdn.example.com/touch.png"><link rel="icon" sizes="32x32" href="/fav-32.png">';
  assert.deepEqual(iconLinks(html, 'https://example.com/'), ['https://cdn.example.com/touch.png', 'https://example.com/fav-32.png', 'https://example.com/fav-16.png']);
});

test('a site is asked once, its declared icon first, then /favicon.ico; misses are remembered', async () => {
  const asked = [];
  let pages = 0;
  const icons = createSiteIcons({
    readLinkImpl: async (url) => { pages++; return url.includes('withicon') ? { url, html: '<link rel="icon" href="/brand.png">' } : { url, html: '<p>none</p>' }; },
    readBytesImpl: async (url) => {
      asked.push(url);
      if (url === 'https://withicon.example/brand.png') return { url, type: 'image/png', bytes: PNG };
      if (url === 'https://plain.example/favicon.ico') return { url, type: 'image/x-icon', bytes: ICO };
      if (url === 'https://svgonly.example/favicon.ico') return { url, type: 'image/svg+xml', bytes: SVG };
      return { url, error: 'the site answered 404' };
    }
  });
  assert.equal((await icons.icon('withicon.example')).type, 'image/png');
  assert.equal((await icons.icon('plain.example')).type, 'image/x-icon');
  assert.equal(await icons.icon('svgonly.example'), null);
  assert.equal(await icons.icon('localhost'), null);
  const before = asked.length;
  await Promise.all([icons.icon('withicon.example'), icons.icon('withicon.example'), icons.icon('svgonly.example')]);
  assert.equal(asked.length, before, 'kept for a day (misses for an hour): no new requests');
  assert.equal(pages, 3);
});

test('GET /v1/site-icon?host=… serves only real images, safely, with no sign-in', async () => {
  const built = buildTestApp({
    iconReadLink: async (url) => ({ url, html: '<link rel="icon" href="/i.png">' }),
    iconReadBytes: async (url) => (url.startsWith('https://good.example/') ? { url, type: 'image/png', bytes: PNG } : { url, type: 'image/svg+xml', bytes: SVG })
  });
  const srv = await serve(built.app);
  try {
    const ok = await fetch(srv.url + '/v1/site-icon?host=good.example');
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/png');
    assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(ok.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    assert.match(ok.headers.get('cache-control'), /max-age=86400/);
    assert.deepEqual(Buffer.from(await ok.arrayBuffer()), PNG);
    assert.equal((await fetch(srv.url + '/v1/site-icon?host=svg.example')).status, 404);
    assert.equal((await fetch(srv.url + '/v1/site-icon?host=127.0.0.1')).status, 404);
  } finally { await srv.close(); }
});

test('the page shows real logos through our own server, with the letter as fallback', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const logo = js.slice(js.indexOf('function siteLogo('), js.indexOf('// The Sources button'));
  assert.match(logo, /img\.src = '\/v1\/site-icon\?host=' \+ encodeURIComponent\(h\);/);
  assert.match(logo, /img\.referrerPolicy = 'no-referrer';/);
  assert.match(logo, /img\.addEventListener\('error', \(\) => img\.remove\(\)/);
  assert.match(js, /siteLogo\(f, h\);/);
  assert.match(js, /siteLogo\(logo, l\.host\);/);
});
