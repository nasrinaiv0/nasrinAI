import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';

const IMAGE_MIME_BY_EXTENSION = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif'
});
export const MAX_MULTIMODAL_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * A deterministic word-like token estimate, not a model-specific tokenizer.
 * Punctuation/symbols are separators, text is lowercased, and empty tokens
 * are discarded. Use provider-reported token usage whenever it is available.
 */
export function tokenizeText(text) {
  const normalized = String(text ?? '')
    .toLocaleLowerCase('und')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .trim();
  const tokens = normalized ? normalized.split(/\s+/u).filter(Boolean) : [];
  return { tokens, count: tokens.length };
}

export function estimateTextTokenCount(text) {
  return tokenizeText(text).count;
}

/**
 * Read a local image and prepare a multimodal API-compatible data URL.
 * Only common raster formats are accepted; SVG/HTML and oversized files are
 * rejected. The caller remains responsible for sending the returned payload
 * only to an approved provider under its privacy and retention rules.
 */
export async function prepareImageForMultimodal(imagePath, { maxBytes = MAX_MULTIMODAL_IMAGE_BYTES } = {}) {
  if (typeof imagePath !== 'string' || !imagePath.trim()) throw new TypeError('An image file path is required.');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be a positive safe integer.');
  const extension = extname(imagePath).toLowerCase();
  const mimeType = IMAGE_MIME_BY_EXTENSION[extension];
  if (!mimeType) throw new TypeError('Unsupported image type. Use PNG, JPEG, WebP, GIF, or AVIF.');
  const info = await stat(imagePath);
  if (!info.isFile()) throw new TypeError('The image path must point to a regular file.');
  if (info.size < 1) throw new TypeError('The image file is empty.');
  if (info.size > maxBytes) throw new RangeError('The image exceeds the multimodal size limit.');
  const bytes = await readFile(imagePath);
  return {
    filename: basename(imagePath),
    mimeType,
    sizeBytes: bytes.byteLength,
    base64: bytes.toString('base64'),
    dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`
  };
}
