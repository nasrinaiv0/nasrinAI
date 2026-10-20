# NasrinAI Video Studio — Unified Editor Upgrade

## Product decision

Video Studio is one editing workspace, not a three-step wizard. Creating assets, arranging a timeline, previewing edits, and exporting must remain available on the same page. The interface may use collapsible panels and responsive drawers, but must not navigate users away from the active project to complete core editing tasks.

This is a CapCut-inspired feature target, not a claim of feature parity or an endorsement/affiliation with CapCut.

## Workspace layout

- **Top bar:** project title, save status, undo/redo, project settings, export.
- **Left rail:** Media, Create/AI, Audio, Text/Captions, Stickers/Overlays, Effects, Transitions, Filters/Adjust, and project assets.
- **Center stage:** responsive preview canvas, play/pause, current time / total duration, aspect ratio and preview quality.
- **Bottom timeline:** zoomable ruler and playhead; multiple independent video, image, audio, text/caption, and overlay tracks; add, select, move, trim, split, reorder, mute/solo, lock/hide, and delete.
- **Right inspector:** contextual properties for the selected clip or track, including transform, crop, opacity, volume, speed, color, text, animation, and timing.
- **Export drawer/modal:** output resolution, aspect ratio, frame rate, format/codec, quality/bitrate, audio settings, progress, cancel, and final download. Opening export must not discard or replace the editor.

## Editing capabilities

### Core editing
- Import local video, images, and audio; manage generated and cloud assets.
- Multi-track timeline with non-destructive edits, precise start/end trim, split, duplicate, delete, reorder, snapping, zoom, and playhead scrubbing.
- Undo/redo history, keyboard shortcuts, autosave, restore, and safe handling of unsaved changes.
- Preview should represent the project composition, not merely the currently selected source clip.
- Maintain explicit project schema/version and stable clip/track IDs. Validate all persisted data.

### Creative tools
- Text and animated titles; captions/subtitles and caption timing.
- Transitions between clips; effects, filters, color adjustments, crop/transform, opacity and blend options where supported.
- Speed/rate changes, freeze frame, audio volume/fades, audio replacement/mixing, voiceover, waveform display, and sound effects.
- Keyframe model for supported animated properties.
- AI-assisted creation, scene generation, prompt editing, and provider-backed tools must reuse existing server-side authentication, entitlement checks, rate limits, and spend controls.

### Export and rendering
- Render the **entire composed multi-track timeline** into one output, honoring clip order, in/out points, transforms, text, transitions, effects, and audio mix.
- Do not claim MP4 if the actual encoder only outputs WebM. Display actual codec/container and browser/device support.
- Prefer a bounded server-side rendering worker for dependable MP4 output and mobile reliability; browser rendering may remain a clearly labeled fallback.
- Enforce duration, resolution, upload/output size, concurrency, and runtime limits. Provide progress, cancellation, cleanup, retry, and actionable errors.
- Verify audio/video sync, output metadata, first/middle/last frames, and playback before release.

## Responsive design and accessibility
- Desktop: media rail, preview, inspector, and multi-track timeline visible together.
- Tablet: inspector and media rail can collapse; timeline remains reachable.
- Phone: compact preview, horizontally scrollable tool rail, bottom timeline with touch-friendly clip handles, and contextual bottom sheets. Keep the project in the same page; do not force a separate create/timeline/export route.
- All icon controls use fixed square hit areas, centered icons, explicit padding, accessible names, keyboard focus, disabled states, and no overlapping rules that change their dimensions.
- Respect safe areas and reduced motion. Avoid hover-only actions.

## Security and data integrity
- Keep provider credentials server-side; use existing auth and per-user ownership checks for projects, assets, and render jobs.
- Never trust client-provided owner IDs, asset URLs, render paths, or entitlement claims.
- Validate media MIME type, size, duration, dimensions, and resource usage server-side.
- Keep storage private and use short-lived signed URLs. Do not store access tokens in localStorage.
- Clean up temporary render files and orphaned assets safely.

## Implementation phases and release gates

1. **Unified shell:** keep creation controls, media, preview, timeline, inspector, save, and export accessible in one workspace; responsive layout and button sizing.
2. **Timeline foundation:** track model, clip selection, split/trim/move/reorder, snapping, playhead, undo/redo, autosave, schema migration.
3. **Preview compositor:** render the current multi-track composition accurately in preview, including image/video/audio and title overlays.
4. **Creative tools:** text/captions, transitions, effects, filters/adjustments, audio controls, speed, and keyframes, with explicit support boundaries.
5. **Production export:** composed timeline render, verified MP4 path, audio mix, progress/cancellation, cleanup, limits, and failure recovery.
6. **QA and rollout:** unit/integration/browser tests, mobile Safari and desktop browser checks, accessibility, security review, performance tests, preview deployment, then production smoke test.

Do not mark a phase complete because buttons exist. Each control must perform the action named by its label and have tests for success, empty state, invalid input, failure, and narrow-screen layout. Do not merge/release with failed checks or unverified claims of MP4/full timeline rendering.

## Acceptance criteria

- Create, edit, and export are parts of one page and the same project state.
- A project with multiple video/image clips, text overlays, and audio renders in the correct order into one composed output.
- Saving and reopening preserves tracks, clips, trims, titles, timing, and supported effects.
- Undo/redo correctly reverses/restores edits without losing assets.
- Export's displayed format matches the downloaded file's real container and codec.
- No duplicate DOM IDs, oversized icon buttons, clipped controls, console errors, or regressions in existing authentication and project APIs.
- Tests pass and the deployed mobile editor is manually verified before production release.
