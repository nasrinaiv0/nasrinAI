/**
 * NasrinAI model capability registry.
 *
 * This is routing metadata, not proof of provider availability. A route may be
 * executed only by a matching provider adapter and only after its endpoint,
 * payload, output parser, limits and credentials are configured and tested.
 * "catalog-listed" models are not implicitly enabled.
 */
export const MODEL_CAPABILITIES = Object.freeze([
  // Text / coding / reasoning: OpenRouter chat-completions compatible only.
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra (free)', modality: 'text', endpoint: 'openrouter-chat', tierAccess: ['guest','quick-free'], skills: ['reasoning','planning','coding','research'], preferredTasks: ['analysis','planning','coding','research'], integrationStatus: 'chat-route', verificationStatus: 'not-tested' },
  { id: 'nvidia/nemotron-3.5-super-vl:free', name: 'Nemotron 3.5 Super VL (free)', modality: 'multimodal-chat', endpoint: 'openrouter-chat', tierAccess: ['guest','quick-free'], skills: ['text','vision','document-understanding'], preferredTasks: ['vision','research','analysis'], integrationStatus: 'chat-route', verificationStatus: 'not-tested' },
  { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning (free)', modality: 'text', endpoint: 'openrouter-chat', tierAccess: ['guest','quick-free'], skills: ['fast-chat','coding','reasoning'], preferredTasks: ['chat','coding','debugging'], integrationStatus: 'chat-route', verificationStatus: 'not-tested' },
  { id: 'nvidia/nemotron-3.5-content-safety:free', name: 'Nemotron 3.5 Content Safety (free)', modality: 'text', endpoint: 'openrouter-chat', tierAccess: ['guest','quick-free'], skills: ['content-safety','classification'], preferredTasks: ['moderation','classification'], integrationStatus: 'chat-route', verificationStatus: 'not-tested' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super (free)', modality: 'text', endpoint: 'openrouter-chat', tierAccess: ['guest','quick-free'], skills: ['chat','reasoning','coding'], preferredTasks: ['chat','analysis','coding'], integrationStatus: 'chat-route', verificationStatus: 'not-tested' },
  { id: 'inception/mercury-coder-small', name: 'Mercury Decide', modality: 'text', endpoint: 'provider-specific', tierAccess: ['pro','max','ultra'], skills: ['coding','decision-support'], preferredTasks: ['coding','decision'], integrationStatus: 'verify-provider-id-and-endpoint', verificationStatus: 'not-tested' },
  { id: 'arcee-ai/spotlight', name: 'Span-01 Lite', modality: 'text', endpoint: 'provider-specific', tierAccess: ['pro','max','ultra'], skills: ['reasoning','classification'], preferredTasks: ['analysis','decision'], integrationStatus: 'verify-provider-id-and-endpoint', verificationStatus: 'not-tested' },
  { id: 'google/gemma-4-26b-a4b', name: 'Gemma 4 26B A4B', modality: 'text', endpoint: 'openrouter-chat', tierAccess: ['pro','max','ultra'], skills: ['chat','reasoning','coding'], preferredTasks: ['chat','analysis','coding'], integrationStatus: 'chat-route', verificationStatus: 'not-tested' },
  { id: 'google/gemma-4-31b', name: 'Gemma 4 31B', modality: 'text', endpoint: 'openrouter-chat', tierAccess: ['pro','max','ultra'], skills: ['chat','reasoning','coding'], preferredTasks: ['analysis','coding','research'], integrationStatus: 'chat-route', verificationStatus: 'not-tested' },
  { id: 'google/nemotron-3-super', name: 'Nemotron 3 Super', modality: 'text', endpoint: 'openrouter-chat', tierAccess: ['pro','max','ultra'], skills: ['chat','reasoning'], preferredTasks: ['chat','analysis'], integrationStatus: 'verify-live-model-id', verificationStatus: 'not-tested' },

  // Image generation: provider image endpoint/payload required; not chat-completion routes.
  { id: 'google/gemini-2.5-flash-image', name: 'Nano Banana 2.1', modality: 'image-generation', endpoint: 'provider-image-generation', tierAccess: ['quick','pro','max','ultra'], skills: ['image-generation','image-editing'], preferredTasks: ['image'], integrationStatus: 'verify-live-model-id-and-image-payload', verificationStatus: 'not-tested' },
  { id: 'qwen/qwen-image-2.1-pro', name: 'Qwen Image 2.1 Pro', modality: 'image-generation', endpoint: 'provider-image-generation', tierAccess: ['pro','max','ultra'], skills: ['image-generation','high-detail-rendering'], preferredTasks: ['image'], integrationStatus: 'verify-live-model-id-and-image-payload', verificationStatus: 'not-tested' },
  { id: 'qwen/qwen-image-2.1-turbo', name: 'Qwen Image 2.1 Turbo', modality: 'image-generation', endpoint: 'provider-image-generation', tierAccess: ['quick','pro','max','ultra'], skills: ['fast-image-generation'], preferredTasks: ['image'], integrationStatus: 'verify-live-model-id-and-image-payload', verificationStatus: 'not-tested' },
  { id: 'google/gemini-3.1-flash-lite-image', name: 'Nano Banana 2 Lite', modality: 'image-generation', endpoint: 'provider-image-generation', tierAccess: ['guest','quick-free','quick','pro','max','ultra'], skills: ['image-generation'], preferredTasks: ['image'], integrationStatus: 'verify-image-endpoint-and-payload', verificationStatus: 'not-tested' },
  { id: 'openai/gpt-image-2', name: 'GPT Image 2', modality: 'image-generation', endpoint: 'provider-image-generation', tierAccess: ['pro','max','ultra'], skills: ['image-generation','image-editing'], preferredTasks: ['image'], integrationStatus: 'verify-live-model-id-and-image-payload', verificationStatus: 'not-tested' },
  { id: 'openai/gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', modality: 'image-generation', endpoint: 'provider-image-generation', tierAccess: ['max','ultra'], skills: ['image-generation'], preferredTasks: ['image'], integrationStatus: 'verify-live-model-id-and-image-payload', verificationStatus: 'not-tested' },
  { id: 'openai/gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare', modality: 'image-generation', endpoint: 'provider-image-generation', tierAccess: ['max','ultra'], skills: ['image-generation'], preferredTasks: ['image'], integrationStatus: 'verify-live-model-id-and-image-payload', verificationStatus: 'not-tested' },
  { id: 'openai/muse-image', name: 'Muse Image', modality: 'image-generation', endpoint: 'provider-image-generation', tierAccess: ['pro','max','ultra'], skills: ['image-generation'], preferredTasks: ['image'], integrationStatus: 'verify-provider-and-endpoint', verificationStatus: 'not-tested' },

  // Video: asynchronous jobs, provider polling and durable media retrieval required.
  { id: 'heygen/video', name: 'HeyGen Video', modality: 'video-generation', endpoint: 'provider-video-jobs', tierAccess: ['ultra'], skills: ['avatar-video','video-generation'], preferredTasks: ['video'], integrationStatus: 'verify-provider-job-api', verificationStatus: 'not-tested' },
  { id: 'x-ai/grok-imagine-video-1.5-lite', name: 'Grok Imagine Video 1.5 Lite', modality: 'video-generation', endpoint: 'provider-video-jobs', tierAccess: ['max','ultra'], skills: ['video-generation'], preferredTasks: ['video'], integrationStatus: 'verify-provider-job-api', verificationStatus: 'not-tested' },
  { id: 'bytedance/seedance-2.0-mini', name: 'Seedance 2.0 Mini', modality: 'video-generation', endpoint: 'provider-video-jobs', tierAccess: ['pro','max','ultra'], skills: ['video-generation','image-to-video'], preferredTasks: ['video'], integrationStatus: 'verify-provider-job-api', verificationStatus: 'not-tested' },
  { id: 'wan/wan-3.0', name: 'Wan 3.0', modality: 'video-generation', endpoint: 'provider-video-jobs', tierAccess: ['max','ultra'], skills: ['video-generation','image-to-video'], preferredTasks: ['video'], integrationStatus: 'verify-provider-job-api', verificationStatus: 'not-tested' },

  // Speech and transcription: keep TTS, STT and audio generation separate.
  { id: 'elevenlabs/eleven-flash-v2.5', name: 'Eleven Flash v2.5', modality: 'text-to-speech', endpoint: 'provider-tts', tierAccess: ['quick','pro','max','ultra'], skills: ['speech-synthesis','low-latency-voice'], preferredTasks: ['speech'], integrationStatus: 'verify-tts-payload', verificationStatus: 'not-tested' },
  { id: 'google/gemini-3.8-flash-lite-tts', name: 'Gemini 3.8 Flash Lite TTS', modality: 'text-to-speech', endpoint: 'provider-tts', tierAccess: ['guest','quick-free','quick','pro','max','ultra'], skills: ['speech-synthesis'], preferredTasks: ['speech'], integrationStatus: 'verify-tts-payload', verificationStatus: 'not-tested' },
  { id: 'google/gemini-3.8-flash-tts', name: 'Gemini 3.8 Flash TTS', modality: 'text-to-speech', endpoint: 'provider-tts', tierAccess: ['pro','max','ultra'], skills: ['speech-synthesis'], preferredTasks: ['speech'], integrationStatus: 'verify-tts-payload', verificationStatus: 'not-tested' },
  { id: 'google/gemini-3.5-transcribe', name: 'Gemini 3.5 Transcribe', modality: 'speech-to-text', endpoint: 'provider-transcription', tierAccess: ['quick','pro','max','ultra'], skills: ['transcription'], preferredTasks: ['transcription'], integrationStatus: 'verify-transcription-payload', verificationStatus: 'not-tested' },
  { id: 'openai/gpt-transcribe', name: 'GPT Transcribe', modality: 'speech-to-text', endpoint: 'provider-transcription', tierAccess: ['pro','max','ultra'], skills: ['transcription'], preferredTasks: ['transcription'], integrationStatus: 'verify-transcription-payload', verificationStatus: 'not-tested' },
  { id: 'x-ai/grok-stt-1.0', name: 'Grok STT 1.0', modality: 'speech-to-text', endpoint: 'provider-transcription', tierAccess: ['pro','max','ultra'], skills: ['transcription'], preferredTasks: ['transcription'], integrationStatus: 'verify-transcription-payload', verificationStatus: 'not-tested' },
  { id: 'openai/gpt-4o-transcribe', name: 'GPT-4o Transcribe', modality: 'speech-to-text', endpoint: 'provider-transcription', tierAccess: ['pro','max','ultra'], skills: ['transcription'], preferredTasks: ['transcription'], integrationStatus: 'verify-transcription-payload', verificationStatus: 'not-tested' },
  { id: 'openai/gpt-4o-mini-transcribe', name: 'GPT-4o Mini Transcribe', modality: 'speech-to-text', endpoint: 'provider-transcription', tierAccess: ['quick','pro','max','ultra'], skills: ['transcription','cost-efficient-transcription'], preferredTasks: ['transcription'], integrationStatus: 'verify-transcription-payload', verificationStatus: 'not-tested' },

  // Embeddings / reranking / decisions are dedicated APIs, never chat routes.
  { id: 'nvidia/nemotron-3.5-embed-1b:free', name: 'Nemotron 3.5 Embed 1B (free)', modality: 'embeddings', endpoint: 'provider-embeddings', tierAccess: ['guest','quick-free','quick','pro','max','ultra'], skills: ['embeddings','semantic-search'], preferredTasks: ['embedding'], integrationStatus: 'verify-embedding-payload', verificationStatus: 'not-tested' },
  { id: 'nvidia/nemotron-3.5-embed-8b:free', name: 'Nemotron 3.5 Embed 8B (free)', modality: 'embeddings', endpoint: 'provider-embeddings', tierAccess: ['guest','quick-free','quick','pro','max','ultra'], skills: ['embeddings','semantic-search'], preferredTasks: ['embedding'], integrationStatus: 'verify-embedding-payload', verificationStatus: 'not-tested' },
  { id: 'nvidia/llama-nemotron-embed-vl-1b-v2:free', name: 'Llama Nemotron Embed VL 1B V2 (free)', modality: 'multimodal-embeddings', endpoint: 'provider-embeddings', tierAccess: ['guest','quick-free','quick','pro','max','ultra'], skills: ['multimodal-embeddings','semantic-search'], preferredTasks: ['embedding'], integrationStatus: 'verify-embedding-payload', verificationStatus: 'not-tested' },
  { id: 'google/gemini-embedding-2-batch', name: 'Gemini Embedding 2 (batch)', modality: 'embeddings', endpoint: 'provider-embeddings-batch', tierAccess: ['pro','max','ultra'], skills: ['embeddings','batch-indexing'], preferredTasks: ['embedding'], integrationStatus: 'verify-batch-embedding-payload', verificationStatus: 'not-tested' },
  { id: 'voyage/voyage-code-4', name: 'Voyage Code 4', modality: 'embeddings', endpoint: 'provider-embeddings', tierAccess: ['pro','max','ultra'], skills: ['code-embeddings','code-search'], preferredTasks: ['embedding','coding'], integrationStatus: 'verify-voyage-endpoint', verificationStatus: 'not-tested' },
  { id: 'cohere/rerank-3', name: 'Rerank 3', modality: 'reranking', endpoint: 'provider-rerank', tierAccess: ['pro','max','ultra'], skills: ['reranking','search-quality'], preferredTasks: ['rerank','research'], integrationStatus: 'verify-rerank-payload', verificationStatus: 'not-tested' },
  { id: 'nvidia/nemotron-3.5-rerank-8b:free', name: 'Nemotron 3.5 Rerank 8B (free)', modality: 'reranking', endpoint: 'provider-rerank', tierAccess: ['guest','quick-free','quick','pro','max','ultra'], skills: ['reranking','search-quality'], preferredTasks: ['rerank','research'], integrationStatus: 'verify-rerank-payload', verificationStatus: 'not-tested' },
  { id: 'openai/gpt-6-luna-decisions', name: 'GPT-6 Luna Decisions', modality: 'structured-decisions', endpoint: 'provider-decisions', tierAccess: ['pro','max','ultra'], skills: ['decision-scoring','structured-decisions'], preferredTasks: ['decision','planning'], integrationStatus: 'verify-decisions-endpoint', verificationStatus: 'not-tested' },
  { id: 'openai/gpt-audio-mini', name: 'GPT Audio Mini', modality: 'audio-generation', endpoint: 'provider-audio', tierAccess: ['pro','max','ultra'], skills: ['audio-generation'], preferredTasks: ['audio'], integrationStatus: 'verify-audio-payload', verificationStatus: 'not-tested' }
]);

export const MODEL_CAPABILITY_CATEGORIES = Object.freeze([
  'text', 'multimodal-chat', 'image-generation', 'video-generation',
  'text-to-speech', 'speech-to-text', 'audio-generation',
  'embeddings', 'multimodal-embeddings', 'reranking', 'structured-decisions'
]);

export function modelsForCapability(category, tier) {
  return MODEL_CAPABILITIES.filter((model) =>
    model.modality === category && model.tierAccess.includes(tier)
  );
}

export function getModelCapability(id) {
  return MODEL_CAPABILITIES.find((model) => model.id === id) || null;
}

export function assertCapabilityRoute(model, requestedCategory, tier) {
  if (!model || model.modality !== requestedCategory) {
    throw new TypeError('Model is not registered for the requested capability');
  }
  if (!model.tierAccess.includes(tier)) {
    throw new TypeError('Model is not eligible for this tier');
  }
  if (model.integrationStatus !== 'verified' && model.integrationStatus !== 'chat-route') {
    throw new TypeError('Model capability route is not verified and cannot be executed');
  }
  return true;
}
