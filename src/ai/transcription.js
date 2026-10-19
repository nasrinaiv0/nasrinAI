import { HttpError } from '../http/errors.js';

export const MAX_TRANSCRIPTION_BYTES = 4 * 1024 * 1024;
const ALLOWED_EXT = /\.(?:mp3|mpga|m4a|mp4|mpeg|mpg|mp2|wav|webm|ogg|oga|flac)$/i;
const MIME_BY_EXTENSION = Object.freeze({ mp3: 'audio/mpeg', mpga: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', mpeg: 'audio/mpeg', mpg: 'audio/mpeg', mp2: 'audio/mpeg', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac' });
const ALLOWED_MIME = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/x-wav',
  'audio/webm', 'audio/ogg', 'audio/flac', 'audio/mpga', 'video/mp4', 'video/webm',
  'application/ogg', 'application/octet-stream'
]);

function safeName(value) {
  const name = String(value || 'recording.webm').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);
  return name || 'recording.webm';
}

export function createOpenAITranscription({ apiKey, model = 'whisper-1', fetchImpl = fetch, timeoutMs = 120_000 }) {
  return {
    available: Boolean(apiKey),
    async transcribe({ bytes, name, mime, language }) {
      if (!apiKey) throw new HttpError(503, 'transcription_unavailable', 'Audio transcription is not available right now.');
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new HttpError(400, 'audio_required', 'Choose a non-empty audio file to transcribe.');
      if (bytes.length > MAX_TRANSCRIPTION_BYTES) throw new HttpError(413, 'audio_too_large', 'For transcription, choose an audio file smaller than 4 MB. Long recordings must be split into shorter clips before uploading.');
      const filename = safeName(name);
      let contentType = String(mime || '').split(';')[0].trim().toLowerCase();
      const ext = filename.toLowerCase().split('.').pop();
      if (contentType === 'application/octet-stream' || !contentType) contentType = MIME_BY_EXTENSION[ext] || contentType;
      if (contentType === 'audio/x-m4a') contentType = 'audio/mp4';
      if (!ALLOWED_EXT.test(filename) || !ALLOWED_MIME.has(contentType)) {
        throw new HttpError(415, 'unsupported_audio_format', 'Choose an MP3, M4A, WAV, WebM, OGG or FLAC audio file.');
      }

      const form = new FormData();
      form.append('file', new Blob([bytes], { type: contentType === 'application/octet-stream' ? 'application/octet-stream' : contentType }), filename);
      form.append('model', model);
      form.append('response_format', 'json');
      // Only send a language hint when it is a valid ISO 639-1 code; otherwise
      // let the model detect the spoken language automatically.
      const languageCode = typeof language === 'string' ? language.trim().toLowerCase() : '';
      if (/^[a-z]{2}$/.test(languageCode)) form.append('language', languageCode);
      let response;
      try {
        response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + apiKey },
          body: form,
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (err) {
        if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new HttpError(504, 'transcription_timeout', 'Transcription took too long. Try a shorter recording or split it into smaller files.');
        throw new HttpError(502, 'transcription_upstream_unavailable', 'The transcription service could not be reached. Please try again.');
      }

      if (!response.ok) {
        const status = response.status;
        await response.body?.cancel?.().catch(() => {});
        if (status === 401 || status === 403) throw new HttpError(503, 'transcription_misconfigured', 'Audio transcription is temporarily unavailable.');
        if (status === 413 || status === 415 || status === 422) throw new HttpError(400, 'audio_not_supported', 'This audio file could not be transcribed. Try MP3, M4A, WAV or WebM.');
        if (status === 429) throw new HttpError(429, 'transcription_busy', 'Audio transcription is busy right now. Please wait a moment and try again.');
        throw new HttpError(502, 'transcription_failed', 'The transcription service could not finish this audio. Please try again.');
      }

      let result;
      try { result = await response.json(); } catch {
        throw new HttpError(502, 'invalid_transcription_response', 'The transcription service returned an unreadable response.');
      }
      const text = typeof result?.text === 'string' ? result.text.trim() : '';
      if (!text) throw new HttpError(422, 'empty_transcription', 'No speech was detected in this audio.');
      return { text, model, characters: text.length };
    }
  };
}
