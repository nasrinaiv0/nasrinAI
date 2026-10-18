import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImageSearch } from '../src/web/image-search.js';

test('image search returns Commons thumbnails with source and license attribution', async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(new URL(url).hostname, 'commons.wikimedia.org');
    assert.match(options.headers.User-Agent, /NasrinAI/);
    return new Response(JSON.stringify({ query: { pages: {
      1: { title: 'File:Samal beach.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/samal.jpg/900px-samal.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Samal_beach.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'Example artist' } } }] },
      2: { title: 'File:Bad host.jpg', imageinfo: [{ thumburl: 'https://evil.example/bad.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Bad_host.jpg' }] }
    } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const result = await createImageSearch({ fetchImpl }).search('Samal Island');
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].title, 'Samal beach');
  assert.equal(result.images[0].license, 'CC BY-SA 4.0');
  assert.equal(result.images[0].artist, 'Example artist');
  assert.equal(result.images[0].source_url, 'https://commons.wikimedia.org/wiki/File:Samal_beach.jpg');
});

test('image search rejects invalid queries and handles empty results', async () => {
  let calls = 0;
  const search = createImageSearch({ fetchImpl: async () => { calls++; return new Response(JSON.stringify({}), { status: 200 }); } });
  assert.deepEqual(await search.search('  '), { images: [] });
  assert.equal(calls, 0);
  assert.deepEqual(await search.search('Samal'), { images: [] });
});

test('image search refuses an upstream failure without leaking upstream details', async () => {
  const search = createImageSearch({ fetchImpl: async () => new Response('private upstream response', { status: 503 }) });
  await assert.rejects(search.search('Samal'), /Image search unavailable/);
});
