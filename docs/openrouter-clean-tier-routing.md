# Clean-tier OpenRouter routing

This file implements the model IDs and tier assignments from the owner-provided OpenRouter Model IDs PDF (compiled October 25, 2026). It does not invent replacement IDs. Entries marked `inferred: true` in the source are preserved as inferred and excluded from eligible selection until the live OpenRouter catalog/probe verifies them.

## Tier labels

- `guest`: free-only model set, no image/video/audio generation.
- `quick-free`: free-only Quick route.
- `quick-paid`: explicitly approved low-cost paid Quick route; OpenRouter owns billing, while NasrinAI still enforces subscription entitlements and capability access.
- `pro`, `max`, `ultra`: paid model assignments from the source document.
- `guest-fallback`, `quick-free-fallback`: only the explicitly documented fallback exception, GPT-6 Luna for compatible text or understanding tasks. It is not a general free-tier model and must never be used as an image/video/audio output substitute.

## Safety and routing

- Do not block a model based on local price snapshots; provider billing is the cost source of truth.
- Do enforce account entitlement, capability match, provider availability, privacy requirements, quotas, timeouts and output validation.
- Model IDs are exact strings; inferred IDs need live catalog verification before use.
- Image generation uses image endpoints, video uses job APIs, speech uses TTS, transcription uses STT, embeddings use embedding APIs, reranking uses rerank APIs, and decisions use their documented endpoint. Do not send all categories through chat completions.
- A fallback must be entitled for the same tier and produce the same output category. If no compatible fallback exists, return a clear unavailable result rather than fabricating a result.

## Implementation boundary

`src/ai/openrouter-tier-routing.js` is the source-aligned routing registry and selector. It is safe to use as an eligibility layer, but does not itself implement provider adapters. A specialized route must remain disabled until the matching adapter, request payload, response parser, and tests are implemented and verified against the provider API.
