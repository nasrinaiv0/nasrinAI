import { ProviderError } from './provider.js';

const BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/i;
const TASK_OUTPUT = Object.freeze({
  chat: 'text', research: 'text', coding: 'text', scraping: 'text', generation: 'text', rendering: 'text',
  extraction: 'text', editing: 'text', vision: 'text', pdf: 'text', audio_understanding: 'text', video_understanding: 'text', decisions: 'decisions',
  image: 'image', video: 'video', speech: 'speech',
  transcription: 'transcription', audio: 'audio', embeddings: 'embeddings', rerank: 'rerank'
});
const TASK_INPUT = Object.freeze({ vision: 'image', pdf: 'file', audio_understanding: 'audio', video_understanding: 'video' });
const ENDPOINT = Object.freeze({
  chat: '/chat/completions', research: '/chat/completions', coding: '/chat/completions', generation: '/chat/completions', rendering: '/chat/completions',
  scraping: '/chat/completions', extraction: '/chat/completions', editing: '/chat/completions', vision: '/chat/completions', pdf: '/chat/completions', audio_understanding: '/chat/completions', video_understanding: '/chat/completions',
  decisions: '/alpha/decisions', image: '/images', video: '/videos',
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
    const url = path === '/alpha/decisions' ? new URL('/api/alpha/decisions', root.origin) : new URL(root.href.replace(/\/$/, '') + path);
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
    const result = await request('/models?output_modalities=all', { method: 'GET' });
    if (!Array.isArray(result.data)) throw new ProviderError('unavailable', 'OpenRouter model catalog response is invalid');
    modelCache = { at: now(), data: result.data.filter((m) => typeof m.id === 'string' && m.architecture && Array.isArray(m.architecture.output_modalities)) };
    return modelCache.data;
  }

  async function selectModel(task, preferred = [], requirements = {}) {
    const modality = TASK_OUTPUT[task];
    if (!modality) throw new ProviderError('config', 'Unsupported OpenRouter task');
    let models;
    if (task === 'image' || task === 'video') {
      const result = await request(task === 'image' ? '/images/models' : '/videos/models', { method: 'GET' });
      if (!Array.isArray(result.data)) throw new ProviderError('unavailable', 'OpenRouter specialized model catalog response is invalid');
      models = result.data;
    } else {
      models = await listModels();
    }
    let eligible = models.filter((m) => task === 'video'
      ? typeof m.id === 'string'
      : task === 'image'
        ? typeof m.id === 'string' && (m.architecture?.output_modalities?.includes('image') || !m.architecture)
        : m.architecture?.output_modalities?.includes(modality));
    const inputModality = TASK_INPUT[task];
    if (inputModality) eligible = eligible.filter((m) => Array.isArray(m.architecture?.input_modalities) && m.architecture.input_modalities.includes(inputModality));
    if (requirements.minContextTokens) eligible = eligible.filter((m) => Number(m.context_length || 0) >= requirements.minContextTokens);
    if (requirements.requiresTools) eligible = eligible.filter((m) => Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools'));
    if (requirements.maxPromptUsdPerMillion != null) eligible = eligible.filter((m) => Number(m.pricing?.prompt) * 1_000_000 <= requirements.maxPromptUsdPerMillion);
    for (const id of preferred) {
      const safeId = cleanModelId(id);
      const match = eligible.find((m) => m.id === safeId);
      if (match) return match;
    }
    if (preferred.length) throw new ProviderError('config', `Configured OpenRouter model is unavailable or lacks the required capability for task: ${task}`);
    // Never silently choose an arbitrary model for costly generation.
    if (['image', 'video', 'rerank'].includes(task)) {
      throw new ProviderError('config', `No verified OpenRouter model is configured for task: ${task}`);
    }
    const affordable = eligible.filter((m) => Number.isFinite(Number(m.pricing?.prompt)) && Number.isFinite(Number(m.pricing?.completion)));
    affordable.sort((a, b) => Number(a.pricing.prompt) + Number(a.pricing.completion) - Number(b.pricing.prompt) - Number(b.pricing.completion));
    if (!affordable.length) throw new ProviderError('config', `No priced OpenRouter model is available for task: ${task}`);
    return affordable[0];
  }

  async function chat({ task = 'chat', model, preferred = [], messages, tools, maxTokens = 2048, temperature, minContextTokens, maxPromptUsdPerMillion, provider = {}, signal }) {
    if (task === 'decisions') throw new ProviderError('config', 'Decision models require decide({state, questions}); they do not accept chat-completion payloads');
    if (!Array.isArray(messages) || messages.length === 0) throw new ProviderError('config', 'Chat messages are required');
    const selected = await selectModel(task, model ? [cleanModelId(model)] : preferred, { requiresTools: Array.isArray(tools) && tools.length > 0, minContextTokens, maxPromptUsdPerMillion });
    const payload = { model: selected.id, messages, max_tokens: Math.max(1, Math.min(32768, Math.floor(maxTokens))),
      provider: { ...provider, data_collection: 'deny', allow_fallbacks: provider.allow_fallbacks !== false } };
    if (Array.isArray(tools) && tools.length) payload.tools = tools;
    if (Number.isFinite(temperature)) payload.temperature = Math.max(0, Math.min(2, temperature));
    return request(ENDPOINT[task] || ENDPOINT.chat, { body: payload, signal });
  }

  async function decide({ model, preferred = [], state, questions, signal }) {
    const selected = await selectModel('decisions', model ? [cleanModelId(model)] : preferred);
    if (state === undefined || state === null || (typeof state === 'string' && !state.trim())) throw new ProviderError('config', 'Decision state is required');
    if (!questions || typeof questions !== 'object' || Array.isArray(questions) || !Object.keys(questions).length || Object.keys(questions).length > 100) {
      throw new ProviderError('config', 'Decision questions must be a non-empty object with at most 100 entries');
    }
    for (const [key, question] of Object.entries(questions)) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key) || !question || typeof question !== 'object' || !['choice', 'noul', 'score', 'box'].includes(question.type)) {
        throw new ProviderError('config', 'Decision question schema is invalid');
      }
    }
    return request('/alpha/decisions', { body: { model: selected.id, state, questions }, signal });
  }

  async function generateImage({ model, preferred = [], prompt, images, signal, ...options }) {
    const selected = await selectModel('image', model ? [cleanModelId(model)] : preferred);
    if (Array.isArray(images) && images.length) {
      const catalog = await request('/images/models', { method: 'GET' });
      const capability = catalog.data?.find((m) => m.id === selected.id);
      const refLimit = capability?.supported_parameters?.input_references;
      const maxRefs = Number(refLimit?.max ?? refLimit?.maximum ?? 0);
      if (!capability || !Number.isFinite(maxRefs) || maxRefs < 1) throw new ProviderError('config', 'Selected image model does not advertise image-reference editing support');
      const refs = images.slice(0, Math.min(16, maxRefs));
      if (refs.some((item) => typeof item !== 'string' || (!item.startsWith('https://') && !/^data:image\/(png|jpeg|webp);base64,/.test(item)))) throw new ProviderError('config', 'Image references must be HTTPS URLs or supported image data URLs');
      options.input_references = refs.map((image_url) => ({ image_url }));
    }
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) throw new ProviderError('config', 'Image prompt must be 1–8000 characters');
    const body = { ...options, model: selected.id, prompt: prompt.trim() };
    return request('/images', { body, signal });
  }

  async function createVideo({ model, preferred = [], prompt, signal, ...options }) {
    const selected = await selectModel('video', model ? [cleanModelId(model)] : preferred);
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) throw new ProviderError('config', 'Video prompt must be 1–8000 characters');
    const body = { ...options, model: selected.id, prompt: prompt.trim() };
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
    const selected = await selectModel('speech', model ? [cleanModelId(model)] : preferred);
    if (typeof input !== 'string' || !input.trim() || input.length > 20_000) throw new ProviderError('config', 'Speech text must be 1–20000 characters');
    if (!/^(alloy|ash|ballad|coral|echo|fable|nova|onyx|sage|shimmer|verse|marin|cedar|[w-]{1,60})$/.test(voice)) throw new ProviderError('config', 'Invalid speech voice');
    if (!['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'].includes(responseFormat)) throw new ProviderError('config', 'Invalid speech output format');
    return request('/audio/speech', { body: { model: selected.id, input, voice, response_format: responseFormat }, raw: true, signal });
  }

  async function transcribe({ model, preferred = [], file, filename = 'audio.wav', language, signal }) {
    const selected = await selectModel('transcription', model ? [cleanModelId(model)] : preferred);
    if (!(file instanceof Uint8Array) || !file.byteLength || file.byteLength > 25 * 1024 * 1024) throw new ProviderError('config', 'Audio file is empty or exceeds 25 MB');
    if (!/^[a-zA-Z0-9._ -]{1,120}$/.test(filename)) throw new ProviderError('config', 'Invalid audio filename');
    const form = new FormData();
    form.set('model', selected.id);
    form.set('file', new Blob([file]), filename);
    if (typeof language === 'string' && /^[a-z]{2,3}(-[A-Z]{2})?$/.test(language)) form.set('language', language);
    return request('/audio/transcriptions', { body: form, signal });
  }

  async function embeddings({ model, preferred = [], input, signal }) {
    const selected = await selectModel('embeddings', model ? [cleanModelId(model)] : preferred);
    if (!(typeof input === 'string' && input.length > 0) && !(Array.isArray(input) && input.length > 0)) throw new ProviderError('config', 'Embedding input is required');
    return request('/embeddings', { body: { model: selected.id, input }, signal });
  }

  return Object.freeze({ listModels, selectModel, chat, decide, generateImage, createVideo, videoStatus, videoContent, speak, transcribe, embeddings });
}

export const OPENROUTER_TASK_ENDPOINTS = ENDPOINT;
export const OPENROUTER_TASK_MODALITIES = TASK_OUTPUT;
export const OPENROUTER_TASK_INPUT_MODALITIES = TASK_INPUT;


// Adapter for NasrinAI's existing video job lifecycle. OpenRouter video jobs
// are single-shot: do not pretend that provider-side extension is supported.
// The caller must enforce maxSeconds and use its existing spend reservation.
export function createOpenRouterVideoProvider({ client, model, maxSeconds = 8, resolution = '720p', costPerSecondUsd }) {
  if (!client || typeof client.createVideo !== 'function') throw new ProviderError('config', 'OpenRouter video client is required');
  const safeMax = Math.max(1, Math.min(8, Number(maxSeconds) || 8));
  return {
    id: 'openrouter',
    model,
    maxSeconds: safeMax,
    resolution,
    costPerSecondUsd: Number.isFinite(Number(costPerSecondUsd)) && Number(costPerSecondUsd) > 0 ? Number(costPerSecondUsd) : null,
    async create({ prompt, aspectRatio, seconds = safeMax }) {
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > safeMax) throw new ProviderError('config', 'Requested duration exceeds the verified OpenRouter video model limit');
      const result = await client.createVideo({
        model, prompt,
        duration: Math.floor(seconds),
        aspect_ratio: aspectRatio,
        resolution
      });
      const id = result?.id || result?.job_id || result?.data?.id;
      if (typeof id !== 'string' || !/^[-a-zA-Z0-9_]{1,160}$/.test(id)) throw new ProviderError('unavailable', 'OpenRouter returned an invalid video job ID');
      return id;
    },
    async status(id) { return client.videoStatus(id); },
    extract(result) {
      const state = String(result?.status || result?.data?.status || '').toLowerCase();
      const failed = ['failed', 'error', 'cancelled', 'canceled'].includes(state);
      const done = ['completed', 'complete', 'succeeded', 'success', 'ready'].includes(state);
      return { done, failed, uri: done ? (result?.id || result?.job_id || result?.data?.id) : null,
        error: failed ? String(result?.error?.message || result?.message || 'Video generation failed').slice(0, 240) : null };
    },
    async download(id) { return client.videoContent(id); },
    async extend() { throw new ProviderError('config', 'OpenRouter video extension is not supported; request a single clip within the model duration limit'); }
  };
}
