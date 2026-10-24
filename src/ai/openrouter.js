import { ProviderError } from './provider.js';
import { randomUUID } from 'node:crypto';
import { readToolCalls } from './tool-format.js';

const BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/i;
const TASK_OUTPUT = Object.freeze({
  chat: 'text', research: 'text', coding: 'text', scraping: 'text', generation: 'text', rendering: 'text',
  extraction: 'text', editing: 'text', vision: 'text', pdf: 'text', audio_understanding: 'text', video_understanding: 'text', decisions: 'decisions',
  image: 'image', video: 'video', speech: 'speech',
  transcription: 'transcription', audio: 'audio', embeddings: 'embeddings', rerank: 'text'
});
const TASK_INPUT = Object.freeze({ vision: 'image', pdf: 'file', audio_understanding: 'audio', video_understanding: 'video', transcription: 'audio' });
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
  const kind = status === 401 || status === 403 ? 'config'
    : status === 404 || status >= 500 ? 'unavailable'
      : status === 402 || status === 429 ? 'busy' : 'config';
  return new ProviderError(kind, `OpenRouter returned HTTP ${status}: ${String(detail || '').slice(0, 180)}`, status);
}

/**
 * OpenRouter modality client.
 * Models are chosen only from live capability metadata or explicit, validated IDs.
 * Callers must still enforce caller authorization, plan limits and spend reservations.
 */
export function createOpenRouterClient({
  apiKey, fetchImpl = fetch, baseUrl = BASE_URL, timeoutMs = 60_000,
  maxResponseBytes = 25 * 1024 * 1024, now = () => Date.now(), cacheMs = 5 * 60_000,
  onTelemetry = null, dataCollection = 'allow'
}) {
  if (!apiKey) throw new ProviderError('config', 'OpenRouter API key is not configured');
  // Default provider data policy for chat requests. 'allow' lets OpenRouter use
  // any provider, including free ones that log prompts; 'deny' keeps only
  // providers that do not store or train on prompts. A single request may
  // tighten this to 'deny' (private data) but can never loosen a 'deny' default.
  const defaultDataCollection = dataCollection === 'deny' ? 'deny' : 'allow';
  const root = new URL(baseUrl);
  if (root.protocol !== 'https:' || root.hostname !== 'openrouter.ai' || root.pathname !== '/api/v1') {
    throw new ProviderError('config', 'OpenRouter base URL must be the official HTTPS API endpoint');
  }
  let modelCache = null;

  // Telemetry is deliberately best-effort: never await it on the inference path.
  // The callback receives metadata summaries only, never raw prompt/response content.
  function emitTelemetry(event) {
    if (typeof onTelemetry !== 'function') return;
    Promise.resolve().then(() => onTelemetry(event)).catch(() => {});
  }

  async function request(path, { method = 'POST', body, headers = {}, signal, raw = false } = {}) {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) throw new ProviderError('config', 'Invalid OpenRouter endpoint');
    const url = path === '/alpha/decisions' ? new URL('/api/alpha/decisions', root.origin) : new URL(root.href.replace(/\/$/, '') + path);
    if (url.origin !== root.origin) throw new ProviderError('config', 'OpenRouter endpoint origin mismatch');
    const requestId = randomUUID();
    const startedAt = now();
    const requestBody = body && typeof body === 'object' && !(body instanceof FormData) && !Array.isArray(body) ? body : null;
    const requestSummary = {
      body_bytes: body === undefined ? 0 : typeof body === 'string' ? Buffer.byteLength(body) : requestBody ? Buffer.byteLength(JSON.stringify(body)) : null,
      body_keys: requestBody ? Object.keys(requestBody).slice(0, 40) : [],
      message_count: Array.isArray(requestBody?.messages) ? requestBody.messages.length : null,
      has_tools: Array.isArray(requestBody?.tools) && requestBody.tools.length > 0,
      raw_response: raw
    };
    const baseEvent = {
      requestId,
      endpoint: path.split('?')[0],
      method: String(method).toUpperCase(),
      requestedModel: typeof requestBody?.model === 'string' ? requestBody.model : null,
      requestSummary
    };
    let response;
    try {
      response = await fetchImpl(url, {
        method, headers: { Authorization: `Bearer ${apiKey}`, Accept: raw ? '*/*' : 'application/json',
          ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: body instanceof FormData || typeof body === 'string' ? body : JSON.stringify(body) }),
        signal: signal || AbortSignal.timeout(timeoutMs), redirect: 'error'
      });
    } catch (err) {
      emitTelemetry({
        ...baseEvent, status: 'error', httpStatus: null, latencyMs: now() - startedAt,
        errorCode: err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timeout_or_aborted' : 'network_error',
        responseSummary: { received: false }
      });
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(err?.name === 'TimeoutError' ? 'timeout' : 'unavailable', 'OpenRouter request failed');
    }

    const httpStatus = response.status;
    const providerRequestId = response.headers.get('x-request-id') || response.headers.get('x-openrouter-request-id');
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const errorCode = response.status === 429 ? 'rate_limited'
        : response.status === 402 ? 'payment_required'
        : response.status === 401 || response.status === 403 ? 'provider_auth'
        : response.status >= 500 ? 'provider_server_error' : 'provider_http_error';
      emitTelemetry({
        ...baseEvent, status: 'error', httpStatus, latencyMs: now() - startedAt,
        providerRequestId, errorCode,
        responseSummary: { body_received: Boolean(detail), body_bytes: Buffer.byteLength(detail) }
      });
      throw responseError(response.status, detail);
    }
    if (raw) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > maxResponseBytes) {
        emitTelemetry({ ...baseEvent, status: 'error', httpStatus, latencyMs: now() - startedAt, providerRequestId, errorCode: 'response_too_large', responseSummary: { response_bytes: bytes.length } });
        throw new ProviderError('config', 'OpenRouter response exceeded the configured size limit');
      }
      emitTelemetry({
        ...baseEvent, status: 'success', httpStatus, latencyMs: now() - startedAt,
        providerRequestId, responseSummary: { response_bytes: bytes.length, content_type: response.headers.get('content-type') || null }
      });
      return bytes;
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > maxResponseBytes) {
      emitTelemetry({ ...baseEvent, status: 'error', httpStatus, latencyMs: now() - startedAt, providerRequestId, errorCode: 'response_too_large', responseSummary: { response_bytes: Buffer.byteLength(text) } });
      throw new ProviderError('config', 'OpenRouter response exceeded the configured size limit');
    }
    const parsed = asJsonOrText(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      emitTelemetry({ ...baseEvent, status: 'error', httpStatus, latencyMs: now() - startedAt, providerRequestId, errorCode: 'invalid_response', responseSummary: { json_or_object: false, response_bytes: Buffer.byteLength(text) } });
      throw new ProviderError('unavailable', 'OpenRouter returned an invalid response');
    }
    const usage = parsed.usage || {};
    const numeric = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    emitTelemetry({
      ...baseEvent, status: 'success', httpStatus, latencyMs: now() - startedAt,
      providerRequestId, model: typeof parsed.model === 'string' ? parsed.model : baseEvent.requestedModel,
      promptTokens: numeric(usage.prompt_tokens ?? usage.input_tokens),
      completionTokens: numeric(usage.completion_tokens ?? usage.output_tokens),
      totalTokens: numeric(usage.total_tokens),
      totalCostUsd: numeric(usage.cost ?? parsed.cost ?? parsed.usage?.cost_usd),
      responseSummary: {
        response_bytes: Buffer.byteLength(text),
        response_keys: Object.keys(parsed).slice(0, 40),
        choices_count: Array.isArray(parsed.choices) ? parsed.choices.length : null,
        has_data_array: Array.isArray(parsed.data),
        usage_available: Object.keys(usage).length > 0
      }
    });
    return parsed;
  }

  async function listModels({ refresh = false } = {}) {
    if (!refresh && modelCache && now() - modelCache.at < cacheMs) return modelCache.data;
    const result = await request('/models?output_modalities=all', { method: 'GET' });
    if (!Array.isArray(result.data)) throw new ProviderError('unavailable', 'OpenRouter model catalog response is invalid');
    modelCache = { at: now(), data: result.data.filter((m) => typeof m.id === 'string' && m.architecture && Array.isArray(m.architecture.output_modalities)) };
    return modelCache.data;
  }

  // Return the live catalog for the requested capability. This is discovery only;
  // callers must still use the task-specific request method and handle provider errors.
  async function listCapabilityModels({ task = 'chat', requiresTools = false, attachments = [] } = {}) {
    const output = TASK_OUTPUT[task];
    if (!output) return [];
    let models;
    if (task === 'image' || task === 'video') {
      const result = await request(task === 'image' ? '/images/models' : '/videos/models', { method: 'GET' });
      if (!Array.isArray(result.data)) throw new ProviderError('unavailable', 'OpenRouter specialized model catalog response is invalid');
      models = result.data;
    } else {
      models = await listModels();
    }
    models = models.filter((item) => typeof item.id === 'string');
    if (task === 'image') models = models.filter((item) => {
      // The dedicated /images/models catalog is authoritative when architecture
      // metadata is absent. If metadata exists, require an explicit image output
      // modality; the mere presence of supported_parameters proves nothing.
      const modalities = item.architecture?.output_modalities;
      return Array.isArray(modalities) ? modalities.includes('image') : true;
    });
    else if (task === 'video') { /* dedicated video catalog is already task-scoped */ }
    else if (task === 'decisions') return [];
    else if (task === 'transcription') models = models.filter((item) =>
      ['text', 'transcription'].some((modality) => item.architecture?.output_modalities?.includes(modality)));
    else models = models.filter((item) => item.architecture?.output_modalities?.includes(output));
    const input = TASK_INPUT[task];
    if (input) models = models.filter((item) => item.architecture?.input_modalities?.includes(input));
    if (requiresTools) models = models.filter((item) => Array.isArray(item.supported_parameters) && item.supported_parameters.includes('tools'));
    if (Array.isArray(attachments) && attachments.some((item) => item?.kind === 'pdf')) return [];
    if (Array.isArray(attachments) && attachments.length && !['vision', 'pdf', 'audio_understanding', 'video_understanding'].includes(task)) return [];
    if (task === 'vision' && attachments.length) models = models.filter((item) => item.architecture?.input_modalities?.includes('image'));
    return [...new Set(models.map((item) => item.id))];
  }

  async function listModelsForTask(options = {}) {
    const task = options.task || 'chat';
    // The policy router consumes these IDs as text-generation fallbacks. Do not
    // leak specialized image/video/audio/embedding IDs into that chat lane.
    if (['image', 'video', 'speech', 'transcription', 'audio', 'embeddings', 'rerank', 'decisions'].includes(task)) return [];
    return listCapabilityModels(options);
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
        : (task === 'speech'
          ? (m.architecture?.output_modalities?.includes('audio') || m.architecture?.output_modalities?.includes('speech'))
          : task === 'transcription'
            ? (m.architecture?.output_modalities?.includes('text') || m.architecture?.output_modalities?.includes('transcription'))
            : m.architecture?.output_modalities?.includes(modality)));
    const inputModality = TASK_INPUT[task];
    if (inputModality) eligible = eligible.filter((m) => Array.isArray(m.architecture?.input_modalities) && m.architecture.input_modalities.includes(inputModality));
    if (requirements.minContextTokens) eligible = eligible.filter((m) => Number(m.context_length || 0) >= requirements.minContextTokens);
    if (requirements.requiresTools) eligible = eligible.filter((m) => Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools'));
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
        if (requirements.fps != null) {
          const frameRates = list('supported_frame_rates') || list('supported_fps');
          if (!frameRates || !frameRates.some((value) => Number(value) === Number(requirements.fps))) {
            throw new ProviderError('config', 'OpenRouter video model does not advertise the requested frame rate');
          }
        }
        if (duration != null && (!list('supported_durations') || !list('supported_durations').some((value) => Number(value) === Number(duration)))) throw new ProviderError('config', 'Configured OpenRouter video model does not advertise the requested duration');
        if (resolution && (!list('supported_resolutions') || !list('supported_resolutions').includes(resolution))) throw new ProviderError('config', 'Configured OpenRouter video model does not advertise the requested resolution');
        if (aspectRatio && (!list('supported_aspect_ratios') || !list('supported_aspect_ratios').includes(aspectRatio))) throw new ProviderError('config', 'Configured OpenRouter video model does not advertise the requested aspect ratio');
        if (requirements.generateAudio === true && match.generate_audio !== true && match.supports_audio_generation !== true) throw new ProviderError('config', 'Configured OpenRouter video model does not advertise generated audio support');
        
      }
      return match;
    };
    for (const id of preferred) {
      const safeId = cleanModelId(id);
      const match = eligible.find((m) => m.id === safeId);
      if (match) return validateRequirements(match);
    }
    // A named model that is retired, misspelled or lacks a required capability
    // must fail as "unavailable" so the router moves to the next configured
    // candidate. Never substitute an arbitrary catalog model for a named one.
    // Image and video keep their capability-based discovery below.
    if (preferred.length && task !== 'image' && task !== 'video') {
      throw new ProviderError('unavailable', `Requested OpenRouter model is not available for task: ${task}`);
    }
    // A configured model can be retired, inaccessible, or absent from the live
    // catalog. Continue to compatible candidates instead of aborting the request.
    // Discover video models by advertised capabilities only. Provider accounts
    // own billing; local model-price metadata is not a routing requirement.
    if (task === 'video') {
      const capable = eligible.flatMap((candidate) => {
        try { validateRequirements(candidate); return [candidate]; }
        catch { return []; }
      });
      if (capable.length) return capable[0];
      throw new ProviderError('config', 'No OpenRouter video model advertises the requested duration, resolution, aspect ratio, and audio capabilities');
    }
    // Costly generation still requires live task-specific capability verification.
    // Never pick a generic text model for image/video generation.
    if (task === 'image') {
      const capable = eligible.flatMap((candidate) => {
        try { validateRequirements(candidate); return [candidate]; }
        catch { return []; }
      });
      if (capable.length) return capable[0];
      throw new ProviderError('unavailable', 'No verified OpenRouter model is available for image task settings');
    }
    if (['video', 'rerank', 'decisions'].includes(task)) {
      throw new ProviderError('unavailable', `No verified OpenRouter model is available for task: ${task}`);
    }
    // Preserve the provider catalog's order after capability/privacy filtering;
    // do not infer quality or price from model names.
    if (!eligible.length) throw new ProviderError('config', `No compatible OpenRouter model is available for task: ${task}`);
    return eligible[0];
  }

  async function chat({ task = 'chat', model, preferred = [], messages, tools, maxTokens = 2048, temperature, minContextTokens, includeUsage = false, provider = {}, signal }) {
    if (task === 'decisions') throw new ProviderError('config', 'Decision models require decide({state, questions}); they do not accept chat-completion payloads');
    if (!Array.isArray(messages) || messages.length === 0) throw new ProviderError('config', 'Chat messages are required');
    const selected = model === 'openrouter/free' && task === 'chat' && !(Array.isArray(tools) && tools.length)
      ? { id: 'openrouter/free' }
      : await selectModel(task, model ? [cleanModelId(model)] : preferred, { requiresTools: Array.isArray(tools) && tools.length > 0, minContextTokens });
    const payload = { model: selected.id, messages, max_tokens: Math.max(1, Math.min(32768, Math.floor(maxTokens))),
      provider: { ...provider, data_collection: provider.data_collection === 'deny' ? 'deny' : defaultDataCollection, allow_fallbacks: provider.allow_fallbacks !== false } };
    if (includeUsage) payload.usage = { include: true };
    if (Array.isArray(tools) && tools.length) payload.tools = tools;
    if (Number.isFinite(temperature)) payload.temperature = Math.max(0, Math.min(2, temperature));
    try {
      return await request(ENDPOINT[task] || ENDPOINT.chat, { body: payload, signal });
    } catch (err) {
      // A 400/422 from one model (unsupported parameter, tool schema, context
      // length) says nothing about the others: let the router try the next one.
      // 401/403 stay "config" because a bad key fails every model.
      if (err instanceof ProviderError && err.kind === 'config' && (err.status === 400 || err.status === 422)) {
        throw new ProviderError('unavailable', err.message, err.status);
      }
      throw err;
    }
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
    const selected = await selectModel('image', model ? [cleanModelId(model)] : preferred, { quality: options.quality, aspectRatio: options.aspect_ratio, inputReferences: Array.isArray(images) ? images.length : 0 });
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

  async function getVideoRoute({ model, tier = 'max', resolution, fps, duration, aspectRatio, generateAudio = true, hasVideoInput = false, maxDuration = null } = {}) {
    // Resolve unsupported quality/FPS/aspect/audio requests to values actually
    // advertised by the provider catalog. Duration is resolved to a length the
    // model really advertises (the exact one when any model has it, otherwise
    // the nearest, preferring slightly longer so the clip can be trimmed) and
    // is returned in route.duration so callers record the true clip length.
    // Never exceeds maxDuration, never invents a length the model lacks.
    const result = await request('/videos/models', { method: 'GET' });
    if (!Array.isArray(result.data)) throw new ProviderError('unavailable', 'OpenRouter video model catalog response is invalid');
    const allowedByTier = tier === 'pro'
      ? ['480p', '360p']
      : ['4k', '1080p', '720p', '480p', '360p'];
    const preferredId = typeof model === 'string' && MODEL_ID.test(model) ? model : null;
    const candidates = result.data.filter((item) => typeof item.id === 'string' && item.id.length <= 180);
    const ordered = preferredId
      ? [...candidates.filter((item) => item.id === preferredId), ...candidates.filter((item) => item.id !== preferredId)]
      : candidates;
    const values = (item, keys) => {
      for (const key of keys) if (Array.isArray(item[key]) && item[key].length) return item[key];
      return [];
    };
    const wanted = Number(duration);
    const ceiling = Number.isFinite(Number(maxDuration)) && Number(maxDuration) > 0 ? Number(maxDuration) : Infinity;
    const advertised = (item) => values(item, ['supported_durations', 'supportedDurations'])
      .map(Number).filter((value) => Number.isFinite(value) && value > 0 && value <= ceiling);
    // Pass 1 keeps the original behavior: an exact match on any model wins.
    // Pass 2 rounds to the closest advertised length (longer before shorter).
    const nearest = (item) => {
      const list = advertised(item);
      if (!list.length || !Number.isFinite(wanted) || wanted <= 0) return null;
      const longer = list.filter((value) => value >= wanted).sort((a, b) => a - b)[0];
      return longer ?? list.sort((a, b) => b - a)[0];
    };
    const pickable = [
      ...ordered.map((item) => ({ item, length: advertised(item).includes(wanted) ? wanted : null })).filter((entry) => entry.length != null),
      ...ordered.map((item) => ({ item, length: nearest(item) })).filter((entry) => entry.length != null)
    ];
    for (const { item, length } of pickable) {
      const resolutions = values(item, ['supported_resolutions', 'supportedResolutions'])
        .filter((value) => allowedByTier.includes(String(value)));
      const frameRates = values(item, ['supported_frame_rates', 'supported_fps', 'supportedFrameRates'])
        .map(Number).filter((value) => Number.isFinite(value) && value > 0 && value <= 120);
      const ratios = values(item, ['supported_aspect_ratios', 'supportedAspectRatios']).map(String);
      // Frame rates are optional: the live catalog lists none for any model, so a
      // missing list means the provider default, not "unsupported".
      if (!resolutions.length || !ratios.length) continue;
      const selectedResolution = resolutions.includes(resolution) ? resolution : resolutions[0];
      const selectedFps = frameRates.length === 0 ? null : (frameRates.includes(Number(fps)) ? Number(fps) : (frameRates.includes(30) ? 30 : frameRates[0]));
      const selectedAspectRatio = ratios.includes(aspectRatio) ? aspectRatio : ratios[0];
      const audioSupported = item.generate_audio === true || item.supports_audio_generation === true;
      if (generateAudio === true && !audioSupported) {
        // Audio is optional; choose the model's supported silent-video mode.
      }
      return Object.freeze({
        model: item.id,
        resolution: selectedResolution,
        fps: selectedFps,
        duration: length,
        aspectRatio: selectedAspectRatio,
        generateAudio: generateAudio === true && audioSupported,
        hasVideoInput: hasVideoInput === true,
        source: 'openrouter-live-capability-catalog'
      });
    }
    throw new ProviderError('unavailable', 'No OpenRouter video model advertises the requested duration and a quality compatible with this plan');
  }

  async function createVideo({ model, preferred = [], tier = 'max', prompt, signal, ...options }) {
    const selected = await selectModel('video', model ? [cleanModelId(model)] : preferred, {
      tier, duration: options.duration, resolution: options.resolution, fps: options.fps, aspectRatio: options.aspect_ratio,
      generateAudio: options.generate_audio === true, 
    });
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) throw new ProviderError('config', 'Video prompt must be 1–8000 characters');
    // Never send a parameter that is unset (for example fps when the model lists none).
    const supplied = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== null && value !== undefined));
    const body = { ...supplied, model: selected.id, prompt: prompt.trim() };
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
    const inputs = Array.isArray(input) ? input : [input];
    if (inputs.length > 128 || inputs.some((item) => typeof item !== 'string' || !item.trim() || item.length > 100000)) {
      throw new ProviderError('config', 'Embedding input must contain 1–128 non-empty text items of at most 100000 characters');
    }
    const result = await request('/embeddings', { body: { model: selected.id, input }, signal });
    if (!Array.isArray(result?.data) || result.data.length !== inputs.length ||
        result.data.some((item) => !Array.isArray(item?.embedding) || item.embedding.length < 1 || item.embedding.length > 65536 ||
          item.embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value)))) {
      throw new ProviderError('unavailable', 'OpenRouter returned an invalid embedding response');
    }
    return result;
  }

  async function rerank({ model, preferred = [], query, documents, topN, signal }) {
    if (typeof query !== 'string' || !query.trim() || query.length > 20000) throw new ProviderError('config', 'Rerank query is required and must be at most 20000 characters');
    if (!Array.isArray(documents) || documents.length < 1 || documents.length > 128 ||
        documents.some((document) => typeof document !== 'string' || document.length > 100000)) {
      throw new ProviderError('config', 'Rerank documents must contain 1–128 text items of at most 100000 characters');
    }
    const requested = model ? [cleanModelId(model)] : preferred;
    if (!Array.isArray(requested) || requested.length === 0) throw new ProviderError('config', 'Reranking requires an explicitly configured model ID');
    const catalog = await listModels();
    const selected = requested.map(cleanModelId).map((id) => catalog.find((item) => item.id === id)).find(Boolean);
    if (!selected) throw new ProviderError('unavailable', 'Configured OpenRouter reranking model is not present in the live catalog');
    const count = topN == null ? documents.length : Number(topN);
    if (!Number.isInteger(count) || count < 1 || count > documents.length) throw new ProviderError('config', 'Rerank topN must be between 1 and the number of documents');
    const result = await request('/rerank', { body: { model: selected.id, query: query.trim(), documents, top_n: count }, signal });
    if (!Array.isArray(result?.results) || result.results.length > count ||
        result.results.some((item) => !Number.isInteger(item.index) || item.index < 0 || item.index >= documents.length ||
          typeof item.relevance_score !== 'number' || !Number.isFinite(item.relevance_score))) {
      throw new ProviderError('unavailable', 'OpenRouter returned an invalid reranking response');
    }
    return result;
  }

  return Object.freeze({ listModels, listModelsForTask, listCapabilityModels, selectModel, chat, decide, generateImage, createVideo, getVideoRoute, videoStatus, videoContent, speak, transcribe, embeddings, rerank });
}

export const OPENROUTER_TASK_ENDPOINTS = ENDPOINT;
export const OPENROUTER_TASK_MODALITIES = TASK_OUTPUT;
export const OPENROUTER_TASK_INPUT_MODALITIES = TASK_INPUT;


// Adapter for NasrinAI's existing video job lifecycle. OpenRouter video jobs
// are single-shot: do not pretend that provider-side extension is supported.
// The caller must enforce maxSeconds and use its existing spend reservation.
export function createOpenRouterVideoProvider({ client, model = null, tier = 'max', maxSeconds = 8, resolution = null, allowedResolutions = null, allowedFrameRates = [60, 30], allow4kAddon = false }) {
  if (!client || typeof client.createVideo !== 'function' || typeof client.getVideoRoute !== 'function') throw new ProviderError('config', 'OpenRouter video client with live capability lookup is required');
  const safeMax = Math.max(1, Math.min(8, Number(maxSeconds) || 8));
  let resolvedModel = model;
  return {
    id: 'openrouter', get model() { return resolvedModel; }, tier, maxSeconds: safeMax, resolution, allowedResolutions: allowedResolutions || (tier === 'pro' ? ['480p', '360p'] : ['4k', '1080p', '720p', '480p', '360p']), allowedFrameRates, allow4kAddon: allow4kAddon === true,
    async validateOptions({ generateAudio = true, hasVideoInput = false, duration = safeMax, aspectRatio = '16:9', requestedResolution = resolution, fps } = {}) {
      const route = await client.getVideoRoute({ model: resolvedModel || model, tier, resolution: requestedResolution, fps, duration, aspectRatio, generateAudio, hasVideoInput, maxDuration: safeMax });
      resolvedModel = route.model;
      return route;
    },
    async create({ prompt, aspectRatio, seconds = safeMax, generateAudio = true, hasVideoInput = false, requestedResolution = resolution, fps = 30 }) {
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > safeMax) throw new ProviderError('config', 'Requested duration exceeds the verified OpenRouter video model limit');
      const route = await client.getVideoRoute({ model: resolvedModel || model, tier, resolution: requestedResolution, fps, duration: Math.floor(seconds), aspectRatio, generateAudio, hasVideoInput, maxDuration: safeMax });
      resolvedModel = route.model;
      const result = await client.createVideo({ model: route.model, tier, prompt, duration: route.duration ?? Math.floor(seconds), aspect_ratio: route.aspectRatio || aspectRatio, resolution: route.resolution || requestedResolution, fps: route.fps !== undefined ? route.fps : fps, generate_audio: route.generateAudio ?? generateAudio });
      const id = result?.id || result?.job_id || result?.data?.id;
      if (typeof id !== 'string' || !/^[-a-zA-Z0-9_]{1,160}$/.test(id)) throw new ProviderError('unavailable', 'OpenRouter returned an invalid video job ID');
      return id;
    },
    async status(id) {
      const result = await client.videoStatus(id);
      // Normalize common OpenRouter response envelopes and preserve the requested
      // operation ID when the provider omits it from the status payload.
      const payload = result?.data && typeof result.data === 'object' ? { ...result.data, ...result } : result;
      const nested = payload?.video && typeof payload.video === 'object' ? { ...payload.video, ...payload } : payload;
      return { ...nested, id: nested?.id || nested?.job_id || id, job_id: nested?.job_id || id };
    },
    extract(result) {
      const payload = result?.video && typeof result.video === 'object' ? { ...result.video, ...result } : result;
      const state = String(payload?.status || payload?.state || payload?.data?.status || '').toLowerCase();
      const failed = ['failed', 'error', 'cancelled', 'canceled', 'expired'].includes(state);
      const done = ['completed', 'complete', 'succeeded', 'success', 'ready'].includes(state);
      const rawCost = payload?.usage?.cost ?? payload?.data?.usage?.cost;
      const actualCostUsd = rawCost !== undefined && rawCost !== null && Number.isFinite(Number(rawCost)) && Number(rawCost) >= 0 && Number(rawCost) <= 100000
        ? Number(rawCost) : null;
      return {
        done, failed, uri: done ? (payload?.id || payload?.job_id || payload?.data?.id || payload?.video_id) : null,
        actualCostUsd,
        error: failed ? String(payload?.error?.message || payload?.message || 'Video generation failed').slice(0, 240) : null
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
export function createOpenRouterProvider({ apiKey, model = 'openrouter/free', fallbackProvider = null, client = null, dataCollection = 'allow' }) {
  const openrouter = client || createOpenRouterClient({ apiKey, dataCollection });
  const supportedTasks = new Set(['chat', 'research', 'coding', 'debugging', 'scraping', 'generation', 'rendering', 'extraction', 'editing', 'analysis', 'vision']);
  const normalizeTask = (task) => task === 'debugging' ? 'coding' : supportedTasks.has(task) ? task : 'chat';
  return {
    id: 'openrouter',
    model,
    capabilities() {
      return { local: false, dataLeavesServer: true, vision: true, pdf: false, tools: true, trainsOnData: false };
    },
    async listModels() {
      const models = await openrouter.listModels();
      return [...new Set([...models.filter((m) => m.architecture?.output_modalities?.includes('text')).map((m) => m.id), ...(fallbackProvider ? ['openrouter/free'] : [])])];
    },
    // Capability-aware live discovery across OpenRouter's task-specific catalogs.
    // Discovery is not verification; each route must still make a valid endpoint call.
    async listModelsForTask({ task = 'chat', requiresTools = false, attachments = [] } = {}) {
      return openrouter.listModelsForTask({ task, requiresTools, attachments });
    },
    async healthCheck() {
      try { return (await openrouter.listModels()).length > 0; } catch { return false; }
    },
    async generate({ system = '', messages = [], model: requestedModel = model, task = 'chat', tools = [], maxTokens = 2048, signal, attachments = [], sensitive = false }) {
      const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
      if (hasAttachments && task !== 'vision') throw new ProviderError('config', 'Attachments require the dedicated OpenRouter vision task');
      if (hasAttachments && attachments.length > 8) throw new ProviderError('config', 'At most 8 image attachments are supported per vision request');
      const imageUrls = hasAttachments ? attachments.map((attachment) => {
        const value = typeof attachment === 'string' ? attachment : attachment?.url || attachment?.dataUrl;
        if (typeof value !== 'string' || (!/^https:\/\//i.test(value) && !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value))) {
          throw new ProviderError('config', 'Vision attachments must be HTTPS image URLs or PNG/JPEG/WebP base64 data URLs');
        }
        return value;
      }) : [];
      if (requestedModel === 'openrouter/free' && fallbackProvider) {
        if (normalizeTask(task) !== 'chat' || tools.length) throw new ProviderError('config', 'OpenRouter free routing cannot guarantee task-specific capabilities or tool support');
        if (hasAttachments || task === 'vision') throw new ProviderError('config', 'OpenRouter free routing cannot be used for vision tasks');
      }
      if (task === 'decisions') throw new ProviderError('config', 'Structured decisions require the dedicated decide({state, questions}) API');
      const normalizedMessages = messages.map((message) => ({ ...message }));
      if (hasAttachments) {
        let target = -1;
        for (let i = normalizedMessages.length - 1; i >= 0; i--) {
          if (normalizedMessages[i]?.role === 'user') { target = i; break; }
        }
        if (target < 0) throw new ProviderError('config', 'Vision requests require a user message');
        const current = normalizedMessages[target].content;
        const blocks = typeof current === 'string'
          ? [{ type: 'text', text: current }]
          : Array.isArray(current) ? current.slice() : [];
        for (const url of imageUrls) blocks.push({ type: 'image_url', image_url: { url } });
        normalizedMessages[target] = { ...normalizedMessages[target], content: blocks };
      }
      const result = await openrouter.chat({
        task: normalizeTask(task), model: requestedModel,
        messages: [{ role: 'system', content: system }, ...normalizedMessages],
        tools, maxTokens, signal, includeUsage: true,
        // Private requests (contact details, attachments) stay on providers that
        // do not store or train on prompts; everything else follows the default.
        provider: { ...(sensitive === true ? { data_collection: 'deny' } : {}), allow_fallbacks: true }
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
        actualCostUsd: result.usage?.cost !== undefined && result.usage?.cost !== null
          && Number.isFinite(Number(result.usage.cost)) && Number(result.usage.cost) >= 0 && Number(result.usage.cost) <= 100000
          ? Number(result.usage.cost) : null,
        finishReason: choice.finish_reason || 'unknown',
        model: result.model || requestedModel
      };
    }
  };
}
