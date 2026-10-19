import { HttpError } from './http/errors.js';

const API_ORIGIN = 'https://api.elevenlabs.io';
const DEFAULT_MODEL = 'eleven_multilingual_v2';
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
        if (status === 401 || status === 403) throw new HttpError(502, 'elevenlabs_auth_failed', 'The Video Studio audio connection was rejected. Check its server configuration.');
        if (status === 429) throw new HttpError(429, 'elevenlabs_rate_limited', 'Video Studio audio generation is temporarily rate-limited. Try again shortly.');
        if (status >= 500) throw new HttpError(502, 'elevenlabs_unavailable', 'Video Studio audio generation is temporarily unavailable.');
        throw new HttpError(502, 'elevenlabs_request_failed', 'The audio request could not be completed. Check the selected options and try again.');
      }
      if (audio) {
        const mime = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (mime && !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(mime)) {
          throw new HttpError(502, 'elevenlabs_invalid_audio', 'The audio service returned an unsupported file type.');
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw new HttpError(502, 'elevenlabs_audio_size', 'The generated audio is empty or exceeds the allowed file size.');
        return bytes;
      }
      const result = await response.json();
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new HttpError(502, 'elevenlabs_invalid_response', 'The audio service returned an invalid response.');
      return result;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error?.name === 'AbortError') throw new HttpError(504, 'elevenlabs_timeout', 'Audio generation took too long. Please try again.');
      throw new HttpError(502, 'elevenlabs_unavailable', 'Could not reach the Video Studio audio service. Please try again.');
    } finally {
      clearTimeout(timer);
    }
  }

  async function voices() {
    const data = await request('/v1/voices?page_size=100');
    if (!Array.isArray(data.voices)) throw new HttpError(502, 'elevenlabs_invalid_response', 'The audio service returned an invalid voice list.');
    return data.voices.filter(v => v && typeof v.voice_id === 'string' && VOICE_ID.test(v.voice_id) && typeof v.name === 'string')
      .map(v => ({ id: v.voice_id, name: v.name, category: typeof v.category === 'string' ? v.category : null }));
  }

  async function voiceover({ text, voiceId, modelId = DEFAULT_MODEL }) {
    const script = typeof text === 'string' ? text.trim() : '';
    if (!script || script.length > MAX_SCRIPT_CHARS) throw new HttpError(400, 'invalid_voiceover_text', 'Enter a voiceover script between 1 and 5,000 characters.');
    if (typeof voiceId !== 'string' || !VOICE_ID.test(voiceId)) throw new HttpError(400, 'invalid_voice_id', 'Choose a valid voice from the available voice list.');
    if (typeof modelId !== 'string' || !MODEL_ID.test(modelId)) throw new HttpError(400, 'invalid_model_id', 'Choose a valid audio model.');
    return request('/v1/text-to-speech/' + encodeURIComponent(voiceId) + '?output_format=mp3_44100_128', {
      method: 'POST', audio: true, body: { text: script, model_id: modelId }
    });
  }

  async function soundEffect({ prompt, durationSeconds }) {
    const description = typeof prompt === 'string' ? prompt.trim() : '';
    if (!description || description.length > MAX_EFFECT_PROMPT_CHARS) throw new HttpError(400, 'invalid_sound_effect_prompt', 'Enter a sound-effect prompt between 1 and 500 characters.');
    const duration = durationSeconds == null ? undefined : Number(durationSeconds);
    if (duration !== undefined && (!Number.isFinite(duration) || duration < 0.5 || duration > 22)) {
      throw new HttpError(400, 'invalid_sound_effect_duration', 'Sound-effect duration must be between 0.5 and 22 seconds.');
    }
    return request('/v1/sound-generation', {
      method: 'POST', audio: true,
      body: { text: description, ...(duration === undefined ? {} : { duration_seconds: duration }), prompt_influence: 0.3 }
    });
  }

  return {
    available,
    status: () => ({ configured: available, capabilities: available ? ['voices', 'voiceover', 'sound_effects'] : [] }),
    voices,
    voiceover,
    soundEffect
  };
}
