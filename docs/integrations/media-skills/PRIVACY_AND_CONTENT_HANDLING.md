# Media Skills — Privacy and Content Handling

**Status:** Proposed product and engineering requirements; align with NasrinAI's existing privacy policy and retention controls before implementation.

## Data classes

- Public/reference content.
- User-provided brief, prompts, scripts and brand documents.
- Private video, audio, images and project files.
- Personal data, faces, voices, likenesses and potentially biometric/identity-related material.
- Provider credentials, OAuth tokens and billing identifiers.
- Generated assets, captions, transcripts, QA reports and provenance records.

## Minimum requirements

1. Tell the user before upload which provider/service receives the data, what is sent, why it is required and whether it may incur a charge.
2. Ask affirmative consent before sending private audio/video or identity-sensitive material to an external transcription, avatar, voice, likeness or generation service.
3. Use the least data needed. Do not send full source media when a short excerpt, metadata or local processing suffices.
4. Do not train or create reusable face/voice identity profiles without explicit, informed user intent and verified rights/consent.
5. Do not use a person's likeness/voice to impersonate them or mislead viewers; require proof of authorization where applicable.
6. Keep API keys and OAuth tokens server-side; never include secrets in prompt context, skill packages, URLs or logs.
7. Store media in private tenant-scoped storage with short-lived signed URLs and authorization on every read/write.
8. Apply the product's documented retention choice to source media, derived assets, transcripts, temporary files, caches and provider copies where controllable.
9. Provide deletion of stored artifacts and clear status; disclose any provider-side retention that NasrinAI cannot directly delete.
10. Avoid storing raw prompts/media in telemetry unless needed and disclosed. Prefer hashes, IDs, bounded error codes and metadata.
11. Ensure logs, backups, support exports and owner dashboards follow least-privilege access and retention policy.
12. Do not use user media for training or unrelated purposes unless the product policy and user consent explicitly permit it.

## Consent and provenance record

For sensitive external processing, record consent version/time, user and job IDs, service/provider, data categories transferred, purpose, retention disclosure, and withdrawal/deletion status. Keep this record access-controlled and avoid retaining unnecessary sensitive content.

## Retention/deletion workflow

- Source upload: private by default; define expiry and user deletion.
- Temporary worker files: delete on completion/failure/cancellation within bounded cleanup windows.
- Generated artifacts: apply the user's retention setting and project ownership policy.
- Transcripts and QA/provenance metadata: classify separately; they may contain personal or confidential content.
- Provider artifacts: track provider job ID and deletion endpoint/process where available; disclose limits.
- Backups: document deletion propagation window and any legal/security retention exceptions.
- Failed/orphaned jobs: scheduled cleanup with audit event and no cross-tenant access.

## Product UX requirements

Before the first cloud-media operation, show a clear, dismissible notice that explains data transfer, provider, costs/credits, retention and alternatives. Obtain separate consent for sensitive voice/face operations. For any paid action, display an estimate and require confirmation when above the configured threshold. Make local-only options clearly distinguishable from cloud processing.

## Verification tests

Test consent not granted, revoked consent, provider changed after consent, missing privacy disclosure, delete request, expiration, cancelled job, failed upload, signed URL expiry, cross-tenant reads, log redaction, and provider-side deletion failure. A test must prove that a sensitive upload cannot proceed solely because a skill requests it.
