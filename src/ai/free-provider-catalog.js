// Provider catalog sourced from open-free-llm-api/awesome-freellm-apis.
// Provider names and endpoints are metadata, not a guarantee that every model is
// free forever. Pin a model and enable a provider only after checking its current
// free-tier terms. Credentials and model IDs are configured in Vercel.
export const FREE_LLM_CATALOG_SOURCE = 'https://github.com/open-free-llm-api/awesome-freellm-apis';
export const FREE_LLM_CATALOG_REVIEWED = '2026-10-15';

export const FREE_LLM_CATALOG = Object.freeze([
  { id: 'nvidia-nim', env: 'NVIDIA_NIM', adapter: 'openai-compatible', baseUrl: 'https://integrate.api.nvidia.com/v1', keyUrl: 'https://build.nvidia.com/settings/api-keys' },
  { id: 'modelscope', env: 'MODELSCOPE', adapter: 'openai-compatible', baseUrl: 'https://api-inference.modelscope.cn/v1', keyUrl: 'https://modelscope.cn/my/myaccesstoken' },
  { id: 'cloudflare-workers-ai', env: 'CLOUDFLARE_WORKERS_AI', adapter: 'cloudflare-workers-ai', baseUrl: 'https://api.cloudflare.com/client/v4/accounts', keyUrl: 'https://dash.cloudflare.com/profile/api-tokens', defaultModel: '@cf/meta/llama-3.1-8b-instruct', freeModels: ['@cf/meta/llama-3.1-8b-instruct'] },
  { id: 'opencode-zen', env: 'OPENCODE_ZEN', adapter: 'openai-compatible', baseUrl: 'https://opencode.ai/zen/v1', keyUrl: 'https://opencode.ai/auth' },
  { id: 'openrouter', env: 'OPENROUTER', adapter: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/workspaces/default/keys', defaultModel: 'openrouter/free', freeModels: ['openrouter/free', 'meta-llama/llama-3.1-8b-instruct:free', 'google/gemma-2-9b-it:free', 'qwen/qwen-2.5-72b-instruct:free'], models: { chat: 'deepseek/deepseek-v4.1-flash', fast: 'z-ai/glm-5.3-flash', reasoning: 'openai/gpt-6-luna', coding: 'deepseek/deepseek-v4.1-flash', vision: 'deepseek/deepseek-v4-flash-vision-exp', speech: 'openai/gpt-6-luna', extraction: 'inference-net/schematron-v2-turbo', image: 'openai/gpt-image-2.5-flare', video: '', transcription: 'openai/whisper-1', embeddings: 'nvidia/llama-nemotron-embed-vl-1b-v2', rerank: '', catalog: [{ name: 'DeepSeek V4.1 Flash', id: 'deepseek/deepseek-v4.1-flash', tasks: ['chat', 'research', 'coding', 'scraping', 'extraction'] }, { name: 'GLM 5.3 Flash', id: 'z-ai/glm-5.3-flash', tasks: ['chat', 'research', 'decisions'] }, { name: 'MiMo-V2.6-Flash', id: 'xiaomi/mimo-v2.6-flash', tasks: ['chat', 'generation', 'editing'] }, { name: 'DeepSeek V4.1 Flash 1017', id: 'deepseek/deepseek-v4.1-flash-1017', tasks: ['coding', 'research'] }, { name: 'GPT-6 Luna', id: 'openai/gpt-6-luna', tasks: ['chat', 'decisions', 'generation'] }, { name: 'DeepSeek V4 Flash 0731', id: 'deepseek/deepseek-v4-flash-0731', tasks: ['coding', 'research'] }, { name: 'Jev1.13', id: 'bytedance/jev1.13', tasks: ['generation', 'editing'] }, { name: 'Claude Haiku 5.5', id: 'anthropic/claude-haiku-5.5', tasks: ['chat', 'research', 'extraction'] }, { name: 'MiMo-V2.6-Pro', id: 'xiaomi/mimo-v2.6-pro', tasks: ['decisions', 'coding', 'research'] }, { name: 'Qwen3.8 Flash', id: 'qwen/qwen3.8-flash', tasks: ['chat', 'scraping', 'extraction'] }, { name: 'Qwen3.8 27B', id: 'qwen/qwen3.8-27b', tasks: ['chat', 'coding', 'extraction'] }, { name: 'GPT-6 Luna Pro', id: 'openai/gpt-6-luna-pro', tasks: ['decisions', 'coding', 'research'] }, { name: 'Ling 3.1 Flash', id: 'inclusionai/ling-3.1-flash', tasks: ['chat', 'generation'] }, { name: 'DeepSeek V4 Flash Vision Exp', id: 'deepseek/deepseek-v4-flash-vision-exp', tasks: ['vision', 'extraction', 'editing'] }, { name: 'GPT-6 Luna Decisions', id: 'openai/gpt-6-luna-decisions', tasks: ['decisions', 'research'] }, { name: 'Decider V1.2', id: 'perplexity/decider-v1.2', tasks: ['research', 'decisions'] }] } },
  { id: 'llm7', env: 'LLM7', adapter: 'openai-compatible', baseUrl: 'https://api.llm7.io/v1', keyUrl: 'https://token.llm7.io' },
  { id: 'kilo-code', env: 'KILO_CODE', adapter: 'openai-compatible', baseUrl: 'https://api.kilo.ai/api/gateway', keyUrl: 'https://app.kilo.ai/profile' },
  { id: 'gemini', env: 'GEMINI', adapter: 'native-gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', keyUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'ollama-cloud', env: 'OLLAMA_CLOUD', adapter: 'openai-compatible', baseUrl: 'https://ollama.com/v1', keyUrl: 'https://ollama.com/settings/keys' },
  { id: 'mistral', env: 'MISTRAL', adapter: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'ovhcloud-ai-endpoints', env: 'OVHCLOUD_AI_ENDPOINTS', adapter: 'openai-compatible', baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', keyUrl: 'https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/' },
  { id: 'groq', env: 'GROQ', adapter: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys', defaultModel: 'openai/gpt-oss-20b', freeModels: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant', 'llama-4-scout-17b-16e-instruct', 'qwen/qwen3-32b', 'deepseek-r1-distill-llama-70b'] },
  { id: 'cohere', env: 'COHERE', adapter: 'cohere-v2', baseUrl: 'https://api.cohere.com/v2', keyUrl: 'https://dashboard.cohere.com/api-keys' },
  { id: 'aion-labs', env: 'AION_LABS', adapter: 'openai-compatible', baseUrl: 'https://api.aionlabs.ai/v1', keyUrl: 'https://www.aionlabs.ai/app/api-keys/' },
  { id: 'hugging-face', env: 'HUGGING_FACE', adapter: 'openai-compatible', baseUrl: 'https://router.huggingface.co/v1', keyUrl: 'https://huggingface.co/settings/tokens' },
  { id: 'cerebras', env: 'CEREBRAS', adapter: 'openai-compatible', baseUrl: 'https://api.cerebras.ai/v1', keyUrl: 'https://cloud.cerebras.ai/', defaultModel: 'gpt-oss-120b', freeModels: ['gpt-oss-120b', 'llama3.1-8b', 'llama-3.3-70b'] },
  { id: 'agnes-ai', env: 'AGNES_AI', adapter: 'openai-compatible', baseUrl: 'https://apihub.agnes-ai.com/v1', keyUrl: 'https://platform.agnes-ai.com/settings/apiKeys' },
  { id: 'alibaba-cloud-model-studio', env: 'ALIBABA_CLOUD_MODEL_STUDIO', adapter: 'openai-compatible', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1' },
  { id: 'siliconflow', env: 'SILICONFLOW', adapter: 'openai-compatible', baseUrl: 'https://api.siliconflow.cn/v1', keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'sambanova', env: 'SAMBANOVA', adapter: 'openai-compatible', baseUrl: 'https://api.sambanova.ai/v1', keyUrl: 'https://cloud.sambanova.ai/apis' },
  // The directory does not currently list a public API endpoint for Cline itself.
  { id: 'cline', env: 'CLINE', adapter: 'no-public-endpoint', baseUrl: '', keyUrl: '' },
  { id: 'xai', env: 'XAI', adapter: 'openai-compatible', baseUrl: 'https://api.x.ai/v1', keyUrl: 'https://console.x.ai' },
  { id: 'chutes', env: 'CHUTES', adapter: 'openai-compatible', baseUrl: 'https://api.chutes.ai/v1', keyUrl: 'https://chutes.ai/' },
  { id: 'glhf-chat', env: 'GLHF_CHAT', adapter: 'openai-compatible', baseUrl: 'https://glhf.chat/api/openai/v1', keyUrl: 'https://glhf.chat/' },
  // "Grok" is a second directory label for xAI, not a separate API endpoint.
  { id: 'grok', env: 'GROK', adapter: 'alias', aliasOf: 'xai', baseUrl: 'https://api.x.ai/v1', keyUrl: 'https://console.x.ai/' },
  { id: 'ai21-labs', env: 'AI21_LABS', adapter: 'openai-compatible', baseUrl: 'https://api.ai21.com/studio/v1', keyUrl: 'https://studio.ai21.com/account/api-key' },
  { id: 'deepseek', env: 'DEEPSEEK', adapter: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'nscale', env: 'NSCALE', adapter: 'openai-compatible', baseUrl: 'https://inference.api.nscale.com/v1', keyUrl: 'https://console.nscale.com/' },
  { id: 'nebius', env: 'NEBIUS', adapter: 'openai-compatible', baseUrl: 'https://api.studio.nebius.com/v1', keyUrl: 'https://studio.nebius.com/settings/api-keys' }
]);
