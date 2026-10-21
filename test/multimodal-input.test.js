import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { tokenizeText, prepareImageForMultimodalApi } from '../src/ai/multimodal-input.js';

test('tokenizeText removes punctuation, lowercases, and returns tokens with a count', () => {
  assert.deepEqual(tokenizeText('Hello, WORLD! It\'s NasrinAI—ready?'), {
    normalized: 'hello world it s nasrinai ready',
    tokens: ['hello', 'world', 'it', 's', 'nasrinai', 'ready'],
    count: 6
  });
  assert.deepEqual(tokenizeText('  !!!  '), { normalized: '', tokens: [], count: 0 });
});

test('prepareImageForMultimodalApi returns a multimodal data URL for a valid PNG', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nasrinai-image-'));
  try {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    await writeFile(path.join(root, 'pixel.png'), png);
    const result = await prepareImageForMultimodalApi('pixel.png', { allowedRoot: root });
    assert.equal(result.type, 'image_url');
    assert.equal(result.mimeType, 'image/png');
    assert.equal(result.byteLength, png.length);
    assert.equal(result.fileName, 'pixel.png');
    assert.equal(result.image_url.url, 'data:image/png;base64,' + png.toString('base64'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('prepareImageForMultimodalApi rejects unsupported, oversized, and out-of-root files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nasrinai-image-'));
  try {
    await writeFile(path.join(root, 'notes.txt'), 'not an image');
    await assert.rejects(prepareImageForMultimodalApi('notes.txt', { allowedRoot: root }), /Unsupported image format/);
    await assert.rejects(prepareImageForMultimodalApi('../outside.png', { allowedRoot: root }), /inside the allowed directory/);
    await writeFile(path.join(root, 'large.png'), Buffer.alloc(12, 0));
    await assert.rejects(prepareImageForMultimodalApi('large.png', { allowedRoot: root, maxBytes: 8 }), /exceeds the permitted size/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('chat usage metadata prefers provider counts and labels word-token fallbacks as estimates', async () => {
  const chat = await (await import('node:fs/promises')).readFile(new URL('../src/chat.js', import.meta.url), 'utf8');
  assert.match(chat, /source: 'provider'/);
  assert.match(chat, /source: 'estimated'/);
  assert.match(chat, /tokenizeText\(typed\)\.count/);
  assert.match(chat, /tokenizeText\(reply\)\.count/);
});
