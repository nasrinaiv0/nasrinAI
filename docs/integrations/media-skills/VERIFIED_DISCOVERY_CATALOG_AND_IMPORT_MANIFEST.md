# NasrinAI Media Skills — Verified Discovery Catalog & Import Manifest

**Status:** Research snapshot; no third-party packages or skill files imported.
**Target:** `nasrinaiv0/nasrinAI`
**Related plan:** `DISCOVERY_AND_IMPLEMENTATION_PLAN.md`
**Review rule:** This manifest is for review only. It does not authorize copying, installing, executing, or integrating any external code.

## 1. Executive summary

Initial GitHub inspection found several useful, distinct assets beyond the original Higgsfield repository:

- Higgsfield's official skill pack for its own generation/brand workflows.
- Generative Media Skills, a broad media-production knowledge base.
- Comfy-Org Comfy Skills for hosted Comfy Cloud tools and workflows.
- iart.ai Motion Skills for motion graphics and video craft.
- Remotion-specific skills for programmatic, frame-accurate video.
- Video Shotcraft for a large library of reusable shot/motion recipes.
- comfyui-mcp for local-first agent control of ComfyUI.
- OpenMontage, a complete agentic video production system, but under AGPL-3.0 and therefore **legal review required before any adoption**.
- Reference-only catalog repositories for discovering additional tools.

This is a verified *first pass*, not a claim that every skill in these repositories has been reviewed. Repository metadata, README, and LICENSE were inspected for the candidates listed below. A complete import audit still requires per-file review, dependency/license checks, secret scanning, prompt-injection review, and runtime tests.

## 2. Catalog: source, revision, license, type, and decision

Commit SHAs below are the source branch heads observed during this discovery snapshot. Pin any future imports to these SHAs; do not install from a moving branch.

| Candidate | Source revision (branch head) | License evidence | Artifact type | Fit for NasrinAI | Initial decision |
|---|---|---|---|---|---|
| Higgsfield AI Skills | `f83af0bc1d937c8119099a11f8ebbf5e6fb99819` (`main`) | MIT; LICENSE file present | Agent skills; provider-specific workflow instructions | Generation, brand systems, product photoshoots, explainers, thumbnails | **Candidate for isolated skill import** after auditing all 8 skills, setup scripts, CLI/auth requirements, and provider billing. |
| Generative Media Skills | `8c85352d5d75d4dcbe58480bd138e37b9742bab1` (`main`) | MIT; LICENSE file present | Broad agent skill library and executable support | Brief-to-delivery workflows across video, audio, voice, music, 3D, avatars, validation and production craft | **High-priority audit candidate**. README claims 150+ skills / 25 categories; count actual skill directories before repeating that count as verified. Import selectively, not wholesale by default. |
| Comfy-Org Comfy Skills | `b0fc74c0fc83709c5538df578615f876d4ed52d6` (`main`) | MIT; LICENSE file present | Agent skills + hosted MCP integration | Generate/edit video, image, audio and 3D; search models/nodes/templates; run Comfy Cloud workflows | **Candidate for adapter-based integration**, not blind install. Requires Comfy Cloud account/OAuth and hosted service; not automatically free. |
| iart.ai Motion Skills | `238dfc55aac123d4649be39adfe58c43193ca349` (`master`) | MIT; LICENSE file present | Skill collection and installable packs | Motion graphics, kinetic typography, explainers, Shorts, 3D/WebGL, lower thirds, talking-head/B-roll and web motion | **High-priority selective audit**. README advertises 56 skills / 19 packs; verify the current tree and each pack's dependencies before import. |
| Claude Remotion Skill | `1dcbe5e3fc6cf970bd10d3cc05f0a8a5d19d0383` (`main`) | MIT; LICENSE file present | Agent skill using Remotion | Programmatic video, captions, transitions, motion design, sound direction and render/inspect/fix loop | **Candidate for prototype** after checking Remotion license/commercial terms and Node/browser rendering dependencies. |
| Remotion Motion Graphics Skill | `b860c7921f2220b9e2a84e815ba0ae7b10858f08` (`main`) | MIT; LICENSE file present | Agent skills | Broadcast-style graphics, kinetic text, diagrams, terminal demos, editorial highlights | **Candidate for selective import**. Deduplicate overlapping instructions with other Remotion skills. |
| Video Shotcraft | `43bd349a136651865ecfa6ea1cf012f6e957d304` (`main`) | Apache-2.0; LICENSE file present | Skill + reusable shot/recipe library | Storyboard planning and repeatable product/brand motion shots; README advertises 150+ shots | **Candidate for reference/library evaluation**. Inspect asset size, media licensing, dependencies, and generated output licensing before bundling. |
| comfyui-mcp | `54faae2cfd3515523c1ac0c2323ec1190a24dee6` (`main`) | MIT; LICENSE file present | MCP server / local orchestration tool | Local-first ComfyUI workflow authoring and execution for image/video/audio | **Integration candidate, not an agent-skill import**. Requires separate threat model, local process/network permissions review, and optional hosted-model credentials. |
| OpenMontage | `e01dbf433f46eeb91d39bf905e194162921019a3` (`main`) | AGPL-3.0; LICENSE file present | Full agentic video production system | Multi-stage video pipeline, providers, orchestration, editing and delivery | **Do not copy or embed yet. Legal review required.** Prefer architecture study or separately deployed service pending license and network-copyleft analysis. |
| Mersiv Media Hermes Agent Skills | `08166d4f500799468f7db10589dba91766ea3a7e` (`main`) | No root LICENSE found at inspected path | 72-skill collection, mixed-purpose agent instructions | Has media-specific skills for ComfyUI, video graph authoring, narration/revoice, voice change and film craft | **Reference-only / blocked for import** until explicit license and redistribution permissions are established. Contains broad non-media material; filter by relevance. |
| Awesome Faceless Content Creation | `74f17067dcdaea38052e8ae96e9c2e130c4b8ee0` (`main`) | CC0-1.0; LICENSE file present | Curated external-tool catalog | Discover tools for scripts, TTS, generation, editing, publishing and analytics | **Reference-only**. Do not treat listed third-party products as open-source or free just because the list is CC0. |
| Awesome AI Video Editing | `c6cc0ca72ecf7a83358fcf247ad414379cb8905d` (`main`) | CC0-1.0; LICENSE file present | Curated external-tool catalog | Discover agent-native tools, MCP servers, generation/inference, editors, avatars and audio tools | **Reference-only**. Independently verify every linked repository, current license, status and price before adoption. |

## 3. Skills and capability map

This is a capability map, not a promise that every workflow works without paid services.

| Capability | Best candidates to inspect first | Runtime / cost considerations |
|---|---|---|
| Higgsfield image/video generation and brand workflows | Higgsfield AI Skills | Provider account, CLI/auth, model-specific credits or subscription may be required. Do not label it “free generation” based solely on the skill's license. |
| Creative direction, shot planning, continuity, rights/provenance and production QA | Generative Media Skills | Mostly reusable instructions/knowledge; individual tools/providers may incur separate costs. |
| Hosted workflow generation through Comfy Cloud | Comfy-Org Comfy Skills | Hosted service and OAuth; check plan limits and model availability at runtime. |
| Local image/video/audio pipelines | comfyui-mcp + ComfyUI | Local compute/GPU, custom nodes and model weights; model licenses vary. MCP execution must be sandboxed. |
| Motion graphics, explainers, social clips and captions | iart.ai Motion Skills | Rendering packages and external media assets; verify each skill's toolchain and any provider dependency. |
| React/programmatic video rendering | Remotion skill candidates | Node.js/React/browser/render dependencies. Verify current Remotion licensing and commercial use terms independently. |
| Reusable shot libraries and storyboards | Video Shotcraft | Review included assets, licensing and repository footprint; prefer recipes over bundling large media assets. |
| End-to-end agentic video pipeline | OpenMontage | AGPL-3.0 has distribution/network-use implications; legal review required. Provider/API costs likely vary. |
| Voiceover, transcription, revoice and audio cleanup | Generative Media Skills; Mersiv (reference-only); later Whisper/WhisperX/Demucs/Piper audit | Local and API options differ. Voice cloning/revoice requires consent and careful handling of personal data. |
| Tool discovery / marketing automation | CC0 catalogs above | The catalog license covers the list, not the listed tools, APIs, logos, model weights or assets. |

## 4. Exact import manifest — proposed, not executed

No third-party source files have been copied into NasrinAI. The following is the recommended review queue.

### Queue A — audit first

1. **Higgsfield AI Skills** — inspect each of the eight skill folders individually. Confirm CLI installation behavior, auth flow, API/credit model, shell commands, network destinations, and any setup scripts. Import only the specific skills that fit Video Studio.
2. **Comfy-Org Comfy Skills** — inspect skill definitions and MCP configuration. Design a NasrinAI-owned adapter around the supported tool contract; do not expose user credentials to prompt text or browser/client code.
3. **Generative Media Skills** — enumerate the repository's actual skills, produce a deduplicated inventory by capability, and select only high-value skills after per-file license/security review.
4. **iart.ai Motion Skills** — inventory the root repo and pack repositories; select a small set of non-overlapping skills for motion graphics, explainers, social vertical video and talking-head/B-roll.
5. **Remotion skill candidates** — compare both candidates, select one canonical baseline where overlap exists, then prototype a deterministic render → frame inspection → fix loop.
6. **Video Shotcraft** — evaluate a limited recipe subset; avoid adding the entire media asset library until size, license and build impact are known.

### Queue B — separate integration spike

- **comfyui-mcp**: evaluate as a separately deployed/isolated MCP tool. Require explicit owner/user enablement, allowlisted network destinations, bounded execution time and resource usage, sanitized logs, and no arbitrary unauthenticated access to a user's local ComfyUI.
- **OpenMontage**: no code reuse until legal review resolves AGPL-3.0 implications and deployment boundaries.
- **Mersiv Media Hermes Agent Skills**: no copying until a valid license is found and reviewed.
- **CC0 catalogs**: retain links and metadata only; never bulk-copy the linked projects.

### Proposed manifest fields for the machine-readable registry

Each approved skill/tool entry should include:

- Stable internal ID and display name
- Source URL, repository owner/name, exact commit SHA, source path, and retrieval date
- License identifier, license file path, attribution obligations, and review status
- Artifact type: `agent_skill`, `mcp_tool`, `provider_adapter`, `library`, `model_weights`, `standalone_service`, or `reference_only`
- Capability tags, supported input/output media, expected output formats
- Dependencies and minimum versions; install/build steps
- Network endpoints, filesystem access, shell execution, and secret requirements
- Authentication scopes, data sent to third parties, retention implications
- Cost class: `local_compute`, `free_tier_limited`, `api_paid_or_credits`, `subscription`, `mixed`, or `unknown`
- Entitlement requirements by NasrinAI plan, provider-routing requirements, estimated cost method
- Security review, license review, automated test status, human approval status
- Import mode: `copy_with_attribution`, `adapt_after_review`, `separate_service`, `reference_only`, or `rejected`

## 5. Security and quality gates before any import

- Read all skill instructions and scripts; search for credential exfiltration, prompt injection, hidden instructions, destructive commands, shell/network execution and untrusted downloads.
- Check all transitive dependencies, licenses, package lifecycle scripts, binaries, model weights and media assets separately.
- Never execute a third-party install script directly in a developer or production environment. Inspect it and run it only in an isolated sandbox if approved.
- Never store provider keys in skills, examples, browser code, client bundles, prompts, logs or generated assets. Use server-side secret management and least-privilege credentials.
- Treat skill text and remote tool outputs as untrusted inputs. Skills cannot override NasrinAI system policies, access controls, plan entitlements or safety checks.
- Use a tool allowlist, constrained filesystem, egress controls, execution timeout, output-size limit, per-user concurrency and budget ceilings.
- Do not claim a provider, model, or workflow is free until the current provider plan, rate limits, commercial rights and actual request path are verified.
- Track estimated and actual costs, provider/model, source skill version, latency, errors, generated asset IDs and user consent in server-side telemetry without logging secrets or unnecessary personal content.
- Test mobile-first UX, cancellation, retry/idempotency, failed renders, quota exhaustion, timeout recovery, unsafe input, and generated asset retention/deletion.
- Require a human approval step before enabling newly imported skills in production.

## 6. Implementation order after review

1. Complete per-skill inventories and legal/security review for Queue A.
2. Approve a small initial set; record the approval in this manifest.
3. Implement the internal skill registry and policy gate without importing every candidate.
4. Add one isolated provider/tool adapter at a time with explicit schemas and server-side credential handling.
5. Build a sandboxed prototype and test representative prompts across text-to-video, storyboard-to-video, motion graphics, captions and post-production.
6. Run license/security scans and functional tests; document costs and failure modes.
7. Open a separate implementation PR. Keep skill content, adapters and UI changes isolated so they can be reverted independently.

## 7. Source references

- Higgsfield AI Skills — https://github.com/higgsfield-ai/skills
- Generative Media Skills — https://github.com/calesthio/generative-media-skills
- Comfy Skills — https://github.com/Comfy-Org/comfy-skills
- Motion Skills — https://github.com/iart-ai/motion-skills
- Claude Remotion Skill — https://github.com/haidrrrry/claude-remotion-skill
- Remotion Motion Graphics Skill — https://github.com/Liamrjohnston/remotion-motion-graphics-skill
- Video Shotcraft — https://github.com/Vincentwei1021/video-shotcraft
- comfyui-mcp — https://github.com/artokun/comfyui-mcp
- OpenMontage — https://github.com/calesthio/OpenMontage
- Mersiv Media Hermes Agent Skills — https://github.com/MersivMedia/mersiv-media-hermes-agent-skills
- Awesome Faceless — https://github.com/sasharun/awesome-faceless
- Awesome AI Video Editing — https://github.com/Supersynergy/awesome-ai-video-editing

## 8. Limitations of this snapshot

- A GitHub branch-head SHA is a reproducibility pin, not a guarantee of safety or quality.
- README descriptions and advertised skill counts are upstream claims until independently enumerated and tested.
- License presence does not prove that every included asset, dependency, model weight, brand, or sample is covered by that license.
- Prices, free tiers, hosted model availability and provider terms change; verify immediately before implementation.
- This file does not install anything, change application code, add secrets, configure production providers, or authorize merging.


## 9. Per-skill import manifest: official Higgsfield pack

Inspected each `SKILL.md` at source commit `f83af0bc1d937c8119099a11f8ebbf5e6fb99819` (Higgsfield repository `main`, MIT root license). These are candidate decisions only; none has been copied into NasrinAI.

| Skill ID | Source path | Blob SHA of inspected SKILL.md | Scope | NasrinAI decision |
|---|---|---|---|---|
| `higgsfield-generate` | `higgsfield-generate/SKILL.md` | `67189d84a99432c6429ecfa8b9c02b8571a90624` | General image/video/3D/audio generation, Marketing Studio ads and Virality Predictor | **Priority candidate** for Video Studio. Requires Higgsfield CLI/auth and external generation services; bootstrap currently instructs `curl ... | sh`, which must be replaced by reviewed/pinned installation or omitted. |
| `higgsfield-soul-id` | `higgsfield-soul-id/SKILL.md` | `34d5604c5e17dfc1200211b13ec4424023b80340` | Train reusable identity/face model for consistent generations | **Defer / sensitive capability**. Require explicit consent, data retention/deletion disclosure, provider terms review, and no identity training without user intent. Same CLI install/auth concern. |
| `higgsfield-product-photoshoot` | `higgsfield-product-photoshoot/SKILL.md` | `95d2f3f8456078a338399b81eaa792fb5c0bc653` | Product photography, lifestyle scenes, ad creatives and catalog images | **Candidate** for image/product workflows, not a core video skill. API/backend enhancement and paid image-generation costs likely; verify current pricing and asset rights. |
| `higgsfield-brandkit` | `higgsfield-brandkit/SKILL.md` | `489c80420126656d773cffa99786a14f75d48683` | Brand systems, palettes, logo marks, mockups, social graphics, packaging and editable brandbooks | **Candidate after filesystem review**. Writes durable local project files and generates editable deliverables; sandbox writes and output path boundaries are required. |
| `higgsfield-marketplace-cards` | `higgsfield-marketplace-cards/SKILL.md` | `e0e44beaa984cb7350f4bde4b706573cd1653e4c` | Marketplace listing cards, product infographics and A+ modules | **Optional candidate** if NasrinAI supports commerce creators. Provider backend enforces marketplace templates; do not promise platform compliance without validating final output. |
| `higgsfield-websites` | `higgsfield-websites/SKILL.md` | `e464679d62ee130bfe79c67dc39fd6287bc41f2c` | Build/deploy full-stack websites/apps/games via Higgsfield CLI | **Exclude from the media-skills initial set**. It is a broad website/game deployment workflow, outside the initial video skill scope, with filesystem, Git, package manager and cloud deployment side effects. |
| `higgsfield-video-explainer` | `higgsfield-video-explainer/SKILL.md` | `8f50a15dda4a9c8a448d4ccbd1cdc1267ed65b2b` | Narrated explainer/story videos assembled from ordered blocks | **High-priority candidate** for text/document-to-video. Requires multiple generation steps, provider/model calls, server-side assembly, subtitles handling, and a cost/latency budget. |
| `higgsfield-youtube-thumbnail` | `higgsfield-youtube-thumbnail/SKILL.md` | `fca52c8eee762fdd2fa53d9708480a2098c91670` | YouTube thumbnails and vertical video covers | **Optional companion skill**. Include only if thumbnail generation belongs in Video Studio; enforce truthful topic representation and protect referenced faces/logos. |

### Higgsfield-specific security and runtime findings

- The official skill files use `allowed-tools: Bash` and several instruct the agent to install the Higgsfield CLI using a remote shell script piped directly into `sh`. Do **not** run that bootstrap as-is inside a NasrinAI server or user environment. Inspect and pin the installer, or make CLI installation a separate opt-in deployment step.
- These are instructions for an agent operating a CLI, not a self-contained free model. The MIT license covers the repository's licensed code/instructions; it does not make the Higgsfield service, models, credits, generated assets or API access free.
- Provider API keys and auth must remain server-side. Never let a generated prompt, downloaded reference, skill text, or model response change allowed endpoints, read arbitrary files, or execute unrestricted shell commands.
- Keep this pack's skills separate from the NasrinAI provider adapter. A skill may express intent/workflow, but NasrinAI's server-side router must independently enforce authentication, plan limits, consent, cost ceiling, safety, allowed model/provider, timeout and audit logging.
- The source version above reports skill version `0.13.0` in frontmatter. Re-check the pinned source before importing and preserve attribution/license files.



## 10. Complete inventory: Generative Media Skills (tree-enumerated)

**Inventory snapshot:** 153 `SKILL.md` entrypoints enumerated from the recursive Git tree at `main` on 2026-10-27. The upstream index also reports 153 integrated skill packages. Tree listing is complete (`truncated=false`). This is an entrypoint inventory, not a full security review of each skill's supporting files.

Source: https://github.com/calesthio/generative-media-skills  
Index: https://github.com/calesthio/generative-media-skills/blob/main/SKILL_INDEX.md

### production/3d-craft (2)

- `3d-asset-production`
- `neural-reality-capture`

### production/audio-craft (7)

- `audio-mixing-mastering`
- `captions-media-accessibility`
- `dialogue-editing-adr`
- `localization-dubbing-production`
- `music-supervision-scoring`
- `sound-design-foley`
- `video-to-audio-foley`

### production/content-formats (23)

- `anime-animation-production`
- `audiobook-production`
- `avatar-spokesperson-production`
- `brand-launch-film-production`
- `cinematic-trailer-production`
- `documentary-montage-production`
- `ecommerce-product-imagery`
- `educational-animation-production`
- `explainer-video-production`
- `fashion-campaign-production`
- `food-beverage-content-production`
- `game-trailer-production`
- `immersive-spatial-video-production`
- `livestream-event-production`
- `music-video-production`
- `podcast-production`
- `product-ad-production`
- `real-estate-content-production`
- `saas-product-demo-production`
- `screen-demo-production`
- `social-short-production`
- `talking-head-podcast-recut`
- `ugc-ad-production`

### production/creative-direction (9)

- `2d-character-rig-animation`
- `character-design-continuity`
- `cinematic-shot-direction`
- `lighting-direction`
- `performance-direction`
- `precise-video-description`
- `production-design-direction`
- `storyboard-previsualization`
- `visual-style-direction`

### production/governance-delivery (6)

- `asset-continuity-management`
- `generated-media-qa`
- `media-provenance-rights`
- `media-qc-delivery`
- `reference-media-analysis`
- `video-description-oversight`

### production/post-production (6)

- `color-grading-finishing`
- `editing-montage`
- `motion-graphics-direction`
- `still-image-retouching-finishing`
- `title-kinetic-typography`
- `vfx-compositing`

### production/runtime-assembly (12)

- `audio-reactive-video-composition`
- `comfyui-media-workflows`
- `d3-animated-data-visualization`
- `ffmpeg-media-finishing`
- `gsap-animation-composition`
- `hyperframes-video-composition`
- `lottie-animation-delivery`
- `manim-explainer-animation`
- `procedural-canvas-animation`
- `remotion-video-composition`
- `threejs-scene-composition`
- `virtual-production-icvfx`

### providers/3d-generation (3)

- `meshy-3d`
- `tencent-hunyuan3d`
- `tripo-3d`

### providers/audio-enhancement (1)

- `nvidia-maxine-audio-effects`

### providers/avatar-video (5)

- `d-id-avatar-video`
- `hedra-character-video`
- `heygen-avatar-video`
- `synthesia-avatar-video`
- `tavus-replica-video`

### providers/image-generation (18)

- `adobe-firefly-image`
- `alibaba-image-models`
- `amazon-nova-canvas`
- `black-forest-labs-flux`
- `bria-fibo-image`
- `bytedance-seedream`
- `google-gemini-image`
- `ideogram-image`
- `image-generation-gateways`
- `kling-kolors-image`
- `leonardo-image`
- `luma-photon`
- `midjourney-image`
- `openai-gpt-image`
- `recraft-image-design`
- `runway-image`
- `stability-ai-image`
- `xai-grok-imagine-image`

### providers/image-understanding (2)

- `amazon-rekognition`
- `google-cloud-vision`

### providers/lip-sync (2)

- `kling-advanced-lip-sync`
- `sync-labs-lipsync`

### providers/motion-capture (2)

- `deepmotion-animate-3d`
- `move-ai-motion-capture`

### providers/music-generation (5)

- `ace-step`
- `elevenlabs-music`
- `google-lyria`
- `minimax-music`
- `suno-music`

### providers/sound-generation (2)

- `elevenlabs-sound-effects`
- `stable-audio`

### providers/source-separation (1)

- `audioshake-stem-separation`

### providers/speech-and-voice (6)

- `azure-speech`
- `deepgram-speech`
- `elevenlabs-dubbing-voice-conversion`
- `google-cloud-speech`
- `nvidia-speech-nim`
- `openai-audio`

### providers/speech-to-text (3)

- `amazon-transcribe`
- `assemblyai-transcription`
- `elevenlabs-scribe`

### providers/text-to-speech (11)

- `amazon-polly`
- `byteplus-seed-speech-tts`
- `cartesia-sonic`
- `elevenlabs-tts`
- `fish-audio-tts`
- `hume-octave`
- `kokoro-tts`
- `minimax-speech`
- `qwen3-tts`
- `resemble-chatterbox`
- `volcengine-doubao-speech-tts`

### providers/video-enhancement (1)

- `topaz-video-enhancement`

### providers/video-generation (19)

- `alibaba-wan-video`
- `amazon-nova-reel`
- `google-gemini-omni-video`
- `google-veo`
- `higgsfield-video`
- `kling-video`
- `ltx-2-video`
- `luma-ray-video`
- `midjourney-video`
- `minimax-hailuo-video`
- `moonvalley-marey`
- `nvidia-cosmos-video`
- `pika-video`
- `runway-video`
- `seedance-2-0`
- `tencent-hunyuanvideo`
- `video-generation-gateways`
- `vidu-video`
- `xai-grok-imagine-video`

### providers/video-understanding (1)

- `twelvelabs-video-understanding`

### providers/voice-agents (4)

- `elevenlabs-agents`
- `gemini-live-audio`
- `hume-evi`
- `openai-realtime-voice`

### providers/world-models (2)

- `odyssey-interactive-video`
- `world-labs-marble`

### First-pass priority audit set

Start with provider-independent capabilities and video workflow skills that can benefit multiple NasrinAI plans, then audit provider-specific skills separately:

**Production workflow and QA**
- `production/content-formats/explainer-video-production`
- `production/content-formats/social-short-production`
- `production/content-formats/talking-head-podcast-recut`
- `production/content-formats/ugc-ad-production`
- `production/content-formats/brand-launch-film-production`
- `production/content-formats/documentary-montage-production`
- `production/creative-direction/storyboard-previsualization`
- `production/creative-direction/character-design-continuity`
- `production/creative-direction/cinematic-shot-direction`
- `production/creative-direction/precise-video-description`
- `production/post-production/editing-montage`
- `production/post-production/color-grading-finishing`
- `production/post-production/motion-graphics-direction`
- `production/post-production/title-kinetic-typography`
- `production/governance-delivery/generated-media-qa`
- `production/governance-delivery/media-provenance-rights`
- `production/governance-delivery/media-qc-delivery`
- `production/governance-delivery/asset-continuity-management`
- `production/runtime-assembly/ffmpeg-media-finishing`
- `production/runtime-assembly/remotion-video-composition`
- `production/runtime-assembly/comfyui-media-workflows`
- `production/runtime-assembly/hyperframes-video-composition`

**Video generation provider skills (separate cost/legal/API review required)**
- `providers/video-generation/higgsfield-video`
- `providers/video-generation/google-veo`
- `providers/video-generation/seedance-2-0`
- `providers/video-generation/runway-video`
- `providers/video-generation/kling-video`
- `providers/video-generation/ltx-2-video`
- `providers/video-generation/alibaba-wan-video`
- `providers/video-generation/tencent-hunyuanvideo`
- `providers/video-generation/video-generation-gateways`

**Audio, captions and narration**
- `production/audio-craft/captions-media-accessibility`
- `production/audio-craft/dialogue-editing-adr`
- `production/audio-craft/localization-dubbing-production`
- `production/audio-craft/sound-design-foley`
- `providers/speech-to-text/assemblyai-transcription`
- `providers/text-to-speech/elevenlabs-tts`
- `providers/text-to-speech/kokoro-tts`
- `providers/music-generation/elevenlabs-music`
- `providers/sound-generation/elevenlabs-sound-effects`

**Review criteria per skill:** source evidence and last-verified date; claims/pricing freshness; external provider and account requirements; free-tier vs paid classification; scripts and transitive dependencies; outbound endpoints and permissions; sensitive data/consent; output rights; overlap with existing NasrinAI capabilities; testable acceptance criteria. No skill is approved for import based on its name alone.

## 11. Motion Skills collection — complete pack inventory

The inspected `iart-ai/motion-skills` README currently advertises **56 skills across 19 installable packs** and MIT licensing. This repository is an index/installer surface; its root tree contains a `tools/` directory but no root-level `SKILL.md` entries, because the packs are separate repositories. Therefore, per-skill source SHAs and file-level license/security review must be done against each selected pack repository before importing.

Source: https://github.com/iart-ai/motion-skills

| Pack | Advertised skills | Recommended review priority |
|---|---:|---|
| `tiktok-video-skills` | 4 | High |
| `text-message-video-skills` | 1 | Medium |
| `youtube-video-skills` | 2 | High |
| `ecommerce-video-skills` | 3 | High |
| `ad-video-skills` | 3 | High |
| `data-animation-skills` | 3 | Medium |
| `explainer-video-skills` | 5 | High |
| `map-animation-skills` | 1 | Low |
| `web-animation-skills` | 9 | Low for Video Studio; useful for web UI |
| `motion-design-skills` | 9 | High |
| `kinetic-typography-skills` | 1 | High |
| `freelance-motion-skills` | 5 | Medium |
| `webgl-animation-skills` | 3 | Low/advanced |
| `manim-skills` | 1 | Medium/education |
| `generative-illustration-skills` | 1 | Medium |
| `javascript-animation-skills` | 2 | Medium |
| `lower-thirds-skills` | 1 | High |
| `b-roll-skills` | 1 | High |
| `talking-head-skills` | 1 | High, but review likeness/voice consent and provider costs |

Recommended order: short-form, explainers, motion design, kinetic typography, e-commerce/ad video, lower thirds and B-roll first; advanced WebGL/Manim/web animation later. Do not infer the contents of a pack solely from its name; inspect each pack's actual tree and license.

## 12. Comfy Skills — current tree inventory

Source: https://github.com/Comfy-Org/comfy-skills  
Root license: MIT (verified in the previous pass). Recursive tree snapshot lists one entrypoint: `openclaw/comfy/SKILL.md`. This is a small, integration-oriented collection rather than a broad standalone catalog. Review its MCP/cloud auth requirements, network requests, workflow execution boundaries and current Comfy Cloud pricing before adopting it.

## 13. Inventory completion status

- [x] Enumerated all 153 `SKILL.md` entrypoints in Generative Media Skills from a non-truncated recursive tree.
- [x] Grouped all 153 by source category and recorded exact source paths in this document.
- [x] Recorded a priority audit shortlist spanning production, QA, assembly, video generation and audio.
- [x] Recorded the 19-pack Motion Skills catalog and advertised skill counts.
- [x] Confirmed the Comfy Skills repository currently exposes one `SKILL.md` entrypoint in the inspected recursive tree.
- [ ] Inspect every candidate skill's full content, optional scripts, references, assets, dependencies and endpoints.
- [ ] Verify each selected Motion Skills pack's repository URL, current commit, exact license and skill contents.
- [ ] Finish provider pricing/free-tier verification and output-rights review.
- [ ] Obtain explicit approval of the final import set before any third-party files are copied.



## 14. Focused content and execution review — priority candidates

Review date: 2026-10-27. This is a focused review of selected skill entrypoints and scripts, not a complete line-by-line audit of all 153 skills.

### Findings from Generative Media Skills

The upstream `AGENTS.md` and `METHODOLOGY.md` were inspected first, as the project requires. Its package contract separates production-facing `SKILL.md` plus optional `scripts/`, `references/`, and `assets/` from repository-only `EVAL.md` and `tests/`. This is a good pattern for NasrinAI: evaluations and answer keys must never be exposed to production agents.

Selected skill files inspected at source commit `8c85352d5d75d4dcbe58480bd138e37b9742bab1`:

| Skill | Inspected entrypoint SHA | Useful characteristics | Risk / follow-up |
|---|---|---|---|
| `explainer-video-production` | `6967d8ac332c43a736ac91fc0b097ceaf4d26b49` | Provider-independent brief-to-explainer workflow, claim log, accessibility and QA | Good high-priority candidate; review references and evaluation tasks before import. |
| `social-short-production` | `7f80fa118347c7048a369e5b2413c33f17f8bf29` | Short-form narrative, captions, platform-aware delivery; explicitly separates evidence from heuristics | Avoid turning retention heuristics into universal rules; recheck platform facts. |
| `storyboard-previsualization` | `0e77a28d2c10bab3bd17b3ec98121e25506f550e` | Shot-by-shot boards and previs before expensive generation | Good low-cost planning candidate. |
| `generated-media-qa` | `6c2f58f73b4c55ae2ccc8f1b47ae417462fe53b6` | Acceptance frame, measured defects and reproducible QA reporting | Contains a Python script and tests; inspect/test script in isolation before bundling. |
| `media-provenance-rights` | `b715bac2d35d4357fac56c808c9ca755f872488a` | Consent, rights, disclosure and provenance governance | Good policy-support candidate; must remain guidance, not automated legal clearance. |
| `editing-montage` | `eaaa3ffd5409d9ee2c2e37f4b57063f3d62fcf89` | Editing structure, pacing, continuity and revision workflow | Good provider-independent workflow candidate. |
| `ffmpeg-media-finishing` | `3162c7f4134b5898b3559feac9c82a84482d9992` | Probe-first deterministic finishing, export variants, checksums and delivery records | Contains a Python media-probe script and tests; subprocess/tool invocation must be constrained in NasrinAI's executor. |
| `remotion-video-composition` | `f7b95a594d229ac3ee0845f5ae961e05064d5799` | React/Remotion composition, rendering and reproducible media package | Verify current Remotion licensing, dependency versions, and server-render resource limits. |
| `higgsfield-video` | `f1941027c80012a4ce17d2210b6132e12dd05da3` | Provider-specific model selection and aggregator-level workflows | Provider terms/pricing are volatile; source content has July 2026 verification dates and must be refreshed before production. |
| `google-veo` | `f6b4a48d767f13d6593940bde0ffab2714c1d1e1` | Route/model selection, async tasks, input modes and troubleshooting | Recheck model lifecycle, pricing, quota, region, and terms; source claims are dated July 2026. |
| `seedance-2-0` | `81f29e932f80f1dc38cf409c4eb9fec1c53538dd` | Direct model/gateway selection, reference input and native audio workflows | Gateway IDs and schemas vary; must be validated against current official docs and a non-production preflight. |
| `runway-video` | `0ad6143f5d0eb2b5c0dbb7756629c9d806ee6c1d` | Explicit paid-call approval, duplicate-create protection, async tasks and secure media transfer | Long provider-specific guide; refresh July 2026 claims and review all API calls before using it as an execution contract. |

The tree confirms each selected skill has a required `EVAL.md`; the QA and FFmpeg skills additionally contain executable helper scripts and corresponding tests. Do not bundle the evaluation files or tests into production-facing skill packages. The script presence is not proof that the script has been executed or passed in NasrinAI.

### Findings from selected iart.ai Motion Skills packs

The upstream index README was updated after the earlier snapshot. Corrected count: **56 skills across 19 packs**, including `talking-head-skills`. The individual pack repos expose skill folders but, for the inspected packs, no `EVAL.md` files were found in their recursive trees. This does not automatically disqualify them, but NasrinAI should author its own acceptance/evaluation tests before adoption.

| Pack | Pinned branch-head SHA | License metadata | Inspected skill/file | Key finding |
|---|---|---|---|---|
| `tiktok-video-skills` | `2a775336b5a638cbf8a61dbd785f9a1b649be016` | MIT | `skills/short-form-video/SKILL.md` SHA `7bc689429479a7f3364670770429840ba945bc3e` | Strong short-form workflow candidate. Some rhetoric frames retention in absolute terms; NasrinAI should label retention suggestions as hypotheses and avoid algorithmic guarantees. |
| `explainer-video-skills` | `3e2d411b725d9a72939cf8e5eb81579e751373e7` | MIT | `skills/explainer-video/SKILL.md` SHA `5855ace8f27c74e4d55201bc764552767e7fea6b` | Useful script → storyboard → scene → narration/caption sync workflow. Overlaps with Generative Media Skills; compare before selecting one or merging concepts. |
| `motion-design-skills` | `3c129f769d90a1328c209c386492333c9ac62312` | MIT | `skills/remotion-video/SKILL.md` SHA `a88f52ad273a0f39d8f65a378e3742ca2a82c259` | Useful programmatic video recipe. Pack includes After Effects JSX scripts; any scripting workflow must be explicitly scoped to a user-authorized local project and not run in a server by default. |
| `lower-thirds-skills` | `aa8ef7ed9fa59d0a79fc57701e493cfd8197b5d8` | MIT | `skills/lower-thirds/scripts/render.mjs` SHA `38c94f5649c5f283b097401fe18475aa7d98eaaa` | Requires Node 18+, Playwright/Chromium and FFmpeg; launches browser/render processes and writes outputs to working paths. Run only in a bounded worker with explicit input/output directories, time/memory limits, and safe path validation. |
| `b-roll-skills` | `a51e34b0a8def533759373733bde1869c21075fb` | MIT | `skills/talking-head-b-roll/scripts/transcribe.mjs` SHA `07f3ef0623a57f40296a5f21aa9abf7decac86df` | Can use local Whisper or ElevenLabs API. It reads local media, invokes `ffprobe`, may send audio to an external transcription provider, and writes transcript output; require clear disclosure/consent, server-side key handling, and explicit local-vs-cloud choice. |
| `talking-head-skills` | `a315032ccffa94cda56a82fa306237250d3dd1bf` | MIT | Pack added to index; not yet fully inspected file-by-file | Keep in high-priority follow-up, but require likeness/voice consent, provider-cost disclosure, and a deeper script/endpoint review before import. |

Additional high-priority packs have verified repository metadata showing MIT: `youtube-video-skills` at `f3df381d65abe5078f5ed410bbc3ed72e7cb92bd`, `ecommerce-video-skills` at `2bd0dd19c9b2df5230f5d8f7453861b9681e49b4`, `ad-video-skills` at `0de0f2a1c1f42a98103fc0ec436509276428372c`, and `kinetic-typography-skills` at `fccc94bd325d824235ee9e715e65abde57b6513a`. Their complete file-level review remains pending.

### Revised candidate ranking

**Tier A — best initial skill-only candidates**
1. `storyboard-previsualization`
2. `explainer-video-production`
3. `social-short-production`
4. `editing-montage`
5. `generated-media-qa` (after script/test review)
6. `media-provenance-rights`
7. `ffmpeg-media-finishing` (after script/test review)
8. `short-form-video` (after rewriting absolute retention claims as testable heuristics)
9. `explainer-video` (compare with provider-independent candidate before selecting)
10. `remotion-video-composition` / `remotion-video` (select one baseline after overlap and license review)

**Tier B — provider integrations, not “free skills”**
- Higgsfield, Veo, Seedance, Runway and other model/provider skills. Their instructions may be MIT-licensed, but generation calls can be paid and require credentials. Confirm current API availability, actual plan cost, output rights, retention, and privacy before enabling.

**Tier C — tool/worker integrations**
- ComfyUI MCP, lower-third renderers, B-roll transcription scripts, After Effects JSX. These execute tools, access files, spawn processes, or send media to providers. Keep them out of the core agent runtime until sandboxing and explicit user consent are implemented.

## 15. Current blockers and safe next action

1. The 153-skill inventory is complete at the entrypoint/path level, but only the focused subset above has had full entrypoint content inspected.
2. Provider-specific claims were often verified in July 2026; as of 2026-10-27, pricing, model availability, quotas, endpoint schemas and commercial terms must be refreshed before a real call.
3. Several motion packs contain executable scripts but lack repository-visible `EVAL.md` files. Create NasrinAI-owned tests rather than assuming upstream instructions are reliable.
4. No third-party source has been copied into the NasrinAI runtime, and no skill is approved for production yet.
5. Next, finish file-by-file review of Tier A's supporting resources and test the small QA/FFmpeg scripts in an isolated sandbox. Then submit a proposed import manifest for approval before creating a separate implementation PR.



## 16. Static review of helper scripts and test coverage

Pinned source: `8c85352d5d75d4dcbe58480bd138e37b9742bab1`.

| File | Source SHA | Static review result | Status |
|---|---|---|---|
| `generated-media-qa/scripts/normalize_qa_report.py` | `fd67b2549502e39736d8e54915eb3831b7f6115f` | Python 3.11+ standard library only; reads a JSON report and optional policy; can write a normalized report to a caller-selected path; no network or subprocess imports detected in the inspected imports. Path authorization and overwrite policy still need to be imposed by the NasrinAI worker. | Static review only; tests not executed here. |
| `generated-media-qa/tests/test_normalize_qa_report.py` | `d9f807ed5f8256aa88f6ad06a8dafed693ceaf3b` | Standard-library `unittest`; imports the helper directly. | Present; not run. |
| `ffmpeg-media-finishing/scripts/media_probe.py` | `2ec1c7a0eca02759c3bb3ddd8f0fddbc8ac41b55` | Uses `subprocess.run` to invoke `ffprobe`, captures output and sets a timeout. It accepts an executable path/name and a media path; the NasrinAI wrapper must not allow user-controlled arbitrary executable paths. Run only in a restricted worker with allowlisted `ffprobe`, file-size caps, timeouts, and sandboxed paths. | Static review only; tests not executed here. |
| `ffmpeg-media-finishing/tests/test_media_probe.py` | `07445e98d01411a278596f4f4aaeb7fb364e31af` | Standard-library `unittest`; uses mocks for subprocess behavior and temporary files, and includes probe-result/timeout/malformed-output cases. | Present; not run. |

### Test execution limitation

The source and test files were inspected through the GitHub connector, but the external files could not be retrieved into the isolated runtime for execution in this pass. Therefore, **no claim is made that these upstream tests pass**, and no tests were run in the NasrinAI repository. Before adoption, fetch the exact pinned files into an isolated disposable environment, verify their checksums, inspect them, then run the upstream tests and add NasrinAI-specific tests. Do not execute third-party scripts directly on production infrastructure.

### Current gate decision

- The provider-independent text-only production skills remain the safest initial candidates because they avoid provider calls and executable dependencies.
- The QA and FFmpeg helpers are **conditional candidates** pending sandbox tests and filesystem/process controls.
- Provider-specific skills remain guidance only until their facts and APIs are refreshed against official documentation and actual costs are verified.
- No source files have been copied into NasrinAI; no production integration or database/configuration changes have been made.



## 17. Documentation package status — 2026-10-27

Added review documents on the same draft branch:
- `SKILL_BY_SKILL_AUDIT.md` — candidate decisions and evidence requirements.
- `LICENSE_AND_ATTRIBUTION.md` — source license register and per-file review standard.
- `SECURITY_REVIEW.md` — threat model and required execution boundaries.
- `FREE_VS_PAID_PROVIDER_MATRIX.md` — current official pricing/entitlement evidence and limitations.
- `INTEGRATION_ARCHITECTURE.md` — proposed orchestrator/registry/worker/provider boundaries.
- `DEPENDENCIES_AND_RUNTIME.md` — dependency inventory and sandbox baseline.
- `PRIVACY_AND_CONTENT_HANDLING.md` — consent, retention, deletion and provenance requirements.
- `TEST_PLAN_AND_ACCEPTANCE_CRITERIA.md` — candidate acceptance tests and release gates.
- `COST_AND_QUOTA_CONTROLS.md` — budget, idempotency and cost reconciliation requirements.
- `ROLLBACK_AND_MAINTENANCE.md` — disable, rollback and maintenance runbook.
- `IMPLEMENTATION_AND_RELEASE_CHECKLIST.md` — evidence-based gate checklist.
- `IMPORT_MANIFEST.json` — machine-readable proposed subset and per-candidate blockers.

This documentation update does not resolve outstanding source review or test execution. Candidate source files, dependency trees and assets still need complete review; the upstream QA/FFmpeg tests have not been executed. The import manifest remains proposed, destinations remain pending, and owner approval is still required. No implementation, SQL, provider integration, secret, dependency, or deployment change is included.
