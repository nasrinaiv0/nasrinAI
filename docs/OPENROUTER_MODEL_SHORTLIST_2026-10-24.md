# NasrinAI OpenRouter model shortlist (2026-10-24)

## Purpose and safety boundary

This is an operator review shortlist, not a live account export and not a production allowlist. It compares model IDs and routes documented in the repository with OpenRouter's current public discovery catalog. OpenRouter listings change, and catalog presence does not prove that the configured account can call an endpoint successfully.

**No models are disabled by this document.** Do not remove account-level access or change production routing until (1) current Vercel environment values and route configuration are reviewed, (2) all relevant IDs are checked against the live modality catalog and pricing, (3) each selected endpoint passes a small authenticated smoke test, and (4) regression tests pass.

OpenRouter live discovery references checked 2026-10-24:
- https://openrouter.ai/discover
- https://openrouter.ai/models
- https://openrouter.ai/models?fmt=table

## Recommended operating policy

- Keep the active pool intentionally small: 2-4 general chat candidates, 2 coding candidates, 1-2 image models, 1-2 video models, 1 primary TTS model plus 1 backup, and explicit STT/transcription candidates only if that route is enabled.
- Choose by task capability, account-level endpoint health, observed success rate, latency, privacy policy, and verified cost—not model brand or benchmark rank alone.
- Quick/guest must use **only models explicitly marked free in the live OpenRouter catalog**, and must never fall back to paid models or direct paid providers. Reject any configured ID that is not confirmed free at request time. If all free candidates fail, return a clear retryable error rather than use a paid fallback.
- Paid tiers can use approved priced models only within their existing tier, feature, privacy and budget policy. Do not let Quick/guest reach paid candidates through ROUTE_LEVEL overrides, retry logic, modality adapters or provider failover.
- Chat, code/tool use, image, video, speech, transcription, decisions, embeddings and reranking are separate capabilities. Do not treat a text model as a media model.
- A catalog entry is not proof of availability. Mark a model verified only after a successful, non-empty, modality-correct authenticated smoke test.

## KEEP / DISABLE / VERIFY decisions

Status meanings:
- **KEEP**: retain in candidate shortlist/config while existing tests and live checks pass.
- **DISABLE (route only)**: remove from active candidate configuration only after confirming no active route or workflow depends on it; do not disable the model in the OpenRouter account yet.
- **VERIFY FIRST**: do not newly enable; keep its current setting unchanged until exact ID, capability, endpoint health and cost are checked.

### General chat / reasoning / coding

| Exact model ID | Decision | Intended role / reason |
|---|---|---|
| `deepseek/deepseek-v4.1-flash-1017` | KEEP for paid tiers after live check | Cost-effective general chat, coding and long-context work; appears in current catalog. Verify account endpoint and current price. |
| `z-ai/glm-5.3-flash` | KEEP for paid tiers after live check | Strong value and coding/agent capability; verify tool calling and actual route health. |
| `xiaomi/mimo-v2.6-flash` | KEEP candidate | Cost-conscious general work; verify endpoint, tools and current price. |
| `openai/gpt-6-luna` | VERIFY FIRST | Existing emergency/fallback route appears in repo history, but should never be eligible to Quick/guest. Verify exact current catalog ID and tier restrictions. |
| `openai/gpt-6-sol` | VERIFY FIRST | Retain only if current Max coding/complex-task route actually uses this exact ID and it passes endpoint checks. |
| `openai/gpt-6.1-sol` | VERIFY FIRST | Retain only if current Ultra route uses this exact ID and it passes endpoint checks. |
| `anthropic/claude-opus-5.5` | VERIFY FIRST | High-end reasoning candidate; not a general fallback. Enable only where the Anthropic/OpenRouter adapter, privacy policy, tier and pricing are verified. |
| `xiaomi/mimo-v2.6-pro` | VERIFY FIRST | Higher-cost candidate; keep only if measured quality gains justify cost and a route explicitly uses it. |
| `qwen/qwen3.8-flash` | VERIFY FIRST | Check exact current slug, tool/vision capabilities and price before activation. |
| `qwen/qwen3.8-27b` | VERIFY FIRST | Not a default low-cost candidate; retain only if route-specific tests justify it. |
| `inclusionai/ling-3.1-flash` | VERIFY FIRST | The current discovery page lists newer Ling 3.0 variants; verify this exact 3.1 slug before use. |
| `nvidia/nemotron-3.5-lightning:free` | DISABLE (Quick/guest route only, after route tests) | Repository logs/screenshots show HTTP 404 for this exact route. Do not keep retrying it as the first candidate until a live smoke test proves the exact endpoint works again. Do not disable the entire OpenRouter model/account. |
| `nvidia/nemotron-3-super-120b-a12b:free` | VERIFY FIRST | Existing Quick/guest candidate; test exact endpoint, non-empty completion and tools before retaining. |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | VERIFY FIRST | Existing free candidate; confirm exact live slug and successful endpoint before retaining. |
| `openrouter/free` | VERIFY FIRST; not preferred as fixed primary | Dynamic router can choose among free models but changes the underlying model. Keep only if the app can tolerate variable model identity/capabilities and telemetry records the returned model. Do not assume it provides a stable model family. |

### Free-only Quick / guest shortlist

Start smoke testing with these live-catalog candidates, in this order only after verifying the exact ID and free pricing:
1. `minimax/minimax-m3.1-flash:free` — promising free general/coding/agent candidate in the current catalog.
2. `nvidia/nemotron-3-ultra-550b-a55b:free` — retain only if exact endpoint succeeds.
3. `nvidia/nemotron-3-super-120b-a12b:free` — retain only if exact endpoint succeeds.
4. `nvidia/nemotron-3.5-lightning:free` — currently failing with 404 in observed logs; exclude from live retry pool until re-verified.

The first three are **VERIFY FIRST**, not certified healthy. Add another model only if its live catalog entry explicitly identifies it as free and a minimal authenticated completion succeeds. Do not use a paid ID as an emergency fallback. Preserve task-specific tool/vision requirements and keep the free-only check in server-side policy, not just environment-variable conventions.

### Image generation

| Model / family | Decision | Notes |
|---|---|---|
| Google Nano Banana 2 | VERIFY FIRST | Current OpenRouter image discovery leader/candidate. Use exact model ID returned by the live Images catalog; don't infer the slug from the display name. |
| ByteDance Seedream 4.5 | VERIFY FIRST | Candidate for quality/cost comparison. Confirm editing/reference-image support and pricing. |
| Black Forest Labs FLUX.2 Pro | VERIFY FIRST | Candidate for generation quality; confirm exact slug, supported inputs and cost. |
| Any old image route with no live catalog entry or missing price | DISABLE (route only, after dependency check) | Remove from active image candidates only after no caller depends on it and image regression tests pass. |

Do not configure image generation by adding these display names as model IDs. Read exact IDs and endpoint pricing from the current OpenRouter image catalog and ensure the configured ceiling covers advertised endpoint pricing.

### Video generation

The repository documents these current/previous candidates:
- `google/veo-3.1-fast`
- `google/veo-3.1-lite`
- `heygen/heygen-video-1`
- `alibaba/happyhorse-1.1`
- `alibaba/wan-2.7`
- `alibaba/wan-3.0`

**Decision: VERIFY FIRST for every video ID.** The public discovery page now shows newer video families including Seedance 2.5, Veo 3.1, Grok Imagine Video 1.5 and Kling Video v3.0 Pro. That does not guarantee a particular API slug, endpoint availability or supported parameters. Query the live video catalog and use its exact returned IDs. Keep at most one primary and one fallback initially, selected by actual cost/quality tests. Verify duration, resolution, aspect ratio, input-image support, job polling, final media persistence and actual provider cost reconciliation. Never retry a timed-out create request blindly, because it may create duplicate paid jobs.

### Text-to-speech, transcription and realtime voice

| Route/model | Decision | Notes |
|---|---|---|
| `google/gemini-3.8-flash-lite-tts` | VERIFY FIRST | Existing repo speech default; exact model is listed in current OpenRouter discovery. Check live speech endpoint and supported voice/audio response format. |
| `google/gemini-3.1-flash-tts-preview` | VERIFY FIRST | Current catalog lists this family; compare quality, price and latency before adding as fallback. |
| `hexgrad/kokoro-82m` | VERIFY FIRST | Lower-cost TTS candidate; verify voice quality, output format and language coverage. |
| `fish-audio/s2.1-pro` | VERIFY FIRST | Catalog has free and paid variants; confirm exact free slug if considered for Quick/guest and verify license/endpoint. |
| OpenRouter STT/transcription candidate | VERIFY FIRST | Select from the live transcription catalog, not the general text list. Verify supported languages, timestamps, file sizes and price. |
| Gemini realtime voice | KEEP as a separate direct route if enabled | Not an OpenRouter model route; don't break realtime voice by pruning OpenRouter TTS/STT candidates. |

For Quick/guest speech, enforce free-only model eligibility independently of chat routing if the product promises free speech. If no free speech model passes the test, fail clearly or use a separately authorized free native/browser voice; never silently route to paid speech.

### Specialized endpoints

| Capability | Decision |
|---|---|
| Structured Decisions models | VERIFY FIRST; keep separate from ordinary chat. Use only the dedicated Decisions API adapter. |
| Embeddings | KEEP only the exact model used by the active semantic-search/indexing path; verify vector dimensions before changing. |
| Reranking | KEEP only if the retrieval pipeline explicitly invokes it; otherwise DISABLE route after dependency check. |
| Audio/music generation | VERIFY FIRST and keep separate from TTS. |
| Image understanding / vision input | Verify model advertises image input and test actual image payloads; do not assume image generation means vision input. |

## Production verification checklist

Before any runtime allowlist or OpenRouter account changes:

1. Read the latest `main` branch and Vercel environment values for `ROUTE_LEVEL_1` through `ROUTE_LEVEL_5`, `OPENROUTER_FREE_MODELS`, `TIER_*`, `OPENROUTER_VIDEO_*_MODEL`, image tier routes, `OPENROUTER_TTS_MODEL` and `OPENROUTER_STT_MODEL`. Do not expose secrets in logs or this document.
2. Fetch live OpenRouter text, image, video, speech, transcription, embedding, reranking and decision catalogs. Record exact model ID, modalities, tool support, context, endpoint availability, and prices.
3. Compare against recent `openrouter_logs` by model/endpoint/status, successful non-empty task outputs, and provider-reported costs. A GET /models 200 does not prove a generation endpoint works.
4. Probe each candidate with the existing `npm run verify:openrouter -- --model <provider/model-id>` where applicable. The existing text probe does not certify media/decision endpoints; use modality-specific tests.
5. Add/adjust regression tests: free-only guest routing (including custom ROUTE_LEVEL overrides and retry paths), 404 candidate skip, no paid fallback, tool-calling code task, vision input, image creation, video lifecycle/polling, TTS audio bytes, STT transcription, privacy denial, cost ceilings and final task-result validation.
6. Run `npm test`, `npm run check:secrets`, and relevant lint/build checks. Test failures must be fixed before rollout.
7. Deploy to Vercel Preview and perform smoke tests using authorized credentials. Only then update production variables or OpenRouter account restrictions. Keep rollback values.

## Expected final shortlist size

- General text/coding: 3-5 active candidates per paid tier, capability filtered.
- Quick/guest chat: 2-4 **verified free** candidates; no paid fallback.
- Image: 1 primary + 1 fallback.
- Video: 1 primary + 1 fallback.
- TTS: 1 primary + 1 fallback.
- STT/transcription: 1 primary + 1 fallback only if enabled.
- Embeddings/reranking/decisions: only what active code actually uses.

This is deliberately a candidate plan, not a claim that these endpoints have all been tested. Current account-level availability, cost and production health remain unverified until authenticated smoke tests pass.
