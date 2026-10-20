import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encryptionKey() {
  const raw = String(process.env.ELEVENLABS_CREDENTIALS_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new Error('ElevenLabs credential encryption is not configured');
  let key;
  if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else { try { key = Buffer.from(raw, 'base64'); } catch { key = null; } }
  if (!key || key.length !== 32) throw new Error('ElevenLabs credential encryption key must be 32 bytes');
  return key;
}

export function encryptElevenLabsCredential(plaintext) {
  if (typeof plaintext !== 'string' || !/^sk_[A-Za-z0-9_-]{20,}$/.test(plaintext)) throw new Error('Enter a valid ElevenLabs API key');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

export function decryptElevenLabsCredential(record) {
  if (!record || typeof record.ciphertext !== 'string' || typeof record.iv !== 'string' || typeof record.tag !== 'string') throw new Error('Stored ElevenLabs credential is invalid');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([decipher.update(B¶»§q«^