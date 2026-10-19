# ElevenLabs Developer Plugin — Implementation Specification

Status: implementation required; do not mark connected or operational until live provider checks and tests pass.

## Goal

Add **ElevenLabs** as a first-class item in NasrinAI's **Plugins → Developer** section. This is a developer integration, not a replacement for NasrinAI's existing speech/realtime providers. It must fit the existing plugin catalog, settings, status, authorization, audit, and capability-reporting patterns.

Official provider documentation:
- API overview: https://elevenlabs.io/docs/api-reference/introduction
- Text-to-speech: https://elevenlabs.io/docs/api-reference/text-to-speech
- Voices: https://elevenlabs.io/docs/api-reference/voices
- Usage: https://elevenlabs.io/docs/api-reference/user/subscription

## User experience

- Show an ElevenLabs card in the Developer group, with developer name **ElevenLabs** and official website https://elevenlabs.io/.
- Follow the established one-expanded-plugin-at-a-time interaction and existing state-aware Connect / Disconnect pattern.
- Until a valid credential is configured and verified, show **Not connected**. A catalog entry alone must never imply a working integration.
- Connect flow accepts an ElevenLabs API key, explains required permissions, validates it server-side, and never echoes the key back to the browser after submission.
- Store credentials only in the existing encrypted/server-side secret storage pattern. Never place provider keys in localStorage, browser config, logs, analytics, URLs, or client bundles. If the current architecture cannot securely store user-provided provider credentials, do not ship a fake connect flow; use an owner-configured server environment variable and label it accurately.
- Disconnect revokes/deletes only this ElevenLabs connection and must not affect other integrations.
- Show provider status, available actions, and actionable sanitized errors. Do not expose raw provider errors, credentials, or internal stack details.

## Initial supported capabilities

Implement only provider endpoints and actions that are actually wired and tested:
1. Verify credentials and retrieve account/subscription usage metadata.
2. List available voices for the authorized account.
3. Generate text-to-speech audio from user-supplied text using a selected available voice and supported model.
4. Return audio as a safe downloadable/playable artifact using existing storage and media policies; enforce size, duration, MIME, timeout, and quota limits.
5. Optionally support voice metadata lookup if the API and authorization scope permit it.

Do not claim voice cloning, voice design, dubbing, speech-to-text, conversational agents, or realtime WebRTC support unless each feature is separately implemented and tested. Do not infer that ElevenLabs TTS is a realtime voice transport.

## Backend and security

- Reuse the current plugin provider catalog and developer-plugin settings components; avoid duplicate catalog entries.
- Add a dedicated server-side ElevenLabs adapter/service and explicit routes following existing route conventions.
- Validate input schemas, maximum text length, voice IDs, model IDs, output format, rate limits, and per-user/tenant ownership.
- Apply server-side authentication, tenant/account isolation, least privilege, CSRF/origin protections where applicable, and permission checks on every operation.
- Use timeouts, bounded retries only for safe transient failures, cancellation where supported, and sanitized structured errors.
- Prevent SSRF: only call fixed official ElevenLabs API origins; never accept an arbitrary base URL from the client.
- Treat generated audio and provider-returned metadata as untrusted data. Store audio only in approved buckets with existing retention and access-control policies; use signed URLs where appropriate.
- Apply usage/budget controls and record provider, action, latency, outcome, and cost/usage when available. Never log the API key or full sensitive text by default.
- Keep the existing OpenAI/Gemini/realtime voice paths intact. No silent provider switch; any fallback must be explicit, policy-approved, and observable.

## Configuration and capability reporting

- Add a server-side environment/config option only if required by the existing credential architecture. Document the exact variable name in deployment documentation; never expose its value in status responses.
- The status API and plugin status must distinguish **not configured**, **configured but unverified**, **connected**, **temporarily unavailable**, and **permission denied** where supported.
- Report each capability separately. A successful credential check must not imply that TTS generation or audio storage is operational.
- Do not reveal secrets, internal routing, or environment variable values to end users.

## Tests required before merge

- Catalog shows ElevenLabs exactly once in Developer and uses the existing expanded-card behavior.
- Unconfigured integration is shown as unavailable/not connected, not as working.
- Credential validation succeeds with a mocked valid response and safely rejects invalid/revoked keys.
- Key is not returned in API responses, browser HTML/JS, logs, or error text.
- Voice list and TTS calls validate inputs and handle success, malformed provider responses, rate limits, timeout, provider outage, and permission errors.
- User/tenant A cannot access user/tenant B's connection, generated audio, or usage.
- Disconnecting ElevenLabs leaves all other provider connections unchanged.
- Usage limits, text-size limits, audio MIME/size limits, and retention policies are enforced.
- Existing voice/realtime provider tests continue to pass; no provider-name leakage in generic user notifications.
- Run the full test suite and relevant security/dependency checks. Fix regressions before opening/merging the PR.

## Delivery checklist

1. Inspect existing plugin catalog, connection storage, secret encryption, status routes, voice adapters, media storage, and tests before coding.
2. Implement the provider adapter and settings/connection lifecycle using the established architecture.
3. Add tests for all behaviors above, including negative and cross-tenant cases.
4. Update docs/plugins.md, environment/deployment docs, and the change log.
5. Run the full suite. Report exact test totals and any checks that could not be run.
6. Do not merge or claim production readiness while tests are failing or the credential storage path is insecure.