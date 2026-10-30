# Video Studio — Drama Studio-Inspired Feature Adoption

**Status:** Planning/specification only — no feature in this document is considered implemented until code and tests prove it.
**Reference reviewed:** https://github.com/jeffreycayao/Drama-Studio
**Target:** NasrinAI Video Studio only. Do not modify MOVO or the separate NasrinAI chat experience as part of this work.

## Compatibility and licensing

Drama Studio identifies itself as GPL-3.0-only. This plan adopts product ideas and independently implements them within NasrinAI's existing architecture; do not copy source code, assets, branding, UI artwork, or bundled workflows. Before copying or adapting any code from the reference, obtain a licensing review and explicitly decide how GPL obligations would be met. Keep the Drama Studio name and logo out of NasrinAI's product UI.

## Existing NasrinAI baseline

The repository already has a Video Studio workspace, template gallery, AI clip generation, timeline/editor controls, audio generation, cloud project and asset APIs, browser-side rendering, and a durable server render queue. The architecture document currently says that the server worker handles the generated source clip plus saved audio timeline, and does **not yet** replace the browser renderer for arbitrary multi-clip visual composition. Do not advertise full timeline MP4 export until it is implemented and verified.

## Feature adoption backlog

### P0 — Production-safe timeline editing
- [ ] Treat a versioned project document as the source of truth, with stable IDs for tracks and clips and validated schemas.
- [ ] Add reliable undo/redo for every supported edit; no-op and invalid edits must not pollute history.
- [ ] Improve timeline precision: snap/magnetic alignment, zoom, keyboard navigation, exact timecode movement, multi-selection, and predictable cross-track moves.
- [ ] Split at playhead across selected/all applicable tracks; select clips from playhead to sequence end.
- [ ] Add audio clip fade-in/fade-out handles, visible waveform where feasible, and still-frame capture into project assets.
- [ ] Autosave with visible save state, recovery after reload, and safe unsaved-change handling.
- [ ] Make keyboard shortcuts discoverable and configurable only after the command system and accessibility tests are in place.

### P1 — Generation workflows
- [ ] Add a workflow browser grouping built-in, user-saved, and imported workflows; show local/cloud labels and explicit provider requirements.
- [ ] Support custom workflow definitions through a validated, versioned adapter contract rather than arbitrary execution of uploaded code.
- [ ] Provide preflight checks for model/provider availability, missing configuration, unsupported aspect ratios/durations, entitlement, quota, and estimated cost.
- [ ] Persist generation job status and recover polling after refresh; provide retry/cancel where the provider supports it.
- [ ] Store successful outputs as project assets and preserve prompt, provider/model, job ID, dimensions, duration, and licensing/source metadata.
- [ ] Treat community workflow packs as untrusted data: preview contents, validate schemas and size limits, and never execute bundled scripts.

### P1 — Director and creator flows
- [ ] Music-video workflow: lyric/timing input, beat/shot planning, references, shot prompts, generated clips, and an editable timeline.
- [ ] UGC/social ad workflow: hook, dialogue, product/scene beats, aspect ratio, and editable shot-by-shot output.
- [ ] Business-ad workflow: product/service, offer, audience, brand assets, CTA, and editable sequence.
- [ ] Short-film workflow: outline/script to scenes and shots, with a review/approval checkpoint before spending credits on generation.
- [ ] Storyboard/idea board for acts, scenes, plotlines, beats, character relationships, and exportable screenplay text.
- [ ] Prompt library with reusable templates and safe variables for story, shots, visual style, characters, voices, music, and sound.
- [ ] All generated scripts and shot plans must remain editable; AI suggestions never silently overwrite user edits.

### P2 — Creative editing tools
- [ ] Separate video, overlay, text/caption, and audio tracks with explicit track ordering and visibility/lock/mute semantics.
- [ ] Contextual inspector for transform/crop, opacity, speed, volume, color, text style, and timing; only show controls that actually work.
- [ ] Text/title overlays and caption timing, SRT import/export, voiceover, sound effects, and music mixing.
- [ ] Transitions, filters, keyframes, and advanced effects only when both preview and final render implement the same behavior.
- [ ] A clear asset browser for generated, imported, and captured media; support replacement without losing timeline timing or references.

### P0 — Render/export correctness
- [ ] Render the full composed timeline (multiple visual clips/tracks, trim points, ordering, overlays/titles, supported effects, transitions, and mixed audio).
- [ ] Prefer the existing authenticated durable render queue and FFmpeg worker where it can meet requirements; evaluate external renderer services only with a documented cost, privacy, reliability, and licensing comparison.
- [ ] Show real supported container/codec, resolution, frame rate, audio settings, file-size/duration limits, and estimated cost before starting.
- [ ] Add progress, cancel, retry, idempotency, bounded concurrency/runtime, temporary-file cleanup, and actionable errors.
- [ ] Verify output metadata, audio/video sync, and first/middle/last frames. The download extension and UI label must match the actual output format.
- [ ] Do not fall back silently from MP4 to WebM or claim that the browser renderer produces a feature it does not support.

### P0 — Security and isolation
- [ ] Keep provider credentials server-side and reuse existing authentication, tenant ownership, plan entitlement, rate limits, usage reservations, and spend controls.
- [ ] Validate uploaded MIME type/content, size, duration, dimensions, URL scheme, and resource usage on the server.
- [ ] Use private storage and short-lived signed URLs; never trust client-supplied owner IDs, entitlement claims, render paths, or arbitrary asset URLs.
- [ ] Scope projects, assets, generation jobs, workflow definitions, and render jobs to the authenticated owner/tenant.
- [ ] Never send MOVO conversation state, unrelated NasrinAI chat context, or other projects' assets into a Video Studio prompt. Include only the active project and explicitly selected assets.
- [ ] Add tests proving tenant/project isolation and that secrets/tokens do not appear in logs or client bundles.

## Suggested delivery sequence and release gates

1. **Audit current behavior:** map each UI control to its handler, API, state mutation, and tests. Mark existing behavior as implemented, partial, absent, or unverified.
2. **Timeline correctness:** versioned schema, selection/move/trim/split, snapping, undo/redo, autosave, keyboard access.
3. **Project asset and workflow foundation:** workflow registry, generation preflight, persisted jobs and asset provenance.
4. **Director workflows:** ship one end-to-end workflow at a time, with review checkpoints and editable output.
5. **Composition and export:** implement full timeline render and prove parity with preview for the supported feature subset.
6. **Polish and rollout:** mobile Safari/desktop browser QA, accessibility, performance, security review, regression tests, preview smoke test, and production smoke test.

## Required evidence before marking complete

For every feature, provide:
- Source paths and a short implementation summary.
- Tests for success, empty state, invalid input, provider/network failure, and relevant permission boundary.
- Test command and actual result (not an assumed result).
- Screenshots or browser evidence for responsive controls where relevant.
- Rendered-file metadata and playback checks for export-related changes.
- Explicit known limitations.

A visible button or a passing static string assertion is not proof of a working feature. Do not merge with failing checks or claim production readiness while migrations, provider calls, durable render execution, or production smoke tests remain unverified.
