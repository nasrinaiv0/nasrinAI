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
