# Free LLM API provider pool

NasrinAI uses the upstream provider directory as its catalog reference:
https://github.com/open-free-llm-api/awesome-freellm-apis

The upstream project is a frequently updated directory, not a single API key or a single SDK. Each provider requires its own account/credential, and each model has its own availability, free quota, privacy terms, and protocol. This implementation keeps credentials server-side and enables a provider only when it has a server-side key and a pinned model.

## Providers in the catalog

| Directory provider | NasrinAI ID | Adapter / notes |
|---|---|---|
| NVIDIA NIM | `nvidia-nim` | OpenAI-compatible |
| ModelScope | `modelscope` | OpenAI-compatible |
| Cloudflare Workers AI | `cloudflare-workers-ai` | Account-scoped Workers AI API |
| OpenCode Zen | `opencode-zen` | OpenAI-compatible |
| OpenRouter | `openrouter` | OpenAI-compatible chat plus dedicated capability-aware multimodal client |
| LLM7.io | `llm7` | OpenAI-compatible |
| Kilo Code | `kilo-code` | OpenAI-compatible |
| Google Gemini | `gemini` | Existing native Gemini adapter |
| Ollama Cloud | `ollama-cloud` | OpenAI-compatible endpoint |
| Mistral AI | `mistral` | OpenAI-compatible |
| OVHcloud AI Endpoints | `ovhcloud-ai-endpoints` | OpenAI-compatible |
| Groq | `groq` | OpenAI-compatible |
| Cohere | `cohere` | Dedicated v2 Chat adapter |
| Aion Labs | `aion-labs` | OpenAI-compatible |
| Hugging Face | `hugging-face` | OpenAI-compatible router |
| Cerebras | `cerebras` | OpenAI-compatible |
| Agnes AI | `agnes-ai` | OpenAI-compatible |
| Alibaba Cloud Model Studio | `alibaba-cloud-model-studio` | OpenAI-compatible |
| SiliconFlow | `siliconflow` | OpenAI-compatible |
| SambaNova | `sambanova` | OpenAI-compatible |
| Cline | `cline` | Listed for tracking; upstream directory currently gives no public API base URL |
| xAI | `xai` | OpenAI-compatible |
| Chutes.ai | `chutes` | OpenAI-compatible |
| Glhf.chat | `glhf-chat` | OpenAI-compatible |
| Grok (xAI alias) | `grok` | Same xAI endpoint; do not configure as a separate backend |
| AI21 Labs | `ai21-labs` | OpenAI-compatible endpoint; verify current free quota |
| DeepSeek | `deepseek` | OpenAI-compatible endpoint; verify current free quota |
| Nscale | `nscale` | OpenAI-compatible |
| Nebius | `nebius` | OpenAI-compatible |

## Environment variable pattern

For each provider with a supported adapter, add these variables in **Vercel → Project → Settings → Environment Variables**. Never commit real keys to GitHub and never expose them in browser code.

- `<PROVIDER_ENV>_API_KEY`: provider credential
- `<PROVIDER_ENV>_MODEL`: exact model ID to use
- `<PROVIDER_ENV>_FREE_MODELS`: comma-separated exact model IDs verified as free on that provider today

The `<PROVIDER_ENV>` prefix is shown in `src/ai/free-provider-catalog.js`. For example:

```text
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_FREE_MODELS=llama-3.3-70b-versatile
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=provider/model:free
OPENROUTER_FREE_MODELS=provider/model:free
```

These model IDs are examples only. Confirm the current model ID and its free status in the provider dashboard and the upstream directory before enabling them.

Cloudflare Workers AI additionally needs `CLOUDFLARE_ACCOUNT_ID`. Gemini continues to use `GEMINI_API_KEY` and the existing Gemini configuration. Cohere uses `COHERE_API_KEY`, `COHERE_MODEL`, and `COHERE_FREE_MODELS`.

## Routing and safety rules

1. A provider is enabled only when its key and model are configured.
2. A provider is a free routing candidate only when the selected model is an exact match in its `*_FREE_MODELS` allowlist.
3. Only exact allowlisted free model IDs receive zero estimated model cost. An unknown model is not assumed free.
4. Free-provider requests are treated as external and potentially training/logging-enabled. Sensitive messages and attachments are not sent to these providers by default.
5. The existing tier ceiling, per-user/hourly abuse controls, budget checks, response validation, retry bounds, and fallback policy remain in force.
6. Image generation/editing, video generation, speech, transcription, embeddings and typed decisions use separate OpenRouter endpoints where applicable; a text-chat model is never assumed to support those tasks. `src/ai/openrouter.js` checks live modality catalogs, validates model IDs, caps request sizes, and denies data collection for chat calls.
9. OpenRouter speech can be selected with `SPEECH_PROVIDER=openrouter`; optional `OPENROUTER_TTS_MODEL` pins a model. OpenRouter image routes require `IMAGE_TIER_n_PRIMARY_PROVIDER=openrouter`, a verified `IMAGE_TIER_n_PRIMARY_MODEL`, and an explicit `IMAGE_TIER_n_PRIMARY_PRICE` estimate. OpenRouter transcription is used when OpenAI transcription is not configured; optional `OPENROUTER_STT_MODEL` pins a model. Never enable a costly generation route until its model ID, supported parameters and price have been verified.
7. The catalog records endpoints and adapter types; it does not claim every model stays free. Free quotas, model IDs, and terms change upstream. Review the source before changing the free-model allowlist.
8. Cline is retained as a directory entry but is not activated as an inference API until the source provides a public endpoint. Grok is an xAI alias, not an additional independent provider.

## Upstream reference

- Provider list and key links: https://github.com/open-free-llm-api/awesome-freellm-apis
- Live model directory: https://freellm.net/models/
- Key directory: https://freellm.net/free-llm-api-keys/


### OpenRouter image models

NasrinAI can route image generation and editing through OpenRouter's dedicated Images API using these verified model IDs:
- `openai/gpt-image-2` — general high-quality generation and editing.
- `openai/gpt-image-2.5-flare` — speed-oriented generation and editing for higher-volume use.
- `openai/gpt-image-2.5-sunburst` — precision-oriented generation and editing.

Configure each image tier with `IMAGE_TIER_n_PRIMARY_PROVIDER=openrouter`, `IMAGE_TIER_n_PRIMARY_MODEL=openai/gpt-image-2` (or one of the other listed IDs), and an explicit `IMAGE_TIER_n_PRIMARY_PRICE` budget estimate in USD per image. Set the optional `IMAGE_TIER_n_PRIMARY_QUALITY` to a supported quality value only after confirming that the selected model's live Images API catalog accepts it. The adapter uses `POST /api/v1/images`, supports reference-image editing, and validates the model against the live catalog; it must not silently route these models through chat completions. Pricing varies with quality, image settings, and actual usage, so reconcile provider-reported usage cost when available.


## OpenRouter quality/security rollout (separate PR)

The dedicated branch `feat/openrouter-multimodal-quality-security` builds on the provider-catalog PR and isolates multimodal lifecycle work. Current implementation:
- OpenRouter video provider adapter for the existing video job interface.
- Single-shot duration guard (maximum 8 seconds until a model-specific duration is verified); extension fails closed rather than faking unsupported continuation.
- Explicit `OPENROUTER_VIDEO_COST_PER_SECOND_USD` is required to enable OpenRouter video, and the cost estimate is included in the existing spend reservation.
- Video API key/model/provider selection is server-side only.
- Regression test covers duration, cost and no-extension behavior.

Required environment variables to enable the OpenRouter video route:
- `VIDEO_PROVIDER=openrouter`
- `OPENROUTER_API_KEY`
- `OPENROUTER_VIDEO_MODEL` (exact model ID verified against the live video catalog)
- `OPENROUTER_VIDEO_COST_PER_SECOND_USD` (positive USD/second estimate verified against current provider pricing)
- `VIDEO_ENABLED=true`

Do not enable this route until a real provider integration test confirms model-specific request parameters, output download format, and pricing. OpenRouter's video catalog and endpoint can change; fail closed on unsupported model parameters or missing price. A single-shot model cannot currently be used for longer clips requiring extensions.

### Still required before production approval
1. End-to-end task-policy integration for research, coding, scraping, extraction, editing, rendering, and structured decisions; capability checks must happen before dispatch.
2. Provider-reported usage reconciliation and exact price/quality settings for image and video models.
3. Tests for unauthorized access, privacy policy, budgets, retry/failover, malformed provider responses, timeouts, model catalog drift, and real provider sandbox behavior.
4. CI green on the dedicated PR, then review; no merge/deploy before all gates pass.


### Task-aware OpenRouter text routing

When a route explicitly selects a priced OpenRouter text model, the policy now passes its classified task to the provider adapter. The adapter checks the exact model against the live text-capability catalog, requires tool-capable endpoints when tools are supplied, forces OpenRouter's data-collection policy to `deny`, and rejects attachments on this text-only adapter. Research, coding/debugging, scraping, extraction, editing, rendering and generation use their classified task labels for capability selection; a configured model that cannot satisfy the task fails closed rather than being silently replaced. Structured decisions remain on the dedicated `decide({ state, questions })` API and are not sent as ordinary chat requests.

Pricing remains governed by NasrinAI's configured model price registry and spend reservations. Before routing a paid OpenRouter model in production, configure and verify its exact model ID and current input/output prices. Do not put an unpriced model into normal routing.


### Live generation price and capability checks

- OpenRouter image generation now checks the selected model's live per-endpoint pricing records before calling the generation endpoint. The configured per-image ceiling must cover the highest advertised per-image price across available endpoints; absent or malformed pricing disables the request.
- OpenRouter video generation checks the live catalog's supported duration, resolution, and aspect ratio, and requires a parseable per-second SKU price. The configured per-second ceiling must be at least the highest advertised per-second SKU rate. Unsupported settings or missing pricing fail closed.
- When OpenRouter returns `usage.cost` for an image, NasrinAI uses that provider-reported value for image spend settlement and logs a warning if it exceeds the configured estimate.
- Video generation remains capped to single-shot clips while the existing video workflow cannot safely extend provider jobs. Production approval still requires durable actual-cost reconciliation for video jobs and a live provider integration test.


### OpenRouter video model routing

The video provider allowlist for this rollout is:

- `google/veo-3.1-fast`
- `google/veo-3.1-lite`
- `heygen/video` (confirm the exact current catalog ID before configuring)
- `alibaba/happyhorse-1.1`
- `alibaba/wan-2.7`
- `alibaba/wan-3.0`

Use the exact IDs returned by `GET /api/v1/videos/models`; model names displayed in the UI are labels, not API identifiers. Do not infer the HeyGen or Wan 3.0 slug from the marketing name. For each model, read the live `supported_durations`, `supported_resolutions`, `supported_aspect_ratios`, and current pricing before enabling it. Veo 3.1 Fast advertises 4/6/8 second clips; Wan 2.7 advertises 2–10 seconds; HappyHorse 1.1 advertises 3–15 seconds. The current NasrinAI video workflow is intentionally capped at 8 seconds until durable extension and video spend reconciliation are complete.

### Provider failover policy

- OpenRouter can retry among its own eligible upstream endpoints; NasrinAI must still handle total model/API failure.
- Cross-provider failover is permitted only before a generation job is accepted, or when the provider definitively reports that no job was created. Never retry a timed-out create request blindly: it may create duplicate paid jobs.
- Image, video and speech failover must preserve modality, capability, user tier, safety rules and spend ceiling. Never fall back from video/image/audio to text chat, or from coding to a model that cannot follow tool calls.
- Coding must remain on a verified code-capable text model with tools enabled when required. If all code-capable providers fail, return a clear retryable error; do not silently downgrade to a generic/free chat model.
- Keep Gemini/OpenAI/other existing providers as explicit fallback candidates only where their adapters are configured, health-checked, and compatible with the request. A fallback is not considered healthy merely because its API key exists.
