import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tokenizeText, estimateTextTokenCount, prepareImageForMultimodal } from '../src/ai/text-image.js';

test('tokenizeText lowercases, separates punctuation, and returns tokens plus count', () => {
  assert.deepEqual(tokenizeText('Hello, WORLD! Nasrin-AI 2026.'), {
    tokens: ['hello', 'world', 'nasrin', 'ai', '2026'],
    count: 5
  });
  assert.deepEqual(tokenizeText('  ...!?  '), { tokens: [], count: 0 });
  assert.equal(estimateTextTokenCount('One, two; THREE.'), 3);
});

test('prepareImageForMultimodal returns a data URL and base64 for an allowed image', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nasrinai-image-'));
  try {
    const file = join(dir, 'tiny.png');
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    await writeFile(file, bytes);
    const result = await prepareImageForMultimodal(file);
    assert.equal(result.filename, 'tiny.png');
    assert.equal(result.mimeType, 'image/png');
    assert.equal(result.sizeBytes, bytes.length);
    assert.equal(Buffer.from(result.base64, 'base64').toString('hex'), bytes.toString('hex'));
    assert.equal(result.dataUrl, 'data:image/png;base64,' + bytes.toString('base64'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('prepareImageForMultimodal rejects unsupported, empty, and oversized images', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nasrinai-image-'));
  try {
    const svg = join(dir, 'image.svg');
    await writeFile(svg, '<svg/>');
    await assert.rejects(prepareImageForMultimodal(svg), /Unsupported image type/);
    const png = join(dir, 'image.png');
    await writeFile(png, Buffer.alloc(0));
    await assert.rejects(prepareImageForMultimodal(png), /empty/);
    await writeFile(png, Buffer.alloc(8));
    await assert.rejects(prepareImageForMultimodal(png, { maxBytes: 4 }), /size limit/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
