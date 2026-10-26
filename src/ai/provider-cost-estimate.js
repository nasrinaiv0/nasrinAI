import { loadPrices, priceOf, costOf } from './pricing.js';

export const PROVIDER_PRICING_VERSION = '2026-10-26-v1';
const PRICES = loadPrices();

function canonicalProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (provider === 'google') return 'gemini';
  if (provider === 'claude') return 'anthropic';
  return provider;
}
function canonicalModel(provider, value) {
  let model = String(value || '').trim().toLowerCase();
  const prefixes = provider === 'gemini' ? ['gemini/', 'google/', 'google:'] : provider === 'anthropic' ? ['anthropic/', 'claude/', 'anthropic:'] : provider === 'cloudflare-workers-ai' ? ['cloudflare-workers-ai/', 'cloudflare-workers-ai:', 'cloudflare/'] : provider === 'cerebras' ? ['cerebras/', 'cerebras:'] : ['openai/', 'openai:'];
  for (const prefix of prefixes) if (model.startsWith(prefix)) { model = model.slice(prefix.length); break; }
  if (provider === 'anthropic') {
    model = model.replace(/claude-(haiku|sonnet|opus)-5-5/g, 'claude-$1-5.5');
  }
  return model;
}

/**
 * Estimate list-price token cost. This is never provider-billed actual cost.
 * Gemini's configured free tier is intentionally estimated at paid list price:
 * runtime credentials do not prove whether a call used free quota or paid billing.
 * Unknown models return null rather than borrowing a similar model's price.
 */
export function estimateProviderRequestCost({ provider, model, inputTokens = 0, cachedTokens = 0, outputTokens = 0 } = {}) {
  const vendor = canonicalProvider(provider);
  if (!['openai', 'anthropic', 'gemini', 'cerebras', 'cloudflare-workers-ai'].includes(vendor)) return null;
  const modelId = canonicalModel(vendor, model);
  const counts = [inputTokens, cachedTokens, outputTokens].map(Number);
  if (counts.some((n) => !Number.isFinite(n) || n < 0 || n > 1e9)) return null;
  const [input, cached, output] = counts.map((n) => Math.floor(n));
  if (cached > input && vendor !== 'anthropic') return null;
  let price = priceOf(PRICES, vendor, modelId);
  if (!price) return null;
  // Anthropic reports cache-read input tokens separately from input_tokens.
  // Haiku 5.5 has a higher token rate when the full prompt exceeds 100K tokens.
  if (vendor === 'anthropic' && /claude-haiku-5\.5/.test(modelId) && input + cached > 100000) {
    price = { input: 0.5, cachedInput: 0.05, output: 2.5 };
  }
  const amount = vendor === 'anthropic'
    ? (input * price.input + cached * price.cachedInput + output * price.output) / 1e6
    : costOf(price, { inputTokens: input, cachedTokens: cached, outputTokens: output });
  return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(12)) : null;
}
