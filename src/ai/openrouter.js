import { ProviderError } from './provider.js';
import { readToolCalls } from './tool-format.js';

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

// Only explicit per-second catalog SKUs are safe for pre-generation budgets.
// A per-job price must never be misinterpreted as a per-second rate.
function videoPricingRates(model, { resolution, generateAudio = true, hasVideoInput = false } = {}) {
  const raw = model?.pricing_skus;
  const entries = raw && typeof raw === 'object'
    ? (Array.isArray(raw) ? raw.map((sku, index) => [String(index), sku]) : Object.entries(raw))
    : [];
  return entries.flatMap(([key, sku]) => {
    const unit = String(sku?.unit || sku?.billing_unit || sku?.metric || sku?.name || sku?.id || key || '').toLowerCase();
    const labels = [unit, sku?.resolution, sku?.audio, sku?.input_type, sku?.modality, sku?.description].filter(Boolean).join(' ').toLowerCase();
    const value = typeof sku === 'object' && sku !== null
      ? (sku.cost_usd ?? sku.price_usd ?? sku.price ?? sku.cost ?? sku.rate ?? sku.amount)
      : sku;
    const rate = Number(value);
    // OpenRouter's documented video catalog uses "generate" for the default
    // per-video-second rate; more specific SKUs name the seconds basis and
    // may add audio/resolution modifiers. Never accept a job/request SKU.
    const defaultGenerateSku = key === 'generate' && (!sku || typeof sku !== 'object' ||
      (!sku.unit && !sku.billing_unit && !sku.metric));
    if ((!/(?:second|\/sec\b|per[_ -]?sec)/.test(unit) && !defaultGenerateSku) || !Number.isFinite(rate) || rate <= 0) return [];
    if (resolution && /\b(480p|720p|1080p|4k)\b/.test(labels) && !labels.includes(String(resolution).toLowerCase())) return [];
    if (/(?:with|including)[_-]?audio/.test(labels) && !generateAudio) return [];
    if (/(?:without|no)[_-]?audio/.test(labels) && generateAudio) return [];
    if (/(?:with|including)[_-]?video[_ -]?input/.test(labels) && !hasVideoInput) return [];
    if (/(?:without|no)[_-]?video[_ -]?input/.test(labels) && hasVideoInput) return [];
    if (typeof sku?.with_audio === 'boolean' && sku.with_audio !== generateAudio) return [];
    if (typeof sku?.with_video_input === 'boolean' && sku.with_video_input !== hasVideoInput) return [];
    return [{ rate, labels }];
  });
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
    let eligible = models.filter((m) => task === 'video' || task === 'decisions'
      ? typeof m.id === 'string'
      : task === 'image'
        ? typeof m.id === 'string' && (m.architecture?.output_modalities?.includes('image') || !m.architecture)
        : m.architecture?.output_modalities?.includes(modality));
    const inputModality = TASK_INPUT[task];
    if (inputModality) eligible = eligible.filter((m) => Array.isArray(m.architecture?.input_modalities) && m.architecture.input_modalities.includes(inputModality));
    if (requirements.minContextTokens) eligible = eligible.filter((m) => Number(m.context_length || 0) >= requirements.minContextTokens);
    if (requirements.requiresTools) eligible = eligible.filter((m) => Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools'));
    if (requirements.maxPromptUsdPerMillion != null) eligible = eligible.filter((m) => Number(m.pricing?.prompt) * 1_000_000 <= requirements.maxPromptUsdPerMillion);
    const validateRequirements = (match) => {
      if (task === 'image') {
        const params = match.supported_parameters || {};
        const supportsEnum = (name, value) => {
          const values = params[name]?.values;
          if (!Array.isArray(values) || !values.includes(value)) throw new ProviderError('config', `OpenRouter image model does not advertise the requested ${name}`);
        };
        if (requirements.quality) supportsEnum('quality', requirements.quality);
        if (requirements.aspectRatio) supportsEnum('aspect_ratio', requirements.aspectRatio);
        if (requirements.inputReferences > 0) {
          const max = Number(params.input_references?.max ?? params.input_references?.maximum ?? 0);
          if (!Number.isFinite(max) || max < requirements.inputReferences) throw new ProviderError('config', 'OpenRouter image model does not advertise support for the requested reference-image count');
        }
      }
      if (task === 'video') {
        const list = (key) => Array.isArray(match[key]) ? match[key] : null;
        const duration = requirements.duration;
        const resolution = requirements.resolution;
        const aspectRatio = requirements.aspectRatio;
        if (duration != null && (!list('supported_durations') || !list('supported_durations').some((value) => Number(value) === Number(duration)))) throw new ProviderError('config', 'Configured OpenRouter video model does not advertise the requested duration');
        if (resolution && (!list('supported_resolutions') || !list('supported_resolutions').includes(resolution))) throw new ProviderError('config', 'Configured OpenRouter video model does not advertise the requested resolution');
        if (aspectRatio && (!list('supported_aspect_ratios') || !list('supported_aspect_ratios').includes(aspectRatio))) throw new ProviderError('config', 'Configured OpenRouter video model does not advertise the requested aspect ratio');
        if (requirements.generateAudio === true && match.generate_audio !== true && match.supports_audio_generation !== true) throw new ProviderError('config', 'Configured OpenRouter video model does not advertise generated audio support');
        if (requirements.requirePrice === true) {
          const prices = videoPricingRates(match, requirements);
          if (!prices.length) throw new ProviderError('config', 'OpenRouter video model has no verifiable published per-second generation price');
          const conservativeCatalogRate = Math.max(...prices.map((entry) => entry.rate));
          if (requirements.maxCostPerSecondUsd != null && (!Number.isFinite(Number(requirements.maxCostPerSecondUsd)) || Number(requirements.maxCostPerSecondUsd) < conservativeCatalogRate)) {
            throw new ProviderError('config', 'Configured OpenRouter video cost estimate is below the live catalog rate');
          }
        }
      }
      return match;
    };
    for (const id of preferred) {
      const safeId = cleanModelId(id);
      const match = eligible.find((m) => m.id === safeId);
      if (match) return validateRequirements(match);
    }
    if (preferred.length) throw new ProviderError('config', `Configured OpenRouter model is unavailable or lacks the required capability for task: ${task}`);
    // Discover video models only after checking duration, resolution, aspect
    // ratio, audio support, and an explicit per-second price. Max prefers the
    // least expensive eligible model; Ultra prefers the highest-priced one as
    // a fallback heuristic. Price alone is not a quality guarantee.
    if (task === 'video') {
      const tier = requirements.tier === 'ultra' ? 'ultra' : 'max';
      const priced = eligible.flatMap((candidate) => {
        try {
          validateRequirements(candidate);
          const rates = videoPricingRates(candidate, requirements);
          if (!rates.length) return [];
          return [{ candidate, rate: Math.max(...rates.map((entry) => entry.rate)) }];
        } catch { return []; }
      });
      priced.sort((a, b) => (tier === 'ultra' ? b.rate - a.rate : a.rate - b.rate) || a.candidate.id.localeCompare(b.candidate.id));
      if (priced.length) return priced[0].candidate;
      throw new ProviderError('config', 'No OpenRouter video model advertises the requested duration, resolution, aspect ratio, audio support, and a verifiable per-second price');
    }
    // Never silently choose an arbitrary model for other costly generation.
    if (['image', 'video', 'rerank', 'decisions'].includes(task)) {
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
    const selected = model === 'openrouter/free' && task === 'chat' && !(Array.isArray(tools) && tools.length)
      ? { id: 'openrouter/free' }
      : await selectModel(task, model ? [cleanModelId(model)] : preferred, { requiresTools: Array.isArray(tools) && tools.length > 0, minContextTokens, maxPromptUsdPerMillion });
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

  async function generateImage({ model, preferred = [], prompt, images, signal, maxCostUsd, ...options }) {
    const selected = await selectModel('image', model ? [cleanModelId(model)] : preferred, { quality: options.quality, aspectRatio: options.aspect_ratio, inputReferences: Array.isArray(images) ? images.length : 0 });
    if (!Number.isFinite(Number(maxCostUsd)) || Number(maxCostUsd) <= 0) throw new ProviderError('config', 'A positive per-image spending ceiling is required');
    const [author, ...slugParts] = selected.id.split('/');
    const endpointCatalog = await request('/images/models/' + encodeURIComponent(author) + '/' + encodeURIComponent(slugParts.join('/')) + '/endpoints', { method: 'GET' });
    const endpoints = Array.isArray(endpointCatalog.endpoints) ? endpointCatalog.endpoints : [];
    const imagePrices = endpoints.flatMap((endpoint) => Array.isArray(endpoint.pricing) ? endpoint.pricing : [])
      .filter((entry) => entry?.billable === 'output_image' && String(entry?.unit || '').toLowerCase().includes('image'))
      .map((entry) => Number(entry.cost_usd)).filter((n) => Number.isFinite(n) && n > 0);
    if (!imagePrices.length) throw new ProviderError('config', 'OpenRouter image model has no verifiable per-image price in its live endpoint catalog');
    if (Number(maxCostUsd) < Math.max(...imagePrices)) throw new ProviderError('config', 'Configured per-image spending ceiling is below the live catalog price');
    if (Array.isArray(images) && images.length) {
      const capability = selected;
      const refLimit = capability?.supported_parameters?.input_references;
      const maxRefs = Number(refLimit?.max ?? refLimit?.maximum ?? 0);
      if (!capability || !Number.isFinite(maxRefs) || maxRefs < 1) throw new ProviderError('config', 'Selected image model does not advertise image-reference editing support');
      if (images.length > Math.min(16, maxRefs)) throw new ProviderError('config', 'Too many reference images for the selected OpenRouter model');
      const refs = images;
      if (refs.some((item) => typeof item !== 'string' || (!item.startsWith('https://') && !/^data:image\/(png|jpeg|webp);base64,/.test(item)))) throw new ProviderError('config', 'Image references must be HTTPS URLs or supported image data URLs');
      options.input_references = refs.map((image_url) => ({ image_url }));
    }
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) throw new ProviderError('config', 'Image prompt must be 1–8000 characters');
    const body = { ...options, model: selected.id, prompt: prompt.trim() };
    return request('/images', { body, signal });
  }

  async function getVideoPricing({ model, tier = 'max', resolution, duration, aspectRatio, generateAudio = true, hasVideoInput = false } = {}) {
    const requirements = { tier, resolution, duration, aspectRatio, generateAudio, hasVideoInput, requirePrice: true };
    const selected = await selectModel('video', model ? [cleanModelId(model)] : [], requirements);
    const rates = videoPricingRates(selected, requirements).map((entry) => entry.rate);
    if (!rates.length) throw new ProviderError('config', 'OpenRouter video price lookup failed; generation is paused for safety');
    return Object.freeze({ model: selected.id, resolution: resolution || null, costPerSecondUsd: Math.max(...rates), source: 'openrouter-live-catalog' });
  }

  async function createVideo({ model, preferred = [], tier = 'max', prompt, signal, maxCostPerSecondUsd, ...options }) {
    const selected = await selectModel('video', model ? [cleanModelId(model)] : preferred, {
      tier, duration: options.duration, resolution: options.resolution, aspectRatio: options.aspect_ratio,
      generateAudio: options.generate_audio === true, requirePrice: true, maxCostPerSecondUsd
    });
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

  async function speak({ model, preferred = [], input, voice = 'alloy', responseFormat = 'mp3', provider = '', signal }) {
    const selected = await selectModel('speech', model ? [cleanModelId(model)] : preferred);
    if (typeof input !== 'string' || !input.trim() || input.length > 20_000) throw new ProviderError('config', 'Speech text must be 1–20000 characters');
    if (!/^(alloy|ash|ballad|coral|echo|fable|nova|onyx|sage|shimmer|verse|marin|cedar|Aoede|Charon|Fenrir|Kore|Leda|Orus|Puck|Zephyr)$/i.test(voice)) throw new ProviderError('config', 'Invalid speech voice');
    if (!['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'].includes(responseFormat)) throw new ProviderError('config', 'Invalid speech output format');
    const routing = provider ? { provider: { order: [provider], only: [provider], allow_fallbacks: false } } : {};
    return request('/audio/speech', { body: { model: selected.id, input, voice, response_format: responseFormat, ...routing }, raw: true, signal });
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

  return Object.freeze({ listModels, selectModel, chat, decide, generateImage, createVideo, getVideoPricing, videoStatus, videoContent, speak, transcribe, embeddings });
}

export const OPENROUTER_TASK_ENDPOINTS = ENDPOINT;
export const OPENROUTER_TASK_MODALITIES = TASK_OUTPUT;
export const OPENROUTER_TASK_INPUT_MODALITIES = TASK_INPUT;


// Adapter for NasrinAI's existing video job lifecycle. OpenRouter video jobs
// are single-shot: do not pretend that provider-side extension is supported.
// The caller must enforce maxSeconds and use its existing spend reservation.
export function createOpenRouterVideoProvider({ client, model = null, tier = 'max', maxSeconds = 8, resolution = '720p', allow4kAddon = false }) {
  if (!client || typeof client.createVideo !== 'function' || typeof client.getVideoPricing !== 'function') throw new ProviderError('config', 'OpenRouter video client with live pricing lookup is required');
  const safeMax = Math.max(1, Math.min(8, Number(maxSeconds) || 8));
  let resolvedModel = model;
  return {
    id: 'openrouter', get model() { return resolvedModel; }, tier, maxSeconds: safeMax, resolution, allow4kAddon: allow4kAddon === true, costPerSecondUsd: null,
    async getCostPerSecondUsd({ generateAudio = true, hasVideoInput = false, duration = safeMax, aspectRatio = '16:9', requestedResolution = resolution } = {}) {
      const pricing = await client.getVideoPricing({ model: resolvedModel || model, tier, resolution: requestedResolution, duration, aspectRatio, generateAudio, hasVideoInput });
      resolvedModel = pricing.model;
      return pricing.costPerSecondUsd;
    },
    async create({ prompt, aspectRatio, seconds = safeMax, generateAudio = true, hasVideoInput = false, requestedResolution = resolution }) {
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > safeMax) throw new ProviderError('config', 'Requested duration exceeds the verified OpenRouter video model limit');
      const pricing = await client.getVideoPricing({ model: resolvedModel || model, tier, resolution: requestedResolution, duration: Math.floor(seconds), aspectRatio, generateAudio, hasVideoInput });
      resolvedModel = pricing.model;
      const result = await client.createVideo({ model: pricing.model, tier, prompt, duration: Math.floor(seconds), aspect_ratio: aspectRatio, resolution: requestedResolution, generate_audio: generateAudio, maxCostPerSecondUsd: pricing.costPerSecondUsd });
      const id = result?.id || result?.job_id || result?.data?.id;
      if (typeof id !== 'string' || !/^[-a-zA-Z0-9_]{1,160}$/.test(id)) throw new ProviderError('unavailable', 'OpenRouter returned an invalid video job ID');
      return id;
    },
    async status(id) { return client.videoStatus(id); },
    extract(result) {
      const state = String(result?.status || result?.data?.status || '').toLowerCase();
      const failed = ['failed', 'error', 'cancelled', 'canceled', 'expired'].includes(state);
      const done = ['completed', 'complete', 'succeeded', 'success', 'ready'].includes(state);
      const rawCost = result?.usage?.cost ?? result?.data?.usage?.cost;
      const actualCostUsd = rawCost !== undefined && rawCost !== null && Number.isFinite(Number(rawCost)) && Number(rawCost) >= 0 && Number(rawCost) <= 100000
        ? Number(rawCost) : null;
      return {
        done, failed, uri: done ? (result?.id || result?.job_id || result?.data?.id) : null,
        actualCostUsd,
        error: failed ? String(result?.error?.message || result?.message || 'Video generation failed').slice(0, 240) : null
      };
    },
    async download(id) { return client.videoContent(id); },
    async extend() { throw new ProviderError('config', 'OpenRouter video extension is not supported; request a single clip within the model duration limit'); }
  };
}


// Text-provider adapter for NasrinAI's policy/router contract. Exact model IDs
// are capability-checked against OpenRouter's live catalog; the free pseudo
// model is delegated to the existing OpenAI-compatible adapter and is kept
// emergency-only by config.js.
export function createOpenRouterProvider({ apiKey, model = 'openrouter/free', fallbackProvider = null, client = null }) {
  const openrouter = client || createOpenRouterClient({ apiKey });
  const supportedTasks = new Set(['chat', 'research', 'coding', 'debugging', 'scraping', 'generation', 'rendering', 'extraction', 'editing', 'analysis']);
  const normalizeTask = (task) => task === 'debugging' ? 'coding' : supportedTasks.has(task) ? task : 'chat';
  return {
    id: 'openrouter',
    model,
    capabilities() {
      return { local: false, dataLeavesServer: true, vision: false, pdf: false, tools: true, trainsOnData: false };
    },
    async listModels() {
      const models = await openrouter.listModels();
      return [...new Set([...models.filter((m) => m.architecture?.output_modalities?.includes('text')).map((m) => m.id), ...(fallbackProvider ? ['openrouter/free'] : [])])];
    },
    async healthCheck() {
      try { return (await openrouter.listModels()).length > 0; } catch { return false; }
    },
    async generate({ system = '', messages = [], model: requestedModel = model, task = 'chat', tools = [], maxTokens = 2048, signal, attachments = [] }) {
      if (Array.isArray(attachments) && attachments.length) throw new ProviderError('config', 'OpenRouter text route does not accept attachments; choose a verified vision or file-capable route');
      if (requestedModel === 'openrouter/free' && fallbackProvider) {
        if (normalizeTask(task) !== 'chat' || tools.length) throw new ProviderError('config', 'OpenRouter free routing cannot guarantee task-specific capabilities or tool support');
        if (attachments.length) throw new ProviderError('config', 'OpenRouter free routing does not accept attachments');
      }
      if (task === 'decisions') throw new ProviderError('config', 'Structured decisions require the dedicated decide({state, questions}) API');
      const result = await openrouter.chat({
        task: normalizeTask(task), model: requestedModel,
        messages: [{ role: 'system', content: system }, ...messages],
        tools, maxTokens, signal,
        provider: { data_collection: 'deny', allow_fallbacks: true }
      });
      const choice = result.choices?.[0];
      const message = choice?.message;
      if (!message || (typeof message.content !== 'string' && !Array.isArray(message.tool_calls))) {
        throw new ProviderError('unavailable', 'OpenRouter returned an invalid chat completion');
      }
      return {
        text: typeof message.content === 'string' ? message.content : '',
        toolCalls: tools.length ? readToolCalls(message) : [],
        inputTokens: Number(result.usage?.prompt_tokens) || 0,
        cachedTokens: Number(result.usage?.prompt_tokens_details?.cached_tokens) || 0,
        outputTokens: Number(result.usage?.completion_tokens) || 0,
        finishReason: choice.finish_reason || 'unknown',
        model: result.model || requestedModel
      };
    }
  };
}
