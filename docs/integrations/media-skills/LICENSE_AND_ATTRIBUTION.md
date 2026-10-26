# Media Skills — License and Attribution Review

**Review date:** 2026-10-27  
**Status:** Preliminary evidence register; not legal advice and not a blanket approval to reuse content.

## Governing rule

Review rights at the level of the exact file and its contents, not only the repository badge. Skills may link to third-party documentation, models, datasets, sample media, trademarks, packages, hosted services, and generated outputs under different terms. Record the immutable source revision and preserve required notices for every imported file.

## Evidence register

| Source | Evidence recorded | Decision / limitation |
|---|---|---|
| Higgsfield AI Skills | Root MIT license reported in pinned source snapshot | MIT may cover repository code/instructions; it does not grant free API access or rights beyond provider/model terms. Review each file and its third-party references. |
| Generative Media Skills | Root MIT license; upstream contributor guidance says not to copy/vendor third-party skill text and requires attribution/evidence | Review source and references per skill. Do not import `EVAL.md` or upstream tests into runtime packages. |
| iart Motion Skills / selected packs | Collection and selected pack metadata indicate MIT in reviewed snapshots | Confirm the exact pack repository, pinned commit, actual LICENSE contents, nested assets, dependencies and any external scripts per selected file. |
| Comfy-Org Comfy Skills | Root MIT license reported in prior pass | Separate cloud terms, workflow/model terms, authentication and usage costs still apply. |
| Claude Remotion Skill / Remotion Motion Graphics Skill | Repository-level MIT evidence recorded for skill instructions | Remotion engine licensing is separate from skill-instruction license. Check current eligibility and commercial/automation terms before production. |
| Video Shotcraft | Apache-2.0 repository-level evidence recorded | Inspect each included recipe/asset and all third-party media before redistribution. Preserve NOTICE/attribution requirements as applicable. |
| comfyui-mcp | MIT repository-level evidence recorded | Dependencies, ComfyUI custom nodes, model weights and workflows have separate terms. |
| OpenMontage | AGPL-3.0 license file recorded | Do not copy/embed until qualified legal review assesses distribution, network-use, modifications and service boundary. Architecture study is not permission to reuse code. |
| Mersiv Media Hermes Agent Skills | No root LICENSE found at inspected path | Block copying, adapting, bundling or redistributing until permission/license is established in writing. |
| Awesome Faceless Content Creation / Awesome AI Video Editing | CC0 catalog evidence recorded | CC0 applies to the catalog contribution as licensed; it does not relicense linked tools, APIs, logos, models or assets. Reference-only. |

## Required review for every imported file

- Exact source repository, path, immutable commit, blob SHA, date retrieved and source URL.
- Actual license file text and identifier; any per-directory or per-file overrides.
- Required copyright notices, attribution, NOTICE files, source citations and modifications.
- Third-party text/assets quoted or embedded in the skill.
- Transitive package dependencies, lockfiles, package lifecycle scripts and licenses.
- Model weights, datasets, voices, likenesses, fonts, music, footage, stock media and sample assets.
- Trademarks, branding, provider terms, generated-output rights and usage restrictions.
- Whether the intended distribution and hosted-service model triggers additional obligations.
- Approved import mode: `copy_with_attribution`, `adapt_after_review`, `separate_service`, `reference_only`, `defer`, or `reject`.
- Reviewer and written rationale. Ambiguity means defer, not assume permission.

## Attribution package

For every imported skill, include source name, source URL, pinned revision, copyright/license notice, modification note, and a copy of the applicable license where required. Keep a top-level third-party notices index and map every imported path to its source and license. Preserve original license files; do not imply upstream endorsement.

## Current review limits

This pass established repository-level evidence for selected sources, not a full legal review of every file or dependency. No legal conclusion is made about OpenMontage's deployment implications; obtain qualified counsel before any reuse. Provider subscription terms do not replace source-code licenses, and source-code licenses do not entitle NasrinAI to provider APIs or model weights.
