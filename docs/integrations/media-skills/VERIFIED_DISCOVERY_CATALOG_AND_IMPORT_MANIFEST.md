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
