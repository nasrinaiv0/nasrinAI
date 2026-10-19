# ElevenLabs Developer Plugin — Video Studio Integration

Status: Phase 1 implemented on the feature branch: server-side voice discovery, voiceover MP3 generation, sound-effect MP3 generation, authenticated routes, plan/rate checks, browser preview/download, and live configuration status. Persistent audio assets, timeline placement, and MP4 audio mixing/export are not implemented yet.

## Product intent

ElevenLabs is a **user-facing developer plugin for NasrinAI Video Studio**. It lets users use supported ElevenLabs audio-generation and audio-processing features inside their video creation workflow. It is not a general NasrinAI chat/realtime voice provider, and must not replace or alter existing OpenAI/Gemini speech or realtime voice paths.

Official docs:
- API capabilities: https://elevenlabs.io/api
- Text-to-speech: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
- Sound effects: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/sound-effects
- General documentation: https://elevenlabs.io/docs/overview/intro

## Video Studio capabilities

Implement these as distinct, clearly labeled actions. Every action must be enabled only when its server-side capability is configured and tested.

1. **Voiceover / narration**: convert a user's video script or selected scene narration to speech, choose a permitted voice/model, preview it, and add the resulting audio asset to the current video project.
2. **Scene-level narration**: generate/regenerate narration for an individual scene without overwriting unrelated clips. Retain the mapping between scene ID, script revision, audio asset, voice, duration, and status.
3. **Sound effects**: generate sound effects from a prompt and let the user preview and place a chosen result on the timeline. Treat these as separate generated audio assets, not speech.
4. **Voice and model selection**: list voices/models from the authenticated provider response, validate IDs server-side, and display only capabilities supported by the configured account.
5. **Audio asset lifecycle**: persist job state and audio metadata, support preview/retry/remove, and keep generated audio scoped to its project owner/tenant.
6. **Video assembly**: ensure generated audio is included in preview/export through the existing video assembly pipeline. Do not imply it is part of the final MP4 until integration tests prove that the exported video contains the selected audio.
7. **Future optional capabilities**: dubbing, transcription, voice changer, music, dialogue, voice design/cloning, and forced alignment are separate capabilities. Add only after each has its own UI, route, cost guard, permissions, and tests. Voice cloning must require explicit informed consent and rights to the source voice.

## UX

- In Plugins → Developer, show ElevenLabs with a link to Video Studio capabilities and a real configured/available status.
- Inside Video Studio, provide an **Audio / Voiceover** workflow with separate tabs or actions for Voiceover, Sound Effects, and (only when implemented) Dubbing.
- Allow users to select script/scene, voice, supported model, and relevant generation settings; preview before applying to the timeline.
- Show per-job progress, failures, retry, remove, estimated/actual usage when available, and clear cost/plan limits.
- Do not silently switch to another provider if ElevenLabs is unavailable. Explain the failure and offer an explicit alternative only if supported.
- The plugin card must not be treated as proof that the provider key, API routes, or media assembly is operational.

## Credentials and architecture

- Use the existing server-side secret-management pattern. The API key must never be exposed to the browser, stored in localStorage, sent in URLs, or logged.
- First inspect existing connector secret storage and account/tenant model. Prefer a user-owned encrypted connection if the product already supports secure per-user secrets; otherwise use a server-configured ElevenLabs key with explicit product-level usage attribution and plan quotas. Do not create a fake per-user connection UI if no secure storage exists.
- Call only fixed official ElevenLabs API origins; do not accept arbitrary base URLs (SSRF prevention).
- Add a dedicated server-side adapter and authenticated routes. Check ownership and authorization on every job, audio asset, scene, and project operation.
- Use bounded timeouts, payload limits, retries only where safe, request cancellation where supported, MIME validation, audio byte/duration limits, and storage retention/access policies.
- Integrate with existing usage logging, token/plan quotas where applicable, shared spend reservations, provider cost accounting, rate limits, and abuse controls. Fail closed if the cost cannot be estimated and production policy requires a known cost.
- Record provider action, latency, outcome, and available usage/cost metadata; never log API keys or full private scripts by default.
- Handle 401/403, 429, 5xx, timeout, malformed responses, quota exhaustion, and storage failure with sanitized actionable errors.

## Server API design (adapt to existing route conventions)

Use names consistent with existing project conventions; do not duplicate an existing route:
- Capability/status: whether ElevenLabs is configured and which Video Studio actions are operational.
- Voice/model discovery: provider-backed list with validated output.
- Voiceover job: submit script/scene narration, return an owner-scoped job ID/status.
- Sound-effect job: submit prompt and bounded duration/options, return an owner-scoped job ID/status.
- Job status/result: report state and provide a protected preview/download URL.
- Apply/remove timeline asset: bind an audio asset to a specific authorized project/scene; never accept an arbitrary project or asset owner from the client.

Long-running operations must use the existing durable job pattern if available. Do not rely on an in-memory promise or a single serverless request for long audio generation.

## Tests required

- Plugin appears exactly once and status never claims connected/available when the server key or relevant capability is missing.
- Credential stays server-side and is absent from API responses, frontend assets, logs, and errors.
- Voiceover and sound-effect generation handle success, malformed provider responses, timeout, 401/403, 429, 5xx, cancellation, and quota failures.
- Enforce per-user/tenant project ownership for every job, preview, audio asset, apply, and delete operation.
- Validate prompt/script length, voice/model IDs, MIME, audio size/duration, and output format.
- One user's audio/project/job cannot be accessed or overwritten by another user.
- Scene regeneration updates only the selected scene and leaves unrelated timeline assets intact.
- Export/assembly integration proves selected voiceover and effects appear at the expected timestamps in the final MP4; failure leaves no false-success state.
- Cost and usage accounting are recorded and existing budgets/rate limits are enforced.
- Existing video generation, OpenAI/Gemini speech, and realtime voice tests remain green.
- Run the full test suite and relevant security/dependency checks before merge; report exact results.

## Delivery checklist

1. Inspect Video Studio UI, video/project/job storage, media assembly/export, connector secret storage, usage ledger, plan gates, and existing test helpers.
2. Implement provider adapter, status, voiceover and sound-effect jobs, audio asset storage, and timeline/export integration.
3. Add UI states for configuration, loading, preview, apply, progress, failure, retry, and remove.
4. Update docs/plugins.md, deployment configuration docs, privacy/terms disclosures, and change log as required.
5. Run full tests; do not merge with failing tests or unverified audio-in-export behavior.
