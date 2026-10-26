# NasrinAI Media Skills — Per-Skill Audit

**Review date:** 2026-10-27  
**Status:** Audit protocol and initial decisions recorded; candidate-level source review is not complete. This file is not approval to import or execute code.

## Decision vocabulary

- `DISCOVERED`: found in an upstream index/tree only.
- `CONTENT_REVIEWED`: entrypoint and relevant supporting files inspected.
- `LICENSE_REVIEWED`: license evidence checked for the actual files and dependencies.
- `SECURITY_REVIEWED`: scripts, endpoints, permissions, prompt-injection surfaces, and data flows inspected.
- `TESTED`: pinned source retrieved and relevant tests executed in an isolated environment.
- `APPROVED`: explicit owner approval for the exact manifest revision.
- `IMPORTED`: files copied and provenance recorded.
- `ENABLED`: runtime capability activated after release checks.
No state implies a later state. In particular, a repository-level MIT badge does not mean every asset, dependency, model, or linked service is MIT-licensed or free.

## Initial candidate audit register

| Candidate | Source | Evidence in discovery pass | Initial decision | Remaining gate |
|---|---|---|---|---|
| storyboard-previsualization | Generative Media Skills | Entrypoint SHA recorded in the catalog | Candidate | Review references/assets, license scope, prompt-injection and output quality; write acceptance tests |
| explainer-video-production | Generative Media Skills | Entrypoint SHA recorded | Candidate | Review all referenced resources; test brief-to-outline/shot-list output and claims/rights handling |
| social-short-production | Generative Media Skills | Entrypoint SHA recorded | Candidate | Review references; test aspect ratio, duration, captions, platform-safe claims and export brief |
| editing-montage | Generative Media Skills | Entrypoint SHA recorded | Candidate | Review workflow references; verify no unapproved filesystem or tool execution |
| generated-media-qa | Generative Media Skills | Entrypoint and helper/test SHAs recorded; helper statically inspected | Conditional candidate | Fetch exact pinned files; run upstream tests in disposable sandbox; add path/overwrite tests |
| media-provenance-rights | Generative Media Skills | Entrypoint SHA recorded | Candidate | Validate sources, attribution, consent and output-rights workflow; add adversarial tests |
| ffmpeg-media-finishing | Generative Media Skills | Entrypoint and helper/test SHAs recorded; helper statically inspected | Conditional candidate | Run tests in sandbox; allowlist ffprobe/ffmpeg, bound file paths, duration, size, CPU and memory |
| remotion-video-composition | Generative Media Skills | Entrypoint SHA recorded | Defer pending overlap decision | Compare with iart Remotion skill; verify current Remotion licensing and rendering architecture |
| higgsfield-generate | Higgsfield AI Skills | All eight Higgsfield entrypoints inspected; bootstrap risk recorded | Provider-specific candidate | Replace pipe-to-shell install pattern; verify API entitlement, billing, data terms and current endpoint |
| higgsfield-video | Generative Media Skills | Entrypoint SHA recorded; claims date may be stale | Reference-only until refreshed | Re-check official API schemas, current models/prices, output rights, retention and provider policy |
| short-form-video | iart TikTok Video Skills | Entry point SHA recorded | Candidate after editorial review | Reframe absolute retention/virality claims as hypotheses; author acceptance tests |
| explainer-video | iart Explainer Video Skills | Entry point SHA recorded | Candidate after deduplication | Compare with provider-independent explainer-video-production; choose one baseline or document distinct value |
| remotion-video | iart Motion Design Skills | Entry point SHA recorded | Defer pending overlap decision | Inspect scripts and dependencies; compare with other Remotion skills; check Remotion commercial license |
| lower-thirds | iart Lower Thirds Skills | Selected render script SHA recorded | Defer | Review every script, Node/browser dependencies, path handling, subprocesses and output validation |
| talking-head-b-roll | iart B-roll Skills | Selected transcription script SHA recorded | Defer | Review cloud transcription endpoint, audio consent, data retention, dependencies and tests |
| talking-head-skills | iart Motion Skills index | Pack metadata recorded; full review not complete | Defer | Inspect all entrypoints/resources; identity/voice consent and provider-cost review |
| youtube-video-skills | iart pack | Repository head recorded; content review pending | Discovered | Pin and inspect exact entrypoints, supporting files, licenses and dependencies |
| ecommerce-video-skills | iart pack | Repository head recorded; content review pending | Discovered | Same full content/license/security review; examine product-image rights and claim substantiation |
| ad-video-skills | iart pack | Repository head recorded; content review pending | Discovered | Same review; add advertising claim, disclosure, platform policy and brand-rights tests |
| kinetic-typography-skills | iart pack | Repository head recorded; content review pending | Discovered | Inspect scripts/runtime and compare with motion-design/lower-thirds overlap |
| Comfy Skills | Comfy-Org | One entrypoint identified in inspected tree | Adapter/reference candidate | Verify cloud/local boundary, OAuth, workflow execution, pricing, terms and permissions |
| comfyui-mcp | Separate MCP server | Metadata/README and license inspected in prior pass | Separate-service candidate | Threat model local process/network permissions; do not treat as a simple skill import |
| Video Shotcraft | Separate recipe library | Repository-level metadata reviewed | Reference/library candidate | Inspect per-asset licenses, media size, provenance, dependencies and output rights |
| OpenMontage | Separate production system | AGPL-3.0 evidence recorded | Legal review required | No code reuse until counsel reviews distribution/network-copyleft and service boundaries |
| Mersiv Media Hermes Agent Skills | Mixed-purpose collection | No root license found at inspected path | Block import | Require explicit license/redistribution permission; reference-only until resolved |

## Required per-candidate record

For every file proposed for import, record:
1. Stable skill ID and user-facing capability.
2. Canonical source URL, repository, exact source path, immutable commit SHA, file/blob SHA and review date.
3. Artifact type: instruction, code, reference, asset, model, dataset, binary, or service adapter.
4. License file and identifier, attribution/notice obligations, exclusions, third-party content, dependency licenses, trademark and model/dataset terms.
5. Runtime and dependencies; install scripts and package lifecycle scripts; binaries and subprocess calls.
6. Network destinations, API/account requirements, required environment-variable *names* only, data sent, data retained and deletion path.
7. Estimated cost class, free allowance evidence/date, quotas, maximum-cost controls and whether a live call is needed.
8. Overlap with existing NasrinAI functionality and the reason to add it.
9. Threat model, test plan, test commands/results, limitations and reviewer.
10. Decision and owner approval for the exact manifest revision.

## Selection rule

Prefer a small provider-independent pilot. A skill that is only prose may still contain unsafe instructions; a script that looks simple still needs sandbox testing. Do not import EVAL files, private evaluation answers, upstream tests, or development-only content into the production agent package. Preserve tests separately for maintenance.

## Current blocker summary

The broad discovery catalog is complete enough for prioritization, but the candidate audit is **not complete**. Several iart packs, all candidate supporting resources, dependency trees, and exact import file sets remain to be reviewed. Upstream helper tests have not been executed. Do not mark any candidate `APPROVED`, `IMPORTED`, or `ENABLED` until its evidence and owner approval are present.


## Additional file-level review — 2026-10-27

The following extra entrypoints and supporting resources were inspected at pinned source commits. These are **not approved imports**.

| Candidate | Pinned entrypoint / supporting file SHAs | Finding | Decision |
|---|---|---|---|
| iart YouTube `audiogram` | `SKILL.md` `e6a4cd6ddc5e650a934af9ebf40945489dd71f6a`; `references/waveform-render.md` `d9f1b6fbce2fc1cce796b1434947235d3b566359`; shared `scripts/contact-sheet.sh` `d0032c4d920b8e3369898bb754f96c8ed8afe0d9`; `scripts/probe-mp4.sh` `5e9d0b3ea4ed5cf8d3471ea2f9c6159276a09273` | Requires Remotion and audio/media dependencies. Referenced helper scripts live at repository root, not inside the skill folder, so importing only the skill breaks its documented workflow. Shared helpers invoke FFmpeg/ffprobe; contact-sheet uses overwrite flag `-y`; worker wrapper must confine paths and prevent unintended overwrite. | Defer to second wave |
| iart ad creative | `SKILL.md` `cfe4a4399108ecdc0ca95b00510c5ec88e467ea2`; `references/batch-ad-pipeline.md` `147bcb498145f51e44b1d8ba8131acb947394f51`; `references/platform-specs.md` `d885c98a167ede2c8012e7d73c5c0a0a8f8ec999`; shared contact-sheet helper above | Data-driven Remotion variants are useful. Reference code parses CSV and writes caller-selected output files; path confinement, robust CSV parsing, validation, render caps, brand/claim rights and advertising disclosures are needed. Platform specifications have dated claims and must be refreshed per target placement. | Defer to second wave |
| iart kinetic typography | `SKILL.md` `b9608fee2fcfe6c2eae9c9c7517c01923123af61`; `references/reveal-recipes.md` `b7368c831358bda6cfbe0a7a843b51318a09232b`; shared `scripts/seek-shot.sh` `2020ad13d269aa5b41708ee02d7eabc40b9c3a2d` and contact-sheet helper above | Covers CSS/GSAP/Framer Motion/Remotion and After Effects expressions. `seek-shot.sh` invokes `npx -y playwright`, which may fetch code/browser at execution time; do not run in production workers. Install pinned browser/runtime in a prebuilt sandbox. | Defer to second wave |
| iart talking head | `SKILL.md` `1ae5b16f3d9028727f799fefb1ec34382590f66f`; `references/workflow.md` `175a6762557bac721ff5634143c134c4f56072de`; `package.json` `6d437b117486650070918e8caf8c972e1259c752`; `scripts/talking-head.mjs` `5e57743973550e90ab8caac8a4f4672f1b025b61`; `scripts/pipeline.mjs` `55beed7eb01dc70e4dc1c2ec13c0bf8099445feb`; `scripts/providers.mjs` `559029443ec6f8d02d9d2ad5e457aa4846cbe173`; `scripts/core.mjs` `721ffdbfab85cd26d2b6093f4997d2d209a668a4`; `scripts/prepare-person.mjs` `ac20c242ea8cba8a6acc0037c5244bcbd4257574` | Requires Node >=22, `@fal-ai/client`, `@napi-rs/canvas`, FFmpeg/ffprobe, `FAL_KEY`, and `ELEVENLABS_API_KEY`. Uploads source images/audio and generated assets to fal; voice samples/text to ElevenLabs. Explicit `--consent` is required for voice cloning; the script has dry-run and recovery/idempotency patterns. It still creates/deletes files, invokes FFmpeg, downloads provider URLs and handles sensitive face/voice data. Provider URLs/retention and paid requests need independent controls. | Defer / sensitive capability; not initial pilot |
| Comfy Cloud skill | `openclaw/comfy/SKILL.md` `82d3cd77874ff4aa6de33e7ab5a8c0ff6f9a6a6a` | Cloud-only hosted MCP workflow; supports OAuth or API-key auth and generation job management. This is an external service integration, not a local free skill. Must be implemented behind a typed provider adapter and budget/permission gate. | Adapter candidate, not initial pilot |

### Shared helper finding

The iart video/ad/kinetic packs refer to scripts under each repository's root `scripts/` directory, rather than the individual skill subdirectory. A naïve skill-folder copy will omit dependencies and break the workflow. If selected later, vendor only the exact reviewed helpers with provenance and tests, or replace them with NasrinAI-owned equivalents. `seek-shot.sh` uses `npx -y playwright` and may fetch code/browser at runtime; prohibit this pattern inside production workers.

### Initial pilot narrowed

To avoid unbounded review scope, the **proposed initial pilot** is limited to five provider-independent, instruction-only packages from Generative Media Skills: storyboard-previsualization, explainer-video-production, social-short-production, editing-montage, and media-provenance-rights. This is still a proposal, not owner approval. Generated-media-qa and ffmpeg-media-finishing remain conditional for a later phase because their helper tests were not run. Higgsfield, Comfy Cloud, Remotion-based iart packs, talking-head/voice, and other provider-dependent tools are not part of the initial pilot.
