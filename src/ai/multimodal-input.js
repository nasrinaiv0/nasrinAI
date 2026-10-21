import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MIME_BY_EXTENSION = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'], ['.webp', 'image/webp'], ['.gif', 'image/gif']
]);

/**
 * Normalize text into lowercase word tokens after removing punctuation.
 * This is a word-token estimate, not a model-specific tokenizer.
 */
export function tokenizeText(value) {
  const normalized = String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = normalized ? normalized.split(' ') : [];
  return { normalized, tokens, count: tokens.length };
}

/**
 * Prepare a local raster image for a multimodal API data-URL input.
 * Rejects symlinks, path traversal outside the allowed root, unsupported
 * formats, files above the size limit, and mismatched file signatures.
 */
export async function prepareImageForMultimodalApi(filePath, { allowedRoot = process.cwd(), maxBytes = MAX_IMAGE_BYTES } = {}) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new TypeError('A local image file path is required.');
  const root = await realpath(path.resolve(allowedRoot));
  const resolved = path.resolve(root, filePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error('Image path must stay inside the allowed directory.');
  const info = await lstat(resolved);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error('Image path must point to a regular, non-symlink file.');
  if (info.size <= 0 || info.size > maxBytes) throw new Error('Image file is empty or exceeds the permitted size.');
  const ext = path.extname(resolved).toLowerCase();
  const mimeType = MIME_BY_EXTENSION.get(ext);
  if (!mimeType) throw new Error('Unsupported image format. Use JPEG, PNG, WebP, or GIF.');
  const absolutePath = await realpath(resolved);
  if (absolutePath !== resolved) throw new Error('Image path must not resolve through a symbolic link.');
  const bytes = await readFile(absolutePath);
  const valid = mimeType === 'image/jpeg'
    ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mimeType === 'image/png'
      ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mimeType === 'image/gif'
        ? bytes.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null
        : bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!valid) throw new Error('Image content does not match its declared file format.');
  return {
    type: 'image_url',
    image_url: { url: `data:${mimeType};base64,${bytes.toString('base64')}` },
    mimeType,
    byteLength: bytes.length,
    fileName: path.basename(resolved)
  };
}
