# MCP Video Editor — Complete Source Inventory and Review

**Status:** Source-gathering and review record; no upstream code copied into NasrinAI  
**Repository:** [AISEO-VirtualabDigital/mcp-video-editor](https://github.com/AISEO-VirtualabDigital/mcp-video-editor)  
**Pinned revision:** `97da3e381df57641cd9af5f83c05eff0abfde862`  
**Tree:** `97da3e381df57641cd9af5f83c05eff0abfde862`  
**Review date:** 2026-10-27  
**Purpose:** Provide a reproducible map of the upstream code before any selective adaptation.

## 1. Collection status

The complete non-truncated Git tree was retrieved, and all 22 TypeScript files under `src/` were fetched by immutable Git blob SHA for review. The package manifest, lockfile, compiler config, client configs, installer scripts, README and architecture/security/tool documentation were also fetched and inspected. The inventory below pins each file to the exact audited revision.

This is **not** a vendored copy of the repository. The PR records what was reviewed and how it maps to NasrinAI; it intentionally avoids copying third-party code before the license and import subset receive explicit approval.

## 2. Repository facts

- TypeScript ES modules; Node.js `>=18`; strict TypeScript compilation.
- Entry point: `src/index.ts`; MCP stdio server: `src/server.ts`.
- Declared package license: MIT in `package.json` and lockfile metadata. A standalone `LICENSE` file was **not present in the audited tree**; verify before redistribution.
- Runtime dependencies: `@modelcontextprotocol/sdk`, `zod`, `nanoid`, `fast-xml-parser`.
- Dev dependencies: `typescript`, `@types/node`, `tsx`.
- Adapters support CapCut draft JSON and OpenCut project JSON through a normalized `EditorProject`.
- 50 registered tools, grouped into project, timeline, text, effects, audio, export and inspection.
- Write operations default to `dryRun: true`; backup, validation, path guards, bounded JSON reads, atomic writes and progress/change notifications are implemented.
- The source code uses the desktop editor project formats, not an editor-neutral browser application.
- Export code documents that CapCut rendering requires the desktop GUI; OpenCut can call a local export endpoint when available, otherwise the code writes an export-task record. This is not a self-contained cloud MP4 renderer.

## 3. Complete source-file inventory

The hashes below are Git blob SHAs from the pinned tree, not hashes inferred from filenames.

| Path | Git blob SHA | Purpose / review focus |
|---|---|---|
| `src/index.ts` | `2b6a59fc6321f37e725a9a78108e1e3e6b4e070b` | CLI entry point, error handling and server startup |
| `src/server.ts` | `ecf5b102ff14901239bd3299075559be71f5c21c` | MCP server, tool registration and notifications |
| `src/adapters/types.ts` | `8afe26c4112f6ad8afba9e2fd10ca980c732aea8` | Normalized project, clip, track, material and event types |
| `src/adapters/facade.ts` | `f95dab368bd43f7011d7ccb7f6485665fcd714be` | Project cache and adapter selection |
| `src/adapters/capcut.ts` | `1aed4150f3f7fda79798ae36f5af32b4ad491256` | CapCut JSON read/write conversion; unknown-field preservation |
| `src/adapters/opencut.ts` | `1f2778596e09dd94c8c6c38ef3354dff87d4e9ae` | OpenCut JSON read/write conversion |
| `src/tools/index.ts` | `687bb6ee3d8d191f5f168cc3d8d91c1f2311be8e` | Tool interface and central registry |
| `src/tools/project.ts` | `20ffbd4fb32c36bf0a9defd877547c2a8851e4d1` | Project list/create/open/save/duplicate/delete lifecycle |
| `src/tools/timeline.ts` | `87ceb890927cf4a393b45e029f6a169d87640c05` | Tracks, clips, trim/split/move/speed/visibility/volume |
| `src/tools/text.ts` | `22e8bd054024148543cac1ec547611c33851218d` | Text overlay and caption styling/positioning |
| `src/tools/effects.ts` | `218ac09263d60ea1d56f6653f0d3bda01e8bfead` | Transitions, filters, effects, stickers and animation |
| `src/tools/audio.ts` | `6bead351448b842a6a065affef95296f62dc299c` | Audio clips, volume, fades, split and denoise metadata |
| `src/tools/export.ts` | `adf62d8d355ab8e5c4c4a84dba4c9807c4144a4b` | Export profiles, task records, status and progress |
| `src/tools/inspect.ts` | `e08f1dec541ab71ea5d4a452829c431fcbec11c6` | Read-only project/timeline/track/material/text/effect queries |
| `src/safety/path-guard.ts` | `d7d0189b56c5072654003074e7d491c5697ea50d` | Project IDs, path confinement, external path and resource guards |
| `src/safety/validator.ts` | `ac5f00eeaacd55f9a39ba4c0bf68567fff75f0e2` | Structural validation of normalized and vendor project shapes |
| `src/safety/dry-run.ts` | `f2b04b5694513929f55985ea2ed76cfd068d3c18` | Dry-run previews, write wrapper and tool-result size limits |
| `src/safety/backup.ts` | `5972c61a6326ffd1e46cd66b84974413ec6fb8ba` | Timestamped backups before destructive writes |
| `src/notifications/events.ts` | `ca621013527d3f0c6fc787916aa4e66c4ef6ffca` | Typed project-change, render-progress and log event bus |
| `src/utils/fs.ts` | `9cb1c202fa3b822b2a63eabf53b63be865abe4ac` | JSON/file helpers, retries, atomic writes and size/symlink checks |
| `src/utils/paths.ts` | `3374e040c0802673c83fc9df19680a89785f3b7e` | Platform roots and project/export/backup/cache path resolution |
| `src/utils/id.ts` | `1b6066c108f455b04d7290b32de483be6430060e` | IDs, timestamps and microsecond conversions |

## 4. All other files in the audited tree

| Path | Git blob SHA | Purpose |
|---|---|---|
| `.gitignore` | `d4e11a00c97a99b8f93e3e9ce0155eddd8ea7152` | Ignore rules |
| `README.md` | `3ffc117981a4b32dfa32e60870f4cd8b8f8afd4e` | Feature overview and client setup |
| `package.json` | `386cf8cf543b79c4e9460d71c8b651d94e6a55c4` | Scripts, package metadata and dependency ranges |
| `package-lock.json` | `9e6d220042a471ec98f00a6e2ea0eb9217ca0eaa` | Locked npm dependency graph |
| `tsconfig.json` | `b360802f1099c5c14967b32a10de8ecee695361d` | Compiler/runtime target and strictness |
| `docs/ARCHITECTURE.md` | `252896242855a1fa2017aafd5c14bbc28d1d73b4` | Upstream component architecture |
| `docs/CLIENT_SETUP.md` | `d0a3c2ec4ab6321dc71077a86bae00105ba50166` | MCP client configuration instructions |
| `docs/SECURITY.md` | `45bd478f2dedcd981e633f43592236c5c87b9c81` | Upstream security report and claimed remediations |
| `docs/TOOLS.md` | `7b5affdb92263c6841aca10e3a5ed93f8bdfc7bf` | Tool schema and behavior reference |
| `scripts/install-unix.sh` | `058d8784cd8d9f2c611887ac7bdbd50ebf1f2748` | Installer/build and client-config writing |
| `scripts/install-windows.ps1` | `15688702ce3af579e2eeee40603a361c77856137` | Windows installer/build and client-config writing |
| `configs/antigravity-mcp_config.json` | `4a9089958caa11cd4161e9de117fa29b49db29fd` | Example client config |
| `configs/claude-desktop-config.json` | `906121c21ec8463973aa9db9144aba0bfb62ce4d` | Example client config |
| `configs/codex-config.toml` | `5fc502cea2e2b6fa0b88388866ffb2c0624037bd` | Example client config |
| `configs/cursor-mcp.json` | `9b6895332d4feea76240bb19228e4b72c0c120e5` | Example client config |
| `configs/kilo-kilo.jsonc` | `e0d2f8e232b829fa8c74369a975e408086b27bf3` | Example client config |
| `configs/opencode.json` | `ad9180be05a3570f945ca2de2829d7bad6e3036f` | Example client config |

The audited tree contained 31 files: 22 TypeScript source files and 9 supporting/documentation/configuration/manifest files listed above, plus 6 client configuration examples and 2 installer scripts as broken out in the table (the categories overlap the 31 total). No test directory or standalone `LICENSE` file was present in this snapshot.

## 5. Tool inventory (50 total)

| Category | Count | Operations |
|---|---:|---|
| Project lifecycle | 7 | list/create/open/close/save/duplicate/delete |
| Timeline and clips | 11 | add/remove tracks, add/split/trim/move/delete clips, speed, track volume/visibility |
| Text and captions | 5 | add/update/delete text, style, position |
| Transitions/effects | 7 | add/remove transition, filter/effect, sticker, animation |
| Audio | 7 | add audio, clip/track volume, fade in/out, split, denoise |
| Export/render | 5 | profiles, export parameters, export task, render status, task list |
| Inspection | 8 | project state, timeline, clips, track info, materials, texts, effects, open IDs |
| **Total** | **50** | Confirmed against upstream README and tool registry |

## 6. Security findings and verification gaps

1. **Path confinement is critical.** The upstream code includes project-ID and path guards, but all guards must be independently tested against traversal, symlinks, Windows path edge cases, hard links, and time-of-check/time-of-use races before reuse.
2. **Absolute media paths are unsuitable for a hosted multi-tenant API.** Translate authorized storage asset IDs into worker-private paths; never accept arbitrary host paths from clients.
3. **Export is not a complete cloud renderer.** CapCut needs a GUI export; OpenCut export is conditional on a reachable local endpoint. Implement a real renderer or select a supported rendering service.
4. **Timeline overlap policy is not guaranteed.** Add deterministic overlap validation and transition-duration constraints in NasrinAI's normalized model.
5. **Project cache is in-memory.** Hosted deployment needs durable project state, per-project locking/optimistic concurrency, and job-safe isolation.
6. **Installer scripts write client configuration.** Treat them as developer tooling only; do not execute them in production workers.
7. **Security report claims tests pass, but the audited tree has no test files or test script.** The claim was not independently verified in this source-gathering pass.
8. **License evidence incomplete.** `package.json` declares MIT but a standalone LICENSE file was absent. Verify upstream licensing and attribution before vendoring or redistributing.
9. **Dependency review remains necessary.** Lockfile was collected; before implementation run a vulnerability audit, license inventory and SBOM against the pinned revision.

## 7. Reuse matrix

| Component | Recommendation |
|---|---|
| Normalized project and timeline concepts | Reuse as design reference; define NasrinAI-owned schema |
| Zod validation patterns | Reuse selectively after API/schema review |
| Tool schemas and grouping | Adapt to internal service methods; don't expose all 50 tools publicly by default |
| CapCut/OpenCut adapters | Optional import/export adapters only; keep editor formats non-canonical |
| Path guards, backups, atomic writes | Reimplement/adapt with tests; not assumed secure solely from upstream report |
| Export task/status model | Reuse concepts, replace handoff/simulation with real render worker |
| Installer scripts and desktop client configs | Do not deploy in production |
| Dependencies | Do not add wholesale; justify and pin each required dependency |
| Entire repository copy | Not approved by this planning PR |

## 8. Required next steps before implementation

- [ ] Verify upstream owner/license evidence and attribution.
- [ ] Independently reproduce or replace security tests in a disposable environment.
- [ ] Review every dependency and install hook from the pinned lockfile.
- [ ] Define the exact subset and destination paths in a separate import manifest.
- [ ] Implement NasrinAI-specific tests before adapting source.
- [ ] Select a real renderer and validate a playable MP4 in CI/staging.
- [ ] Obtain explicit owner approval before copying source files or adding dependencies.

## 9. Scope statement

This document records the full source inventory and review mapping at the pinned upstream revision. It does not state that upstream tests passed, does not certify the upstream security report, and does not authorize production use. No source files, packages, SQL, secrets, or production settings were changed in this PR.
