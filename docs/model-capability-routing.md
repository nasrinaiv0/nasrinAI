# Model capability and tier routing registry

This registry normalizes the model inventory into task/capability categories and explicit tier eligibility. It deliberately does not treat a model name in a screenshot or provider catalog as proof of a working integration.

## Tier policy

- **Guest / free Quick:** eligible explicitly free models for chat, plus only the configured permitted fallback. Never use a paid model accidentally through dynamic discovery.
- **Paid Quick / Pro:** paid text routes and only the specialized capabilities assigned to those tiers.
- **Max / Ultra:** paid high-reasoning and specialized routes where configured; video providers are assigned to Ultra/Max according to the registry.
- A tier assignment is policy metadata, not a license to bypass product quotas, privacy controls, or the capability adapter.

## Capability categories and request families

| Category | Request family | Important handling |
| --- | --- | --- |
| Text / multimodal chat | OpenRouter-compatible chat completion | Validate input modalities, tool support, context and output |
| Image generation | Provider image generation API | Separate image prompts, image inputs/editing, response media extraction |
| Video generation | Provider asynchronous job API | Submit, poll, retrieve output, persist URL/asset and surface completion in chat |
| Text-to-speech | Provider TTS API | Provider-specific voice, format, and audio payload |
| Speech-to-text | Provider transcription API | Multipart/audio request format, language and timestamp options |
| Audio generation | Provider audio API | Audio-specific input/output and response parsing |
| Embeddings | Provider embeddings API | Vector dimension, batch size and model compatibility |
| Reranking | Provider rerank API | Query/documents payload and score parsing |
| Structured decisions | Provider-specific decision API | Schema validation and deterministic fallback |

## Fail-closed rule

The assertCapabilityRoute guard rejects mismatched categories, ineligible tiers, and any specialized model whose adapter is not marked verified. A catalog-listed model must not be dispatched through /chat/completions just because it appears in the model list.

## Before enabling each model in production

1. Verify the exact provider model ID against the live catalog/documentation.
2. Confirm the provider's real API endpoint, request schema, output schema and limits.
3. Implement or reuse a category-specific adapter; never infer compatibility from the model's display name.
4. Add mocked request/response tests and malformed-response, timeout, quota and retry tests.
5. Run an opt-in authenticated smoke test using the real provider credentials.
6. Only then mark the integration verified and enable the route.
7. Confirm plan entitlement and quotas server-side, including free-vs-paid Quick distinction.

## Status

The registry and fail-closed guard are the first implementation layer. Specialized endpoints remain intentionally disabled until their provider-specific adapters and live payload verification are complete. This avoids falsely advertising a model as implemented or sending an incompatible request to a provider.
