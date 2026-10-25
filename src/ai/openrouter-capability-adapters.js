import { ProviderError } from './provider.js';

const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/i;
const MAX_ITEMS = 128;
const MAX_TEXT = 100_000;

function requireModel(model) {
  if (typeof model !== 'string' || !MODEL_ID.test(model) || model.length > 180 || /(?:\.\.|\/\/)/.test(model)) {
    throw new ProviderError('config', 'A valid provider-qualified OpenRouter model ID is required');
  }
  return model;
}
function requireClient(client, method) {
  if (!client || typeof client[method] !== 'function') throw new ProviderError('config', `OpenRouter client does not support ${method}`);
}
function mimeFor(format) {
  return ({ mp3: 'audio/mpeg', opus: 'audio/opus', aac: 'audio/aac', flac: 'audio/flac', wav: 'audio/wav', pcm: 'audio/pcm' })[format] || 'application/octet-stream';
}
function imageBytes(payload) {
  const item = payload?.data?.[0] || payload?.images?.[0] || payload?.output?.[0];
  const encoded = item?.b64_json || item?.b64 || item?.data;
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > 40 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    // Do not fetch provider-supplied URLs here: URL fetching creates an SSRF
    // boundary and must be implemented only with a strict host allowlist.
    throw new ProviderError('unavailable', 'OpenRouter image response did not contain a supported base64 image');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new ProviderError('unavailable', 'OpenRouter image response exceeded the supported size limit');
  let mime = item?.mime_type || item?.mimeType || '';
  if (!(mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp')) {
    if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) mime = 'image/png';
    else if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = 'image/jpeg';
    else if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
    else throw new ProviderError('unavailable', 'OpenRouter image response has an unsupported image format');
  }
  return { bytes, mime };
}

/** Adapter matching the existing image-provider contract. */
export function createOpenRouterImageProvider({ client, model, preferred = [] }) {
  requireClient(client, 'generateImage');
  const selectedModel = model ? requireModel(model) : null;
  return Object.freeze({
    id: 'openrouter',
    get model() { return selectedModel || preferred[0] || 'openrouter/image-auto'; },
    async generate({ prompt, images = [], aspectRatio, quality, signal }) {
      const result = await client.generateImage({
        ...(selectedModel ? { model: selectedModel } : { preferred }),
        prompt, images,
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        ...(quality ? { quality } : {}),
        signal
      });
      return imageBytes(result);
    }
  });
}

/** Adapter matching the platform speech-provider contract. */
export function createOpenRouterSpeechProvider({ client, model, preferred = [], voice = 'alloy', responseFormat = 'wav', provider = '' }) {
  requireClient(client, 'speak');
  if (!['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'].includes(responseFormat)) throw new ProviderError('config', 'Unsupported speech output format');
  const selectedModel = model ? requireModel(model) : null;
  return Object.freeze({
    id: 'openrouter',
    get model() { return selectedModel || preferred[0] || 'openrouter/speech-auto'; },
    async generate({ text, signal, voice: requestedVoice, format } = {}) {
      const outputFormat = format || responseFormat;
      const bytes = await client.speak({
        ...(selectedModel ? { model: selectedModel } : { preferred }),
        input: text, voice: requestedVoice || voice, responseFormat: outputFormat, provider, signal
      });
      if (!(bytes instanceof Uint8Array) || bytes.byteLength < 12 || bytes.byteLength > 25 * 1024 * 1024) {
        throw new ProviderError('unavailable', 'OpenRouter returned invalid or oversized speech audio');
      }
      return { bytes: Buffer.from(bytes), mime: mimeFor(outputFormat) };
    }
  });
}

/** Adapter matching the platform transcription-provider contract. */
export function createOpenRouterTranscriptionProvider({ client, model, preferred = [] }) {
  requireClient(client, 'transcribe');
  const selectedModel = model ? requireModel(model) : null;
  return Object.freeze({
    id: 'openrouter',
    get model() { return selectedModel || preferred[0] || 'openrouter/transcription-auto'; },
    async transcribe({ bytes, file, filename = 'audio.wav', language, signal } = {}) {
      const audio = bytes ?? file;
      if (!(audio instanceof Uint8Array) || audio.byteLength < 1 || audio.byteLength > 25 * 1024 * 1024) {
        throw new ProviderError('config', 'Audio input must be a non-empty byte array up to 25 MB');
      }
      const result = await client.transcribe({
        ...(selectedModel ? { model: selectedModel } : { preferred }),
        file: audio, filename, language, signal
      });
      const text = typeof result?.text === 'string' ? result.text.trim() : '';
      if (!text || text.length > MAX_TEXT) throw new ProviderError('unavailable', 'OpenRouter transcription response did not contain valid text');
      return { text, language: typeof result.language === 'string' ? result.language : null };
    }
  });
}

/** Adapter matching the semantic-search embedding contract. */
export function createOpenRouterEmbeddingProvider({ client, model, preferred = [] }) {
  requireClient(client, 'embeddings');
  const selectedModel = model ? requireModel(model) : null;
  return Object.freeze({
    id: 'openrouter',
    get model() { return selectedModel || preferred[0] || 'openrouter/embeddings-auto'; },
    async embed(input, { signal } = {}) {
      const values = Array.isArray(input) ? input : [input];
      if (!values.length || values.length > MAX_ITEMS || values.some((value) => typeof value !== 'string' || !value.trim() || value.length > MAX_TEXT)) {
        throw new ProviderError('config', 'Embedding input must contain 1–128 non-empty text items of at most 100000 characters');
      }
      const result = await client.embeddings({
        ...(selectedModel ? { model: selectedModel } : { preferred }),
        input: Array.isArray(input) ? input : input.trim(), signal
      });
      if (!Array.isArray(result?.data) || result.data.length !== values.length) throw new ProviderError('unavailable', 'OpenRouter returned an incomplete embedding response');
      const vectors = result.data.map((item) => item?.embedding);
      if (vectors.some((vector) => !Array.isArray(vector) || vector.length < 1 || vector.length > 65536 || vector.some((n) => typeof n !== 'number' || !Number.isFinite(n)))) {
        throw new ProviderError('unavailable', 'OpenRouter returned an invalid embedding vector');
      }
      return Array.isArray(input) ? vectors : vectors[0];
    }
  });
}

/** Adapter for the structured decision endpoint; does not fall back to chat. */
export function createOpenRouterDecisionProvider({ client, model, preferred = [] }) {
  requireClient(client, 'decide');
  const selectedModel = model ? requireModel(model) : null;
  if (!selectedModel && (!Array.isArray(preferred) || preferred.length === 0)) {
    throw new ProviderError('config', 'A verified decision model must be explicitly configured');
  }
  return Object.freeze({
    id: 'openrouter',
    get model() { return selectedModel || preferred[0]; },
    decide({ state, questions, signal } = {}) {
      return client.decide({ ...(selectedModel ? { model: selectedModel } : { preferred }), state, questions, signal });
    }
  });
}

/** Adapter for the dedicated reranking endpoint. */
export function createOpenRouterRerankProvider({ client, model, preferred = [] }) {
  requireClient(client, 'rerank');
  const selectedModel = model ? requireModel(model) : null;
  return Object.freeze({
    id: 'openrouter',
    get model() { return selectedModel || preferred[0] || 'openrouter/rerank-auto'; },
    async rerank({ query, documents, topN, signal } = {}) {
      if (typeof query !== 'string' || !query.trim() || query.length > 20_000) throw new ProviderError('config', 'Rerank query is required and must be at most 20000 characters');
      if (!Array.isArray(documents) || documents.length < 1 || documents.length > MAX_ITEMS || documents.some((doc) => typeof doc !== 'string' || doc.length > MAX_TEXT)) {
        throw new ProviderError('config', 'Rerank documents must contain 1–128 text items of at most 100000 characters');
      }
      const result = await client.rerank({ ...(selectedModel ? { model: selectedModel } : { preferred }), query, documents, topN, signal });
      if (!Array.isArray(result?.results) || result.results.length > documents.length || result.results.some((item) => !Number.isInteger(item.index) || item.index < 0 || item.index >= documents.length || typeof item.relevance_score !== 'number' || !Number.isFinite(item.relevance_score))) {
        throw new ProviderError('unavailable', 'OpenRouter returned an invalid reranking response');
      }
      return result.results;
    }
  });
}
