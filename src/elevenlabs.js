import { HttpError } from './http/errors.js';

const API_ORIGIN = 'https://api.elevenlabs.io';
const DEFAULT_MODEL = 'eleven_multilingual_v2';
const SUPPORTED_MODELS = new Set([DEFAULT_MODEL, 'eleven_turbo_v2_5', 'eleven_flash_v2_5', 'eleven_v3']);
const MAX_SCRIPT_CHARS = 5_000;
const MAX_EFFECT_PROMPT_CHARS = 500;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const VOICE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const MODEL_ID = /^[A-Za-z0-9._-]{1,100}$/;

export function createElevenLabs({ apiKey = '', fetchImpl = globalThis.fetch, timeoutMs = 60_000 } = {}) {
  const key = String(apiKey || '').trim();
  const available = Boolean(key);

  async function request(path, { method = 'GET', body, audio = false } = {}) {
    if (!available) throw new HttpError(503, 'elevenlabs_not_configured', 'Video Studio audio tools are not configured yet.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(API_ORIGIN + path, {
        method,
        headers: { 'xi-api-key': key, accept: audio ? 'audio/mpeg' : 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal
      });
      if (!response.ok) {
        const status = response.status;
        if (status === 401 || status === 403) throw new HttpError(502, 'elevenlabs_auth_failed', 'The Video Studio audio connection was¶»§q«^