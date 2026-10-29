/**
 * Explicit Owner Command Center model inventories.
 * These lists classify recorded telemetry only; they do not prove runtime readiness
 * and must never be used to fabricate request logs or provider-reported costs.
 */
export const OPENROUTER_OWNER_MODEL_IDS = Object.freeze([
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "nvidia/nemotron-3.5-lightning:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3.5-content-safety:free",
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
  "inception/mercury-decide:free",
  "respan/span-01-lite:free",
  "baseten/mammoth-1:free",
  "baseten/elephant-1:free",
  "nvidia/nemotron-3.5-embed-1b:free",
  "nvidia/nemotron-3.5-embed-8b:free",
  "nvidia/llama-nemotron-embed-vl-1b-v2:free",
  "nvidia/nemotron-3.5-rerank-8b:free",
  "google/gemini-3.8-flash",
  "google/gemini-3.1-flash-lite",
  "google/gemini-2.5-flash-lite",
  "anthropic/claude-haiku-5.5",
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-opus-5.5",
  "openai/gpt-6.1-sol-pro",
  "openai/gpt-6-luna-pro",
  "openai/gpt-6-luna",
  "openai/gpt-6.1-sol",
  "openai/gpt-5.2-codex",
  "openai/gpt-6-luna-decisions",
  "typesafe/jev-1.13",
  "google/gemini-3.8-flash-image",
  "google/gemini-3.1-flash-image",
  "openai/gpt-image-2",
  "openai/gpt-image-2.5-flare",
  "openai/gpt-image-2.5-sunburst",
  "google/veo-3.1-fast",
  "google/veo-3.1-lite",
  "heygen/heygen-video-1",
  "alibaba/happyhorse-1.1",
  "alibaba/wan-2.7",
  "alibaba/wan-3.0",
  "openai/gpt-audio",
  "openai/gpt-4o-audio-preview",
  "openai/gpt-4o-mini-tts",
  "openai/gpt-4o-transcribe",
  "openai/gpt-4o-mini-transcribe",
  "openai/whisper-1",
  "voyage/voyage-code-3",
  "voyage/voyage-rerank-2",
  "openai/text-embedding-3-small",
  "openai/text-embedding-3-large",
  "nvidia/nemotron-3.5-embed-8b:free",
  "nvidia/nemotron-3.5-rerank-8b:free"
]);

export const DIRECT_PROVIDER_OWNER_MODEL_IDS = Object.freeze({
  openai: Object.freeze([
    "openai/gpt-6-luna",
    "openai/gpt-6-luna-pro",
    "openai/gpt-6-luna-decisions",
    "openai/gpt-6.1-sol",
    "openai/gpt-6.1-sol-pro",
    "openai/gpt-5.2-codex"
  ]),
  google: Object.freeze([
    "google/gemini-3.8-flash",
    "google/gemini-3.1-flash-lite",
    "google/gemini-3.8-flash-lite-tts",
    "google/veo-3.1-fast",
    "google/veo-3.1-lite"
  ]),
  anthropic: Object.freeze([
    "anthropic/claude-haiku-5.5",
    "anthropic/claude-sonnet-5.5",
    "anthropic/claude-opus-5.5"
  ]),
});

function normalizedIds(ids) {
  return new Set(ids.flatMap((id) => {
    const value = String(id).trim().toLowerCase();
    const slash = value.indexOf('/');
    return slash > 0 ? [value, value.slice(slash + 1)] : [value];
  }));
}

const OPENROUTER_IDS = normalizedIds(OPENROUTER_OWNER_MODEL_IDS);
const DIRECT_IDS = Object.fromEntries(Object.entries(DIRECT_PROVIDER_OWNER_MODEL_IDS).map(([provider, ids]) => [provider, normalizedIds(ids)]));

export function ownerCatalogStatus(model, provider) {
  const value = String(model || '').trim().toLowerCase();
  if (!value || /^(?:actual model not reported|openrouter\/(?:auto|free)|auto)$/i.test(value)) return 'unknown';
  const source = String(provider || '').trim().toLowerCase();
  const ids = source === 'openrouter' ? OPENROUTER_IDS : DIRECT_IDS[source];
  if (!ids) return 'unknown';
  const slash = value.indexOf('/');
  const listed = ids.has(value) || (slash > 0 && ids.has(value.slice(slash + 1)));
  return listed ? 'listed' : 'not_listed';
}
