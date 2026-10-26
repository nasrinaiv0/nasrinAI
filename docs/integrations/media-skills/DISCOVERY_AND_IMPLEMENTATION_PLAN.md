# NasrinAI AI Media & Video Skills Library
## Discovery, Audit, and Implementation Plan

**Status:** Planning and discovery only  
**Target repository:** nasrinaiv0/nasrinAI  
**Implementation:** Not started  
**Approval gate:** This document does not authorize importing skill code or integrating providers. The audited catalog and exact import manifest must be reviewed before implementation.

## 1. Executive summary

NasrinAI should build a curated media-production skills library covering the full workflow: research, scripting, storyboards, video generation, editing, audio, avatars, motion graphics, rendering, quality checks, and content repurposing. The strategy is **discover broadly, verify deeply, integrate selectively**.

Repository counts are discovery signals, not verified counts of unique, compatible skills. Catalogs overlap, and listings may refer to skills, frameworks, APIs, model implementations, applications, or other directories. Each candidate must be classified and reviewed independently.

### Not in scope yet
- No production implementation, provider integration, or UI changes.
- No Supabase migrations, SQL changes, Vercel configuration, or deployments.
- No credentials or secrets added.
- No bulk copy of unreviewed code.
- No claim that free-to-download code means free generation or commercial usage.
- No merge to main without owner approval.

## 2. Design principles

1. Broad capability coverage beyond text-to-video.
2. Provenance for every imported file: canonical source, path, revision, license, and review date.
3. Deduplicate overlapping catalogs and skills.
4. Review source-code, model-weight, dataset, API, and trademark terms separately.
5. Inspect scripts, install hooks, dependencies, filesystem/network access, and credential handling before running code.
6. Separate skill instructions from provider adapters, model runtimes, and orchestration.
7. Track costs, quotas, account requirements, local hardware, and limitations.
8. Use least privilege, server-side secrets, bounded execution, timeouts, cancellation, and idempotent retries.
9. Record sanitized operational metadata; define retention and deletion controls.
10. Do not commit skill packages or provider code until the owner approves the exact manifest.

## 3. Capability taxonomy

### Planning and pre-production
- Idea and topic research; audience and platform selection
- Scripts, narration drafts, storyboards, shot lists, scene breakdowns
- Character/object continuity, reference-frame creation, brand briefs
- Model selection and cost estimates

### Video generation
- Text-to-video, image-to-video, reference-guided and video-to-video
- Scene continuation, camera movement, character consistency
- Product ads, UGC-style creatives, avatar/presenter videos, animation, 3D

### Editing and post-production
- Transcript-guided edits, scene detection, highlights and short clips
- Trimming, concatenation, transitions, reframing, overlays
- Background removal, enhancement, color workflows, audio/video synchronization

### Audio and language
- TTS, narration, transcription, word-level alignment, subtitles
- Dubbing/translation, music and sound effects, denoising, source separation
- Voice conversion/cloning only with appropriate permission

### Motion design and rendering
- Animated typography, explainers, charts, titles, logo animation
- HTML/CSS or code-driven compositions, reusable templates and aspect-ratio variants
- Automated render/export and file validation

### Understanding, asset management, and distribution
- Summaries, scene descriptions, semantic media search, transcript indexing
- Thumbnails, social covers, Shorts/Reels/TikTok adaptations, campaign variants
- Publishing/scheduling only after separate OAuth and platform-policy review

### Quality, safety, and governance
- Codec/resolution/frame-rate/duration checks
- Black/frozen frames, audio peaks, subtitle alignment, branding checks
- Rights and consent for likeness/voice, prompt-injection isolation, cost tracking
- Retention, deletion, abuse controls, and sanitized logs

## 4. Discovery catalogs

These are discovery sources, not certifications. Verify current contents, canonical URLs, commits, license, maintenance, and each linked project's terms.

- [Higgsfield Skills](https://github.com/higgsfield-ai/skills) — initial collection covering generation, identity, product photoshoots, brand kit, marketplace cards, websites, explainers, and thumbnails.
- [Generative Media Skills](https://github.com/calesthio/generative-media-skills) — broad media skills catalog; preliminary research described 150+ skills, which must be re-counted and deduplicated.
- [Awesome Agent Video Skills](https://github.com/clonn/awesome-agent-video-skills) — agent/video discovery.
- [Awesome AI Media Skills](https://github.com/JuneYaooo/awesome-ai-media-skills) — media creation and social content.
- [Awesome AI Video Tools](https://github.com/Thedurancode/awesome-ai-video-tools) — generation, editing, understanding, APIs.
- [Awesome Video Skills](https://github.com/ella-wang-opus/awesome-video-skills) — video workflow discovery.
- [Awesome Video Skills — AaronAust1n](https://github.com/AaronAust1n/awesome-video-skills) — video agents and programmatic video.
- [Awesome AI Video Editing](https://github.com/Supersynergy/awesome-ai-video-editing) — editing agents, generation, and ComfyUI workflows.
- [Awesome Video Agents](https://github.com/PhiloLabs/awesome-video-agents) — editing and video understanding.
- [Awesome Claude Video Skills](https://github.com/zhuyansen/awesome-claude-video-skills) — Claude-oriented discovery.
- [ReelStack skills directory](https://thereelstack.com/skills) — skills, MCP servers, editing, animation, and audio.
- [Awesome Video Diffusion](https://github.com/showlab/Awesome-Video-Diffusion) — model/research catalog, not a skill package by itself.

## 5. Candidate repositories by category

All descriptions are preliminary. Classify each source and verify its current license/revision before making an import decision.

### Generation and model frameworks
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) — visual generation workflows; custom nodes/models require separate audits.
- [Hugging Face Diffusers](https://github.com/huggingface/diffusers) — diffusion inference library; model terms and hardware vary.
- [Wan Video](https://github.com/Wan-Video/Wan2.2) — open video-generation workflows; verify model-specific terms and compute.
- [LTX-Video](https://github.com/Lightricks/LTX-Video) — video-generation inference; check current license and hardware.
- [HunyuanVideo](https://github.com/Tencent-Hunyuan/HunyuanVideo) — model implementation; review model terms.
- [CogVideo](https://github.com/THUDM/CogVideo) — video-generation workflows; verify current versions and terms.
- [VACE](https://github.com/ali-vilab/VACE) — video creation/editing research.
- [FastVideo](https://github.com/hao-ai-lab/FastVideo) — inference optimization.
- [LightX2V](https://github.com/ModelTC/LightX2V) — inference optimization.
- [Runway Skills](https://github.com/runwayml/skills) — candidate API-oriented media skills; verify repository state and usage costs.
- [Magic Hour Skills](https://github.com/magichourhq/skills) — candidate image/video/audio workflows; verify requirements and costs.

### Full production systems and orchestration
- [OpenMontage](https://github.com/calesthio/OpenMontage) — broad production system and workflow patterns; preliminary research indicates AGPL-3.0, requiring legal review before code reuse.
- [Pexo Skills](https://github.com/pexoai/pexo-skills) — multi-stage generation, scenes, narration, music, captions, export; verify actual package contents and service costs.
- [AI Film Skills](https://github.com/realaman90/ai-film-skills) — candidate film workflow; verify canonical repository, maintenance, and license.
- [ViMax](https://github.com/omni-prime/ViMax) — agent-based video production; review dependencies and licensing.
- [FireRed-OpenStoryline](https://github.com/FireRedTeam/FireRed-OpenStoryline) — conversational editing system, not necessarily a drop-in skill.
- [Toonflow](https://github.com/ToonflowAI/Toonflow) — story/script workflows for animation.
- [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) — automated short-video production; review dependencies/security.
- [Pixelle-Video](https://github.com/AIDC-AI/Pixelle-Video) — automated video creation; verify current state and dependencies.
- [ShortGPT](https://github.com/RayVentura/ShortGPT) — short-form automation; check maintenance and provider costs.

Previously surfaced exploratory names such as hve-spielberg, Spark Video, OpenChatCut, Huashu Motion, and generic Video Research MCP searches are **not approved candidates** until exact canonical repositories are resolved and inspected.

### Editing and post-production
- [Video Use](https://github.com/browser-use/video-use) — transcript-guided editing, captions, and output inspection; verify transcription requirements.
- [FFmpeg](https://github.com/FFmpeg/FFmpeg) — conversion, trimming, composition, encoding, audio processing; build configuration can affect license obligations.
- [MoviePy](https://github.com/Zulko/moviepy) — programmatic Python editing.
- [FunClip](https://github.com/modelscope/FunClip) — speech-guided clip selection/editing.
- [VideoDB Skills](https://github.com/video-db/skills) — video ingestion, search, analysis, editing, and streaming; service terms may apply.
- [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) — scene-boundary detection.
- [OpenCV](https://github.com/opencv/opencv) — computer vision/frame analysis.
- [Adobe Premiere Pro MCP candidate](https://github.com/ayushozha/AdobePremiereProMCP) — third-party editing integration; verify safety and maintenance.
- [Premiere Pro MCP candidate](https://github.com/leancoderkavy/premiere-pro-mcp) — third-party editing integration; verify source before use.

### Programmatic video and motion design
- [Remotion Skills](https://github.com/remotion-dev/skills) — reusable compositions, captions, animations, rendering; review licensing and usage terms.
- [HyperFrames](https://github.com/heygen-com/hyperframes) — HTML/CSS video composition; verify current scope.
- [Video Shotcraft](https://github.com/Vincentwei1021/video-shotcraft) — cinematic shot planning and product-video templates.
- [Framefields](https://github.com/gatewai-dev/framefields) — code-driven animation/video; verify license and status.
- [GSAP](https://github.com/greensock/GSAP) — web animation; product/license terms vary.
- [Motion Canvas](https://github.com/motion-canvas/motion-canvas) — TypeScript animated video framework.
- [Manim Community](https://github.com/ManimCommunity/manim) — educational/mathematical animation.
- [Lottie Web](https://github.com/airbnb/lottie-web) — vector-animation playback, not a complete video renderer.

### Audio, voice, and transcription
- [ElevenLabs Skills](https://github.com/elevenlabs/skills) — speech/transcription workflows; paid API usage may apply.
- [Whisper](https://github.com/openai/whisper) — speech recognition; compute and model terms apply.
- [WhisperX](https://github.com/m-bain/whisperX) — word-level timing and alignment.
- [Piper](https://github.com/OHF-Voice/piper1-gpl) — local TTS; GPL and voice/model terms need review.
- [VoxCPM](https://github.com/OpenBMB/VoxCPM) — speech-generation workflows; verify terms.
- [Demucs](https://github.com/adefossez/demucs) — audio source separation.
- FFmpeg can support extraction, mixing, normalization, and muxing.

### Avatars, lip-sync, and assets
- Higgsfield identity and product workflows.
- [HeyGen Skills](https://github.com/heygen-com/skills) — candidate avatar/presenter workflows; account, pricing, and consent requirements.
- ComfyUI and Diffusers — potential building blocks for reference-driven workflows.
- LTX-Video — investigate supported reference-driven workflows.
- This category needs a dedicated discovery pass for maintained lip-sync, talking-head, face-restoration, and identity-consistency projects. Consent and likeness safeguards are mandatory.

### Understanding, research, social, and marketing
- VideoDB Skills, OpenCV, PySceneDetect, Whisper, Diffusers, and Awesome Video Diffusion can support indexing, scene analysis, transcription, and model discovery.
- Higgsfield skills cover product photoshoots, brand kits, marketplace cards, explainers, and thumbnails.
- [YouTube Marketing Skills](https://github.com/adityaarsharma/youtube-marketing-skills) — candidate YouTube research/metadata workflows; verify exact capabilities and platform permissions.
- Remotion, MoneyPrinterTurbo, and ShortGPT are candidates for template-based or short-form workflows, subject to audit.
- Publishing/scheduling requires a separate review of OAuth scopes, account permissions, platform policies, and credential storage.

## 6. Artifact classification

Each candidate must be tagged as one or more of:
- **Agent skill:** instructions and optional helper files.
- **Tool/MCP server:** executable integration exposing operations.
- **Provider adapter/API client:** code calling an external service.
- **Framework/library:** reusable software requiring a wrapper or workflow.
- **Model implementation/weights:** inference code/assets with compute and model terms.
- **Standalone application:** usually not directly importable.
- **Catalog/directory:** a discovery source, not itself a capability.
- **Reference only:** useful design patterns/docs but not code to copy.

Do not conflate these categories. A model framework is not a ready-made skill; an API skill does not imply API access.

## 7. License, cost, and security audit

### License/provenance fields
Record exact repository, source path, pinned commit/tag, license identifier and file, redistribution/modification rights, notice/attribution obligations, copyleft/network-use obligations, model/dataset terms, dependencies/licenses, trademark restrictions, review date, and decision (import, adapt, reference-only, defer, reject).

### Cost classification
- **Local/no per-request API fee** — still incurs hardware/storage/energy costs.
- **Free tier limited** — quota and limits may change.
- **API paid or credits**
- **Subscription required**
- **Mixed provider options**
- **Unknown; needs verification**

Never call a workflow free without verifying the actual model/service, limits, commercial-use terms, and hardware requirements.

### Security checklist
- Inspect shell/install/build scripts, hooks, dynamic execution, network downloads, and telemetry.
- Check for credential leakage, suspicious network calls, arbitrary filesystem access, subprocess use, unsafe archive extraction, and hard-coded secrets.
- Review dependency manifests, lockfiles, package maintenance, and known vulnerabilities.
- Pin source revisions and dependencies where possible; isolate untrusted code and use dummy credentials.
- Never expose provider keys in browser code, prompts, or logs.
- Validate uploaded files, MIME types, sizes, duration, and archive contents.
- Treat prompts, subtitles, transcripts, and external media as untrusted input; defend against prompt injection.
- Use least privilege, per-user/tier/provider limits, bounded retries, timeouts, cancellation, and idempotency.
- Keep logs sanitized and minimize retained private content.
- Define consent, retention, deletion, and abuse-reporting policies.

## 8. Proposed documentation and directory structure

Proposal only; do not create these directories or files until approved.

    docs/integrations/media-skills/
      README.md
      DISCOVERY_CATALOG.md
      IMPORT_MANIFEST.md
      LICENSE_AND_ATTRIBUTION.md
      SECURITY_REVIEW.md
      COST_AND_AUTH.md
      ARCHITECTURE.md
      IMPLEMENTATION_PLAN.md
      TEST_PLAN.md
      DECISIONS.md

    skills/media/
      video-generation/
      film-preproduction/
      editing-postproduction/
      audio-voice/
      motion-graphics/
      avatars-lipsync/
      video-understanding/
      social-content/
      rendering-qa/
      shared/

Each skill's metadata should include ID/name/category/description, source repository/path/commit, artifact type, license/attribution/model terms, required API key names only, accounts/hardware, cost classification, rate limits, last pricing check, security/maintenance/compatibility/test status, decision, and reviewer notes. Never store secret values in the catalog.

## 9. Proposed runtime architecture (not implemented)

1. **Skill registry** — approved capabilities and provenance.
2. **Capability planner** — translates user intent into a bounded workflow.
3. **Entitlement/policy gate** — verifies plan, permissions, limits, and content policy.
4. **Cost estimator** — estimates cost and requests confirmation when required.
5. **Provider router** — selects compatible providers/tools by task, quality, availability, latency, privacy, and cost.
6. **Workflow executor** — runs approved stages with declared permissions and bounded I/O.
7. **Asset manager** — tracks assets, metadata, and retention.
8. **Render pipeline** — assembles and converts media.
9. **Quality validator** — checks output and retries safely or returns actionable errors.
10. **Usage/cost recorder** — distinguishes provider-reported actual cost from estimates.
11. **Observability** — sanitized errors, latency, provider, skill revision, and job status.
12. **Owner controls** — enable/disable skills and review failures/usage without exposing secrets.

Long-running jobs need progress/status, timeouts, cancellation, idempotency, and bounded retries. Paid generation must not be retried blindly, since that may duplicate charges.

## 10. Implementation phases and approval gates

### Phase 0 — Discovery
- Inspect candidate catalogs and actual package trees.
- Resolve canonical sources and source paths.
- Record revisions, maintenance status, and duplicates.
- Expand coverage for avatars/lip-sync, enhancement, and QA.

**Deliverable:** verified discovery catalog with confidence labels.

### Phase 1 — Audit
- Review source, licenses, dependencies, install scripts, and model/API terms.
- Classify artifact type and cost/auth/hardware requirements.
- Score security, maintenance, compatibility, usefulness, and integration effort.
- Recommend import, adapt, reference, defer, or reject.

**Deliverable:** audited catalog, license/attribution report, security review, and prioritized exact import manifest.

### Phase 2 — Owner review
Show exact file paths, source revisions, licenses, dependencies, required environment-variable names, cost/auth notes, and unresolved risks.

**Gate:** Wait for explicit owner approval before importing packages or provider code, committing implementation code, opening an implementation PR, running migrations, or deploying.

### Phase 3 — Isolated prototype
After approval, work on a separate branch; import a small high-value subset; preserve provenance; keep third-party code isolated; use a sandbox and dummy credentials.

### Phase 4 — Verification
Run static/dependency/security scans, unit tests, mocked integration tests, and authorized controlled live tests. Test valid output, duration, audio sync, captions, cancellation, missing keys, quota exhaustion, timeouts, malformed outputs, provider outages, and secret/content leakage.

### Phase 5 — Pull request/release
Document all files and attribution; include test results and limitations; open a reviewable PR; do not merge or deploy until separately approved. Review production config, billing, privacy, and rollback plan.

## 11. Acceptance criteria

Discovery/audit is complete only when:
- Each entry has canonical source and artifact classification.
- Candidates are deduplicated.
- Revision, license, model/API terms, and attribution are recorded or explicitly unresolved.
- Cost, account, and hardware requirements are explicit or marked unknown.
- Security and maintenance risks are documented.
- Exact proposed files and destination paths are listed.
- High-risk/ambiguous candidates are rejected, deferred, or reference-only.
- No package is copied before owner approval.

An implementation PR is acceptable only when provenance and notices are correct, secrets are absent, tool permissions are explicit, adapters are secure and tested, costs distinguish actual vs estimated, required tests pass, and the owner approves merge/release.

## 12. Open questions

Resolve during discovery:
1. Local-first versus API-backed priorities.
2. Tier-based output duration and format limits.
3. Which providers are already integrated and tested.
4. Available local GPU/runtime capacity.
5. Per-job and per-user cost ceilings.
6. Vendoring versus adaptation versus upstream reference.
7. Commercial-use and attribution rules for selected providers/models.
8. Asset retention, deletion, and consent.
9. Which paid jobs require explicit user confirmation.
10. Policy for copyleft/source-available dependencies.

## 13. Preliminary prioritization

1. Core rendering and validation (e.g. FFmpeg-based workflows).
2. Script, storyboard, and shot planning.
3. Programmatic video (Remotion/Motion Canvas) for repeatable content.
4. Audio, transcription, captions, and alignment.
5. Editing, highlight extraction, and social repurposing.
6. Provider-backed generation after access/cost/terms checks.
7. Avatars/lip-sync after consent and rights safeguards.
8. Automated publishing only after OAuth/platform-policy review.

This is a research priority, not an implementation commitment.

## 14. Current status and next deliverable

This document records the scope and proposed process. The full audit is not complete, and the candidate list is not a verified list of compatible packages.

**Next deliverable:** a verified, deduplicated DISCOVERY_CATALOG.md and exact IMPORT_MANIFEST.md with source paths, revisions, license findings, dependencies, security, cost/auth requirements, and decisions.

**No skill packages or provider integrations should be added until the owner reviews and approves that manifest.**
