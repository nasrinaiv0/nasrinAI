// Imported (not read from disk) so Vercel bundles it with the function.
import BASE_PRICES from '../../config/model-prices.json' with { type: 'json' };

// Prices come from config/model-prices.json (USD per 1M tokens), optionally
// overridden by the MODEL_PRICES_JSON setting with the same shape. Routing and
// budget code only ask this module; no price is written anywhere else.

export function loadPrices(overrideJson = '') {
  const base = BASE_PRICES;
  const table = {};
  const add = (src) => {
    for (const [provider, models] of Object.entries(src || {})) {
      if (provider.startsWith('_') || !models || typeof models !== 'object') continue;
      table[provider] = { ...(table[provider] || {}) };
      for (const [model, p] of Object.entries(models)) {
        if (!p || typeof p !== 'object') continue;
        const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
        const input = n(p.input); const output = n(p.output);
        if (input === null || output === null) continue;
        table[provider][model] = { input, cachedInput: n(p.cached_input) ?? input, output, freeTier: p.free_tier === true };
      }
    }
  };
  add(base);
  if (overrideJson) add(JSON.parse(overrideJson));
  return table;
}

// Price for one provider/model, or null when unknown (unknown = never assumed free).
export function priceOf(table, provider, model, { freeTier = false } = {}) {
  // Some configuration paths carry the provider-qualified route ID all the way
  // into the budget hook (for example `openrouter:openai/gpt-6-luna`), while
  // the price registry is keyed by the provider-native model ID. Normalize only
  // this exact provider prefix; never guess a price from a partial model name.
  const qualifiedPrefix = `${provider}:`;
  const normalizedModel = typeof model === 'string' && model.startsWith(qualifiedPrefix)
    ? model.slice(qualifiedPrefix.length)
    : model;
  const p = table[provider]?.[normalizedModel] || table[provider]?.[model] || table[provider]?.['*'] || null;
  if (!p) return null;
  if (freeTier && p.freeTier) return { input: 0, cachedInput: 0, output: 0, free: true };
  return p;
}

// USD for a call. Tokens are counts, not millions.
export function costOf(price, { inputTokens = 0, cachedTokens = 0, outputTokens = 0 }) {
  if (!price) return null;
  const fresh = Math.max(0, inputTokens - cachedTokens);
  return (fresh * price.input + cachedTokens * price.cachedInput + outputTokens * price.output) / 1e6;
}

// A rough token count for text (about 4 characters per token).
export const estimateTokens = (text) => Math.ceil(String(text || '').length / 4);

// Price of one use of a built-in tool (for example web search), or null.
export function toolPrice(name) {
  const v = Number(BASE_PRICES.tools?.[name]?.per_call);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

// Price of one generated image, or null when unknown (then none are made).
export function imagePrice(provider, model) {
  const v = Number(BASE_PRICES.images?.[provider]?.[model]?.per_image);
  return Number.isFinite(v) && v >= 0 ? v : null;
}


// Conservative reservation rate for browser-direct realtime voice. Rates include
// headroom above continuous audio input+output pricing; sessions are charged at
// this maximum-duration estimate because the server cannot verify every turn.
export function realtimeCostPerMinute(provider, model) {
  const n = Number(BASE_PRICES.realtime?.[provider]?.[model]?.worst_case_per_minute);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function speechCostPerChar(provider, model) {
  const n = Number(BASE_PRICES.speech?.[provider]?.[model]?.worst_case_per_character);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function videoCostPerSecond(model, resolution, override = null) {
  const n = Number(override ?? BASE_PRICES.video?.[model]?.[resolution]);
  return Number.isFinite(n) && n > 0 ? n : null;
}


// Replace the static OpenRouter snapshot with exact live catalog prices.
// OpenRouter reports USD per token; this application's shared price table uses
// USD per 1M tokens. Missing or malformed price fields are deliberately omitted.
export function replaceOpenRouterPrices(table, models) {
  if (!table || typeof table !== 'object') throw new TypeError('price table is required');
  const verified = {};
  for (const model of Array.isArray(models) ? models : []) {
    if (typeof model?.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/i.test(model.id)) continue;
    const pricing = model.pricing;
    if (!pricing || typeof pricing !== 'object') continue;
    const inputPerToken = Number(pricing.prompt);
    const outputPerToken = Number(pricing.completion);
    if (pricing.prompt == null || pricing.completion == null
      || !Number.isFinite(inputPerToken) || inputPerToken < 0
      || !Number.isFinite(outputPerToken) || outputPerToken < 0) continue;
    const cachedPerToken = pricing.input_cache_read == null ? inputPerToken : Number(pricing.input_cache_read);
    if (!Number.isFinite(cachedPerToken) || cachedPerToken < 0) continue;
    verified[model.id] = {
      input: inputPerToken * 1e6,
      cachedInput: cachedPerToken * 1e6,
      output: outputPerToken * 1e6,
      source: 'openrouter-live-catalog'
    };
  }
  table.openrouter = verified;
  return { verified: Object.keys(verified).length, omitted: (Array.isArray(models) ? models.length : 0) - Object.keys(verified).length };
}
