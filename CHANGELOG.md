## Unreleased

- Trigger the owner-session verification when a signed-in session is established, fixing the hidden Owner Command Center tile's visibility deadlock while preserving email/IP authorization.

- Use separate owner-supplied NasrinAI logo variants in the Space Connect tile, adapting to explicit light/dark themes and system preference without color inversion.

- Place the Owner Command Center entry inside NasrinAI Space as a hidden-by-default app tile, revealed only after server verification of the signed-in email and client IP.

- Restore the Owner Command Center entry in Settings for sessions verified by both the owner email and IP allowlists; remove it when verification fails or the user signs out.

- Add an owner-only AI Provider Logs view for sanitized OpenRouter request history, with time/model/status/endpoint filters, pagination, token counts, latency, provider-reported cost, and reconciled upstream provider/generation metadata.
- Add migration 065 for upstream provider and generation timing fields; add tests for owner-boundary enforcement, filter validation, and sanitized log responses.

# Changelog

- Fix video quality fallback errors so exhausted model/quality checks report capability unavailability rather than a misleading plan restriction; add regression coverage for requested 2-second clips.

- Add sanitized server-side OpenRouter request telemetry in Supabase, including latency, provider status, token usage, and provider-reported costs when available. Raw prompts and completions are not persisted.

## Unreleased

- Fix video creation failing for every model: a catalog with no frame-rate list is now treated as provider default instead of unsupported.

- Fix the hourly video limit: it has its own message instead of the sign-in one, and only counts videos that actually start.

- Fix chat video creation: Automatic uses the plan's video tier; requested clip lengths resolve to a length the model advertises; native resolution/FPS dialogs removed; "edit/turn photos into a video" requests route to video and offer Video Studio when photos are attached.

- Fix the base reply renderer's structured UI delimiter regex so valid search requests degrade to readable text and malformed UI payloads show a safe fallback when the optional enhancer is unavailable.

- Clarify the Help improve NasrinAI description: Guest and Quick access cannot manage the preference; eligible examples may be considered under screening safeguards, and the copy avoids implying every chat is collected or models are trained automatically.

- Suppress raw structured UI protocol JSON when a widget cannot be rendered; normalize whitespace around UI delimiters.
- Add a base formatter fallback for Quick-tier render paths where the optional Generative UI enhancer does not initialize.

- Improve Guest/Quick structured search rendering so raw UI payload JSON is not shown as ordinary chat text.
- Discover live OpenRouter text-capable models for Guest/Quick and filter them to explicitly free IDs, rather than limiting fallback discovery to the static Nemotron list.
- Allow operators to add explicitly free OpenRouter model IDs through `OPENROUTER_FREE_MODELS`; paid IDs are ignored and Guest/Quick remain free-only.


- Clarify third-party AI-provider training restrictions and filtered guest-conversation use for improving NasrinAI.
- Prefer explicitly free OpenRouter models for simple requests on Pro, Max, and Ultra while preserving tier-eligible paid fallback; keep Guest and Quick free-only.

- Add an owner-only live OpenRouter billing panel using the server-side Management API key, showing provider activity, token usage, reported spend, and credit metadata separately from Supabase costs to avoid double-counting.
- Add an owner-triggered reconciliation flow that looks up logged OpenRouter generation IDs, stores provider-reported cost/token metadata with provenance, and leaves unmatched rows explicitly unreconciled.

- Update the transitive `undici` dependency to 7.30.1 (lockfile only) to clear three high-severity advisories flagged by `npm audit`.

- Fix OpenRouter routing: add `OPENROUTER_DATA_COLLECTION` (default `allow`; private requests with contact details or attachments always use `deny`, and a configured `deny` is never loosened) so free and other non-zero-retention models are reachable; a model ID missing from the live catalog now fails as `unavailable` and fails over instead of silently calling the first catalog model; a 400/422 from one chat model fails over to the next candidate. Privacy notice updated (version 2026-10-24).

- Automatically approve community-learning examples only after existing sensitive-content, identifier, secret, and quality screening passes; unsafe or uncertain content remains excluded from the approved retrieval pool.

- Add an owner-only Community Learning review panel with pending/approved/rejected queues, explicit approve/reject actions, review history, and protected server endpoints backed by the existing service-role review RPC.

- Fix image-tier provider overrides so each selected provider receives its own default model ID when no explicit model is configured; add regression tests for Gemini, OpenAI, and OpenRouter primary/fallback combinations.

- Add idempotent indexes for eight foreign-key columns flagged by the live Supabase performance advisor, with regression tests. Unused indexes are intentionally retained until workload evidence establishes they are safe to remove.

- Keep the reply details panel above conversation content with absolute positioning and z-index 1000, while limiting its height to account for the chat composer dock and device safe area.

- Add a separate OpenRouter multimodal quality/security PR with a video-provider adapter, explicit per-second video budget gating, single-shot duration enforcement, and regression coverage. The integration remains a draft pending task-policy routing, provider-specific pricing verification, and passing CI; it is not enabled for production by default.

- Documented the requested OpenRouter video model allowlist with verified IDs `heygen/heygen-video-1` and `alibaba/wan-3.0`, current model-specific duration constraints, and safe modality-preserving failover policy for image, video, voice, and coding.

- Add a manual GitHub Actions workflow to verify live OpenRouter text-model availability and upload a JSON report. Runs only on explicit dispatch with cost confirmation; uses `OPENROUTER_API_KEY`.
