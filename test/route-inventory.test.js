import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const pub = (f) => readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');

test('home page keeps its canonical on the public origin', () => {
  assert.match(pub('index.html'), /<link rel="canonical" href="https:\/\/nasrinai\.com\/">/);
});

test('robots and sitemap keep private routes out and list only canonical public pages', () => {
  const robots = pub('robots.txt');
  for (const p of ['/v1/', '/chat/', '/ncc/']) assert.match(robots, new RegExp('Disallow: ' + p.replace(/\//g, '\\/')));
  const locs = [...pub('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 0);
  for (const l of locs) {
    assert.match(l, /^https:\/\/nasrinai\.com\//);
    assert.doesNotMatch(l, /\/(v1|chat|ncc)\/|video-studio|registry/);
  }
});

test('no source maps or debug logging are shipped in public/', () => {
  const walk = (dir) => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(dir + e.name + '/') : [dir + e.name]));
  const files = walk('../public/');
  assert.equal(files.filter((f) => f.endsWith('.map')).length, 0);
  for (const f of files.filter((f) => f.endsWith('.js'))) {
    const js = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(js, /sourceMappingURL=/, f);
    assert.doesNotMatch(js, /\bconsole\.(log|debug)\(/, f);
  }
});
