/**
 * OpenRouter clean-tier routing policy, based on docs supplied by product owner.
 *
 * IDs are preserved verbatim from the source inventory. "inferred" means the
 * source document explicitly says the ID was inferred from naming and must be
 * verified against OpenRouter's live catalog before use.
 *
 * OpenRouter owns provider pricing/billing. This file never estimates price or
 * blocks eligible routing on local price snapshots. Tier entitlements and task
 * capability checks remain mandatory.
 */
const row = (name, id, category, tiers, options = {}) => Object.freeze({
  name, id, category, tiers: Object.freeze(tiers),
  inferred: options.inferred === true,
  endpoint: options.endpoint || 'chat',
  input: Object.freeze(options.input || ['text']),
  output: Object.freeze(options.output || ['text']),
  status: options.status || 'catalog-listed'
});

export const OPENROUTER_MODEL_ROUTING = Object.freeze([
  // Text, coding and reasoning
  row('Nemotron 3 Ultra (free)', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'text', ['guest','quick-free']),
  row('Nemotron 3.5 Super VL (free)', 'nvidia/nemotron-3.5-super-vl:free', 'text', ['guest','quick-free'], { input: ['text','image'] }),
  row('Nemotron 3.5 Lightning (free)', 'nvidia/nemotron-3.5-lightning:free', 'text', ['guest','quick-free']),
  row('Nemotron 3 Super (free)', 'nvidia/nemotron-3-super-120b-a12b:free', 'text', ['guest','quick-free']),
  row('Nemotron 3.5 Content Safety (free)', 'nvidia/nemotron-3.5-content-safety:free', 'safety', ['guest','quick-free']),
  row('Gemma 4 26B A4B (free)', 'google/gemma-4-26b-a4b-it:free', 'text', ['guest','quick-free']),
  row('Gemma 4 31B (free)', 'google/gemma-4-31b-it:free', 'text', ['guest','quick-free']),
  row('Gemini 3.8 Flash', 'google/gemini-3.8-flash', 'text', ['pro','max']),
  row('Gemini 3.1 Flash Lite', 'google/gemini-3.1-flash-lite', 'multimodal-understanding', ['quick-paid'], { inferred: true, input: ['text','image','file','audio','video'] }),
  row('Gemini 2.5 Flash Lite', 'google/gemini-2.5-flash-lite', 'text', ['quick-paid'], { inferred: true }),
  row('Claude Haiku 5.5', 'anthropic/claude-haiku-5.5', 'text', ['quick-paid'], { inferred: true }),
  row('Claude Sonnet 5.5', 'anthropic/claude-sonnet-5.5', 'text', ['pro','max'], { inferred: true }),
  row('Claude Opus 5.5', 'anthropic/claude-opus-5.5', 'text', ['max','ultra'], { inferred: true }),
  row('GPT-6.1 Sol Pro', 'openai/gpt-6.1-sol-pro', 'text', ['ultra']),
  row('GPT-6 Luna Pro', 'openai/gpt-6-luna-pro', 'text', ['max']),
  row('GPT-6 Luna', 'openai/gpt-6-luna', 'text', ['guest-fallback','quick-free-fallback','pro']),
  row('GPT-6.1 Sol', 'openai/gpt-6.1-sol', 'text', ['pro','max','ultra']),
  row('GPT-5.2-Codex', 'openai/gpt-5.2-codex', 'coding', ['pro','max','ultra'], { inferred: true }),

  // Decisions and orchestration
  row('Mercury Decide (free)', 'inception/mercury-decide:free', 'decisions', ['guest','quick-free']),
  row('Span-01 Lite (free)', 'respan/span-01-lite:free', 'decisions', ['guest','quick-free']),
  row('GPT-6 Luna Decisions', 'openai/gpt-6-luna-decisions', 'decisions', ['quick-paid','pro','max','ultra']),
  row('Jev 1.13', 'typesafe/jev-1.13', 'decisions', ['quick-paid','pro','max','ultra'], { endpoint: 'decisions-api', status: 'verify-endpoint' }),
  row('Mammoth 1 (free)', 'baseten/mammoth-1:free', 'decisions', ['guest','quick-free']),
  row('Elephant 1 (free)', 'baseten/elephant-1:free', 'decisions', ['guest','quick-free']),

  // Image generation
  row('Nano Banana 2.1', 'google/gemini-nano-banana-2.1', 'image', ['pro','max','ultra'], { endpoint: 'image-generation', input: ['text','image'], output: ['image'] }),
  row('Nano Banana 2 Lite', 'google/gemini-3.1-flash-lite-image', 'image', ['quick-paid'], { endpoint: 'image-generation', input: ['text','image'], output: ['image'] }),
  row('Nano Banana (Gemini 2.5 Flash Image)', 'google/gemini-2.5-flash-image', 'image', ['quick-paid'], { inferred: true, endpoint: 'image-generation', input: ['text','image'], output: ['image'] }),
  row('Qwen Image 2.1 Pro', 'qwen/qwen-image-2.1-pro', 'image', ['pro'], { endpoint: 'image-generation', input: ['text','image'], output: ['image'] }),
  row('Qwen Image 2.1 Turbo', 'qwen/qwen-image-2.1-turbo', 'image', ['quick-paid'], { endpoint: 'image-generation', input: ['text','image'], output: ['image'] }),
  row('GPT Image 2', 'openai/gpt-image-2', 'image', ['pro','max'], { endpoint: 'image-generation', input: ['text','image'], output: ['image'] }),
  row('GPT Image 2.5 Sunburst', 'openai/gpt-image-2.5-sunburst', 'image', ['max','ultra'], { endpoint: 'image-generation', input: ['text','image'], output: ['image'] }),
  row('GPT Image 2.5 Flare', 'openai/gpt-image-2.5-flare', 'image', ['pro','max'], { endpoint: 'image-generation', input: ['text','image'], output: ['image'] }),
  row('Muse Image', 'meta/muse-image', 'image', ['quick-paid'], { endpoint: 'image-generation', input: ['text','image'], output: ['image'] }),

  // Video generation
  row('HeyGen Video', 'heygen/heygen-video-1', 'video', ['max'], { endpoint: 'video-jobs', input: ['text','image'], output: ['video'] }),
  row('Grok Imagine Video 1.5 Lite', 'x-ai/grok-imagine-video-1.5-lite', 'video', ['pro'], { endpoint: 'video-jobs', input: ['text','image'], output: ['video'] }),
  row('Seedance 2.0 Mini', 'bytedance/seedance-2.0-mini', 'video', ['pro'], { endpoint: 'video-jobs', input: ['text','image'], output: ['video'] }),
  row('Wan 3.0', 'alibaba/wan-3.0', 'video', ['max','ultra'], { endpoint: 'video-jobs', input: ['text','image'], output: ['video'] }),

  // Speech, transcription and audio
  row('Eleven Flash v2.5', 'elevenlabs/eleven-flash-v2.5', 'speech', ['quick-paid','pro','max','ultra'], { endpoint: 'text-to-speech', output: ['audio'] }),
  row('Gemini 3.8 Flash Lite TTS', 'google/gemini-3.8-flash-lite-tts', 'speech', ['quick-paid','pro','max','ultra'], { endpoint: 'text-to-speech', output: ['audio'] }),
  row('Gemini 3.8 Flash TTS', 'google/gemini-3.8-flash-tts', 'speech', ['pro','max','ultra'], { endpoint: 'text-to-speech', output: ['audio'] }),
  row('Gemini 3.5 Transcribe', 'google/gemini-3.5-transcribe', 'transcription', ['pro','max','ultra'], { endpoint: 'transcription', input: ['audio'], output: ['text'] }),
  row('GPT Transcribe', 'openai/gpt-transcribe', 'transcription', ['pro','max','ultra'], { endpoint: 'transcription', input: ['audio'], output: ['text'] }),
  row('Grok STT 1.0', 'x-ai/grok-stt-1.0', 'transcription', ['quick-paid','pro','max','ultra'], { endpoint: 'transcription', input: ['audio'], output: ['text'] }),
  row('GPT-4o Transcribe', 'openai/gpt-4o-transcribe', 'transcription', ['quick-paid','pro','max','ultra'], { inferred: true, endpoint: 'transcription', input: ['audio'], output: ['text'] }),
  row('GPT-4o Mini Transcribe', 'openai/gpt-4o-mini-transcribe', 'transcription', ['quick-paid','pro','max','ultra'], { inferred: true, endpoint: 'transcription', input: ['audio'], output: ['text'] }),
  row('GPT Audio Mini', 'openai/gpt-audio-mini', 'audio', ['quick-paid','pro','max','ultra'], { inferred: true, endpoint: 'audio', input: ['text','audio'], output: ['audio','text'] }),

  // Embeddings and reranking
  row('Nemotron 3.5 Embed 1B (free)', 'nvidia/nemotron-3.5-embed-1b:free', 'embeddings', ['guest','quick-free'], { endpoint: 'embeddings', output: ['vector'] }),
  row('Nemotron 3.5 Embed 8B (free)', 'nvidia/nemotron-3.5-embed-8b:free', 'embeddings', ['guest','quick-free'], { endpoint: 'embeddings', output: ['vector'] }),
  row('Llama Nemotron Embed VL 1B V2 (free)', 'nvidia/llama-nemotron-embed-vl-1b-v2:free', 'embeddings', ['guest','quick-free'], { endpoint: 'embeddings', input: ['text','image'], output: ['vector'] }),
  row('Gemini Embedding 2 (batch)', 'google/gemini-embedding-2:batch', 'embeddings', ['quick-paid','pro','max','ultra'], { endpoint: 'embeddings-batch', output: ['vector'] }),
  row('voyage-code-4', 'voyageai/voyage-code-4', 'embeddings', ['pro','max','ultra'], { inferred: true, endpoint: 'embeddings', output: ['vector'] }),
  row('rerank-3', 'voyageai/rerank-3', 'reranking', ['pro','max','ultra'], { inferred: true, endpoint: 'rerank', output: ['scores'] }),
  row('Nemotron 3.5 Rerank 8B (free)', 'nvidia/nemotron-3.5-rerank-8b:free', 'reranking', ['guest','quick-free'], { endpoint: 'rerank', output: ['scores'] })
]);

const MODEL_BY_ID = new Map(OPENROUTER_MODEL_ROUTING.map((model) => [model.id, model]));

export function getOpenRouterModel(id) {
  return MODEL_BY_ID.get(id) || null;
}

export function eligibleOpenRouterModels({ tier, category, verifiedIds = null }) {
  const verified = verifiedIds ? new Set(verifiedIds) : null;
  return OPENROUTER_MODEL_ROUTING.filter((model) => {
    if (!model.tiers.includes(tier)) return false;
    if (category && model.category !== category) return false;
    // Never promote inferred or unverified entries merely because they are in
    // this inventory. Caller must pass IDs confirmed by live catalog/probe.
    if (model.inferred && (!verified || !verified.has(model.id))) return false;
    if (verified && !verified.has(model.id)) return false;
    return true;
  });
}

export function canFallbackToOpenRouterModel({ from, to, tier }) {
  if (!from || !to || !to.tiers.includes(tier)) return false;
  // Fallback must satisfy the same output modality; input can be broader but
  // the fallback cannot pretend text is an image/video/audio artifact.
  return from.output.some((modality) => to.output.includes(modality))
    && to.input.includes('text') === from.input.includes('text')
    && from.category === to.category;
}

export function tierIsFreeOnly(tier) {
  return tier === 'guest' || tier === 'quick-free';
}
