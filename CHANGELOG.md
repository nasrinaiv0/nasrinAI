# Changelog

## Unreleased

- Automatically approve community-learning examples only after existing sensitive-content, identifier, secret, and quality screening passes; unsafe or uncertain content remains excluded from the approved retrieval pool.

- Add an owner-only Community Learning review panel with pending/approved/rejected queues, explicit approve/reject actions, review history, and protected server endpoints backed by the existing service-role review RPC.

- Fix image-tier provider overrides so each selected provider receives its own default model ID when no explicit model is configured; add regression tests for Gemini, OpenAI, and OpenRouter primary/fallback combinations.

- Add idempotent indexes for eight foreign-key columns flagged by the live Supabase performance advisor, with regression tests. Unused indexes are intentionally retained until workload evidence establishes they are safe to remove.

- Keep the reply details panel above conversation content with absolute positioning and z-index 1000, while limiting its height to account for the chat composer dock and device safe area.

- Add a separate OpenRouter multimodal quality/security PR with a video-provider adapter, explicit per-second video budget gating, single-shot duration enforcement, and regression coverage. The integration remains a draft pending task-policy routing, provider-specific pricing verification, and passing CI; it is not enabled for production by default.

- Documented the requested OpenRouter video model allowlist with verified IDs `heygen/heygen-video-1` and `alibaba/wan-3.0`, current model-specific duration constraints, and safe modality-preserving failover policy for image, video, voice, and coding.
