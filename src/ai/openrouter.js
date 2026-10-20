import { ProviderError } from './provider.js';

const BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/i;
const TASK_OUTPUT = Object.freeze({
  chat: 'text', research: 'text', coding: 'text', scraping: 'text',
  extraction: 'text', editing: 'text', decisions: 'decisions',
  image: 'image', video: 'video', speech: 'speech',
  transcription: 'transcription', audio: 'audio', embeddings: 'embeddings', rerank: 'rerank'
});
const ENDPOINT = Object.freeze({
  chat: '/chat/completions', research: '/chat/completions', coding: '/chat/completions',
  scraping: '/chat/completions', extraction: '/chat/completions', editing: '/chat/completions',
  decisions: '/chat/completions', image: '/images', video: '/videos',
  speech: '/audio/speech', transcription: '/audio/transcriptions',
  audio: '/chat/completions', embeddings: '/embeddings', rerank: '/rerank'
});

function cleanModelId(id) {
  if (typeof id !== 'string' || !MODEL_ID.test(id) || id.length > 180 || /(?:\.\.|\/\/)/.test(id)) {
    throw new ProviderError('config', 'OpenRouter model ID is invalid');
  }
  return id;
}
function asJsonOrText(text) {
  try { return JSON.parse(text); } catch { return text.slice(0, 500); }
}
function responseError(status, detail) {
  const kind = status === 401 || status === 403 || status === 404 ? 'config'
    : status === 402 || status === 429 ? 'busy'
      : status >= 500 ? 'unavailable' : 'config';
  return new ProviderError(kind, `OpenRouter returned HTTP ${status}: ${String(detail || '').slice(0, 180)}`, status);
}

/**
 * OpenRouter modality client.
 * Models are chosen only from live capability metadata or explicit, validated IDs.
 * Callers must still enforce caller authorization, plan limits and spend reservations.
 */
export function createOpenRouterClient({
  apiKey, fetchImpl = fetch, baseUrl = BASE_URL, timeoutMs = 60_000,
  maxResponseBytes = 25 * 1024 * 1024, now = () => Date.now(), cacheMs = 5 * 60_000
}) {
  if (!apiKey) throw new ProviderError('config', 'OpenRouter API key is not configured');
  const root = new URL(baseUrl);
  if (root.protocol !== 'https:' || root.hostname !== 'openrouter.ai' || root.pathname !== '/api/v1') {
    throw new ProviderError('config', 'OpenRouter base URL must be the official HTTPS API endpoint');
  }
  let modelCache = null;

  async function request(path, { method = 'POST', body, headers = {}, signal, raw = false } = {}) {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) throw new ProviderError('config', 'Invalid OpenRouter endpoint');
    const url = new URL(path, root);
    if (url.origin !== root.origin) throw new ProviderError('config', 'OpenRouter endpoint origin mismatch');
    let response;
    try {
      response = await fetchImpl(url, {
        method, headers: { Authorization: `Bearer ${apiKey}`, Accept: raw ? '*/*' : 'application/json',
          ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: body instanceof FormData || typeof body === 'string' ? body : JSON.stringify(body) }),
        signal: signal || AbortSignal.timeout(timeoutMs), redirect: 'error'
      });
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(err?.name === 'TimeoutError' ? 'timeout' : 'unavailable', 'OpenRouter request failed');
    }
    if (!response.ok) throw responseError(response.status, await response.text().catch(() => ''));
    if (raw) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > maxResponseBytes) throw new ProviderError('config', 'OpenRouter response exceeded the configured size limit');
      return bytes;
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > maxResponseBytes) throw new ProviderError('config', 'OpenRouter response exceeded the configured size limit');
    const parsed = asJsonOrText(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ProviderError('unavailable', 'OpenRouter returned an invalid response');
    return parsed;
  }

  async function listModels({ refresh = false } = {}) {
    if (!refresh && modelCache && now() - modelCache.at < cacheMs) return modelCache.data;
    const result = await request('/models', { method: 'GET' });
    if (!Array.isArray(result.data)) throw new ProviderError('unavailable', 'OpenRouter model catalog response is invalid');
    modelCache = { at: now(), data: result.data.filter((m) => typeof m.id === 'string' && m.architecture && Array.isArray(m.architecture.output_modalities)) };
    return modelCache.data;
  }

  async function selectModel(task, preferred = []) {
    const modality = TASK_OUTPUT[task];
    if (!modality) throw new ProviderError('config', 'Unsupported OpenRouter task');
    const models = await listModels();
    const eligible = models.filter((m) => m.architecture.output_modalities.includes(modality));
    for (const id of preferred) {
      const safeId = cleanModelId(id);
      const match = eligible.find((m) => m.id === safeId);
      if (match) return match;
    }
    // Never silently choose an arbitrary model for costly generation.
    if (['image', 'video', 'speech', 'transcription', 'embeddings', 'rerank', 'decisions'].includes(task)) {
      throw new ProviderError('config', `No verified OpenRouter model is configured for task: ${task}`);
    }
    const affordable = eligible.filter((m) => Number.isFinite(Number(m.pricing?.prompt)) && Number.isFinite(Number(m.pricing?.completion)));
    affordable.sort((a, b) => Number(a.pricing.prompt) + Number(a.pricing.completion) - Number(b.pricing.prompt) - Number(b.pricing.completion));
    if (!affordable.length) throw new ProviderError('config', `No priced OpenRouter model is available for task: ${task}`);
    return affordable[0];
  }

  async function chat({ task = 'chat', model, preferred = [], messages, tools, maxTokens = 2048, temperature, provider = {}, signal }) {
    if (!Array.isArray(messages) || messages.length === 0) throw new ProviderError('config', 'Chat messages are required');
    const selected = model ? { id: cleanModelId(model) } : await selectModel(task, preferred);
    const payload = { model: selected.id, messages, max_tokens: Math.max(1, Math.min(32768, Math.floor(maxTokens))),
      provider: { data_collection: 'deny', allow_fallbacks: true, ...provider } };
    if (Array.isArray(tools) && tools.length) payload.tools = tools;
    if (Number.isFinite(temperature)) payload.temperature = Math.max(0, Math.min(2, temperature));
    return request(ENDPOINT[task] || ENDPOINT.chat, { body: payload, signal });
  }

  async function generateImage({ model, preferred = [], prompt, images, signal, ...options }) {
    const selected = model ? { id: cleanModelId(model) } : await selectModel('image', preferred);
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) throw new ProviderError('config', 'Image prompt must be 1–8000 characters');
    const body = { model: selected.id, prompt: prompt.trim(), ...options };
    if (Array.isArray(images) && images.length) body.images = images;
    return request('/images', { body, signal });
  }

  async function createVideo({ model, preferred = [], prompt, signal, ...options }) {
    const selected = model ? { id: cleanModelId(model) } : await selectModel('video', preferred);
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) throw new ProviderError('config', 'Video prompt must be 1–8000 characters');
    const body = { model: selected.id, prompt: prompt.trim(), ...options };
    return request('/videos', { body, signal });
  }
  async function videoStatus(id, signal) {
    if (typeof id !== 'string' || !/^[-a-zA-Z0-9_]{1,160}$/.test(id)) throw new ProviderError('config', 'Invalid video job ID');
    return request('/videos/' + encodeURIComponent(id), { method: 'GET', signal });
  }
  async function videoContent(id, index = 0, signal) {
    if (typeof id !== 'string' || !/^[-a-zA-Z0-9_]{1,160}$/.test(id) || !Number.isInteger(index) || index < 0 || index > 20) {
      throw new ProviderError('config', 'Invalid video content request');
    }
    return request('/videos/' + encodeURIComponent(id) + '/content?index=' + index, { method: 'GET', raw: true, signal });
  }

  async function speak({ model, preferred = [], input, voice = 'alloy', responseFormat = 'mp3', signal }) {
    const selected = model ? { id: cleanModelId(model) } : await selectModel('speech', preferred);
    if (typeof input !== 'string' || !input.trim() || input.length > 20_000) throw new ProviderError('config', 'Speech text must be 1–20000 characters');
    if (!/^(alloy|ash|ballad|coral|echo|fable|nova|onyx|sage|shimmer|verse|marin|cedar|[w-]{1,60})$/.test(voice)) throw new ProviderError('config', 'Invalid speech voice');
    if (!['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'].includes(responseFormat)) throw new ProviderError('config', 'Invalid speech output format');
    return request('/audio/speech', { body: { model: selected.id, input, voice, response_format: responseFormat }, raw: true, signal });
  }

  async function transcribe({ model, preferred = [], file, filename = 'audio.wav', language, signal }) {
    const selected = model ? { id: cleanModelId(model) } : await selectModel('transcription', preferred);
    if (!(file instanceof Uint8Array) || !file.byteLength || file.byteLength > 25 * 1024 * 1024) throw new ProviderError('config', 'Audio file is empty or exceeds 25 MB');
    if (!/^[a-zA-Z0-9._ -]{1,120}$/.test(filename)) throw new ProviderError('config', 'Invalid audio filename');
    const form = new FormData();
    form.set('model', selected.id);
    form.set('file', new Blob([file]), filename);
    if (typeof language === 'string' && /^[a-z]{2,3}(-[A-Z]{2})?$/.test(language)) form.set('language', language);
    return request('/audio/transcriptions', { body: form, signal });
  }

  async function embeddings({ model, preferred = [], input, signal }) {
    const selected = model ? { id: cleanModelId(model) } : await selectModel('embeddings', preferred);
    if (!(typeof input === 'string' && input.length > 0) && !(Array.isArray(input) && input.length > 0)) throw new ProviderError('config', 'Embedding input is required');
    return request('/embeddings', { body: { model: selected.id, input }, signal });
  }

  return Object.freeze({ listModels, selectModel, chat, generateImage, createVideo, videoStatus, videoContent, speak, transcribe, embeddings });
}

export const OPENROUTER_TASK_ENDPOINTS = ENDPOINT;
export const OPENROUTER_TASK_MODALITIES = TASK_OUTPUT;
