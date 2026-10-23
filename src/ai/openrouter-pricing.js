/**
 * Live OpenRouter model pricing metadata.
 *
 * OpenRouter model pricing values are USD per token (typically decimal strings).
 * They are estimates for planning only. Actual incurred cost must come from the
 * provider's response usage.cost / authoritative usage record, never this helper.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 5000;
const BASE_URL = 'https://openrouter.ai/api/v1/model/';

function parseRate(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (String(value).trim() === '') return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 ? rate : null;
}

export function normalizeOpenRouterModelSlug(modelSlug) {
  if (typeof modelSlug !== 'string') return null;
  const slug = modelSlug.trim();
  // Keep the one required slash between author and model; reject URL syntax,
  // query/hash fragments, whitespace and additional path segments.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(slug)) return null;
  return slug;
}

export function createOpenRouterPricingClient({
  fetchImpl = globalThis.fetch,
  ttlMs = DEFAULT_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => Date.now()
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const cache = new Map();

  async function getModelPrice(modelSlug, { forceRefresh = false } = {}) {
    const slug = normalizeOpenRouterModelSlug(modelSlug);
    if (!slug) {
      return { ok: false, kind: 'invalid_model_slug', model: null, pricing: null };
    }

    const cached = cache.get(slug);
    if (!forceRefresh && cached && cached.expiresAt > now()) {
      return { ok: true, source: 'openrouter_catalog_cache', model: slug, pricing: cached.pricing };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(BASE_URL + slug, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal
      });
      if (!response || !response.ok) {
        return {
          ok: false,
          kind: response?.status === 404 ? 'model_not_found' : 'pricing_http_error',
          status: Number.isInteger(response?.status) ? response.status : null,
          model: slug,
          pricing: null
        };
      }

      const body = await response.json();
      const raw = body?.data?.pricing;
      if (!raw || typeof raw !== 'object') {
        return { ok: false, kind: 'pricing_missing', model: slug, pricing: null };
      }

      const prompt = parseRate(raw.prompt);
      const completion = parseRate(raw.completion);
      if (prompt === null || completion === null) {
        return { ok: false, kind: 'pricing_invalid', model: slug, pricing: null };
      }

      // Optional fields are exposed only when valid; never assume absent
      // image/audio/video pricing is equivalent to text token pricing.
      const pricing = { prompt, completion };
      for (const field of ['request', 'image', 'input_cache_read', 'input_cache_write', 'web_search']) {
        const rate = parseRate(raw[field]);
        if (rate !== null) pricing[field] = rate;
      }
      cache.set(slug, { pricing, expiresAt: now() + Math.max(0, ttlMs) });
      return { ok: true, source: 'openrouter_live_model_endpoint', model: slug, pricing };
    } catch (error) {
      return {
        ok: false,
        kind: error?.name === 'AbortError' ? 'pricing_timeout' : 'pricing_fetch_failed',
        model: slug,
        pricing: null
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function invalidate(modelSlug) {
    const slug = normalizeOpenRouterModelSlug(modelSlug);
    if (slug) cache.delete(slug);
  }

  return { getModelPrice, invalidate };
}

/**
 * Optional text-only estimate using live rates. OpenRouter rates are USD/token.
 * This is NOT an invoice and must never replace provider-reported actual cost.
 */
export function estimateOpenRouterTextCost(pricing, { promptTokens = 0, completionTokens = 0 } = {}) {
  if (!pricing || !Number.isFinite(pricing.prompt) || !Number.isFinite(pricing.completion)) return null;
  if (!Number.isSafeInteger(promptTokens) || promptTokens < 0 ||
      !Number.isSafeInteger(completionTokens) || completionTokens < 0) return null;
  return promptTokens * pricing.prompt + completionTokens * pricing.completion;
}
