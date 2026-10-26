# Media Skills — Dependencies and Runtime Requirements

**Status:** Requirements specification; exact dependency lockfiles and runtime versions must be generated from the final approved subset.

## Dependency inventory categories

For each selected skill, enumerate:
- Python, Node.js, browser/Chromium/Playwright, Remotion, After Effects JSX, FFmpeg/ffprobe, fonts and native libraries.
- Package manifests, lockfiles, lifecycle scripts, install hooks, binary downloads and build steps.
- Model weights, custom nodes, plugins, templates, fonts, sample footage, audio and other assets.
- External APIs, OAuth scopes, endpoints, account requirements, network destinations and secret names.
- OS/platform support, CPU/GPU/RAM/disk requirements, startup time and expected render duration.

## Known candidate dependencies/risks

| Candidate | Observed or expected dependency | Required control |
|---|---|---|
| generated-media-qa | Python 3.11+ standard library in inspected helper | Pin Python runtime; test output-path authorization and overwrite behavior |
| ffmpeg-media-finishing | `ffprobe` subprocess invoked from Python helper | Allowlist binary, argument array only, timeout, bounded output, file and runtime caps |
| iart motion-design | Includes After Effects JSX scripts in inspected pack | Do not execute server-side by default; user-authorized project and isolated compatible runner only |
| iart lower-thirds | Node/render script observed | Inspect package/lockfile and browser dependencies; path and subprocess policy |
| iart B-roll | transcription helper observed | Verify provider endpoint, consent, retention, keys and dependency licenses |
| Remotion skills | Node/browser-based render stack may be needed | Check current Remotion license eligibility; pin runtime/browser and restrict render resources |
| ComfyUI/MCP | ComfyUI runtime, custom nodes, models, possible local network/process access | Separate service boundary, allowlisted nodes/workflows, model terms and network controls |
| Higgsfield skills | CLI/auth/provider calls; bootstrap includes remote-shell pattern | Do not execute bootstrap; inspect and pin CLI; server-side auth and provider billing controls |

## Runtime baseline

- Pin all versions; commit lockfiles and a software bill of materials (SBOM).
- Prefer maintained stable runtimes and minimal production dependencies.
- Build worker images ahead of time; do not install packages dynamically while processing user jobs.
- Run non-root, read-only by default, isolated per job, with explicit temporary/output directories.
- Cap input size, duration, resolution, frame rate, frame count, output size, CPU, memory, disk and wall-clock time.
- Use fixed executables with explicit arguments; never compose shell commands from prompt or filename strings.
- Validate file signatures/MIME in addition to extensions; reject unsupported and malformed media.
- Make cancellation terminate child processes and remove temporary files.
- Record runtime/tool versions with each job for reproducibility.

## Before selecting a runtime

1. Retrieve all pinned candidate files and manifests.
2. Inspect every install script and package lifecycle hook.
3. Generate dependency/license inventory and scan known vulnerabilities.
4. Verify native binaries and model files' source, checksum and license.
5. Run tests in a disposable network-restricted environment.
6. Benchmark representative media sizes and set quotas based on measurements.
7. Confirm production host compatibility and rollback strategy.
8. Record exact image digest and dependency lockfile hash in the import manifest.

No specific package version is approved by this document. A skill must not be treated as self-contained until these checks are complete.
