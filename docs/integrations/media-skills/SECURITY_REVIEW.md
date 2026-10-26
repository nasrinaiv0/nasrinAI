# Media Skills — Security Review and Threat Model

**Review date:** 2026-10-27  
**Status:** Threat model and minimum controls defined; no third-party code is approved for production execution.

## Assets to protect

- Provider keys, OAuth refresh/access tokens, user sessions and owner credentials.
- User prompts, uploads, source footage, audio, faces/voices, brand assets and unpublished campaigns.
- Generated media, project files, billing events, usage logs and customer content.
- Production filesystem, database, deployment secrets, network access and worker capacity.

## Trust boundaries

1. User/browser → authenticated NasrinAI API.
2. Orchestrator → skill selection and constrained tool contracts.
3. Skill worker → filesystem, media binaries and package runtime.
4. Worker → external provider/API/cloud transcription service.
5. Worker → object storage and signed-download URLs.
6. Audit/telemetry → owner-only dashboard.
Treat all third-party skill text, references, prompts, model outputs, media metadata, project files and remote API responses as untrusted input.

## Threat register and required mitigations

| Threat | Minimum control before pilot |
|---|---|
| Prompt injection in skill/reference/media metadata | Treat content as data; never let instructions override system policy, tool allowlists, permissions or user consent; adversarial tests |
| Remote shell bootstrap / supply-chain compromise | Never execute `curl | sh`; pin and inspect artifacts, verify checksums, review install scripts and dependency lockfiles |
| Arbitrary command execution | No general shell tool for skills; fixed executable allowlist, argument arrays (no shell interpolation), worker isolation and hard timeout |
| Path traversal / overwrite | Canonicalize paths; allow only job-scoped input/output roots; reject symlinks and traversal; atomic writes; explicit overwrite policy |
| Resource exhaustion | File-size, duration, resolution, frame-count, CPU, memory, disk, concurrency and wall-clock quotas; terminate runaway processes |
| SSRF / exfiltration | Egress allowlist; block metadata/private IP ranges; no arbitrary URLs; inspect redirects; strip secrets from logs |
| Secret exposure | Server-side secret manager/env; pass only scoped credentials to adapters; redact logs; never expose keys in skill prompts or browser payloads |
| Duplicate paid generations | Idempotency keys, job state machine, per-user/provider budgets, preflight estimate and explicit approval for cost above configured threshold |
| Cloud upload without consent | Tell users which service receives which data; obtain consent before sensitive audio/face/voice transfer; least-data transfer |
| Unsafe identity/voice cloning | Explicit rights/consent checks; block impersonation and non-consensual identity use; support deletion and provenance |
| Malicious/oversized media | MIME and content sniffing, parser isolation, antivirus where available, decompression limits and non-executable storage |
| Data leakage through generated URLs | Short-lived signed URLs, authorization on every read, no public bucket by default, avoid raw URLs in logs |
| Dependency compromise | Pin versions, lockfile, vulnerability scan, SBOM/license scan, minimal dependency set and reviewed upgrades |
| Cross-tenant access | Tenant-scoped storage and DB access, RLS, ownership validation in every API, cross-tenant tests |
| Untrusted provider response | Schema validation, content-type/size limits, safe download handling, URL allowlists and output scanning |
| Evaluation leakage | Keep upstream `EVAL.md` and repository-only tests outside production agent bundles |

## Required worker profile

- Disposable isolated worker/container per job or equivalently strong isolation.
- Non-root execution; read-only base filesystem; explicit writable job directory.
- No production database credentials in media workers.
- Outbound network disabled by default; provider-specific allowlist only.
- CPU/memory/PID/disk/time limits; cancellation and cleanup on timeout.
- Fixed media binaries and version-pinned runtime; no runtime package installation.
- Redacted structured logs with job ID, provider, model, cost estimate/actual, duration and failure code—but no secrets or unnecessary user content.
- Explicitly scoped signed upload/download URLs.
- Worker image and dependencies scanned before release.

## Script-specific known findings

- `generated-media-qa/scripts/normalize_qa_report.py`: static import review found standard-library-only behavior and no network/subprocess imports in inspected imports. Caller-selected output path and overwrite behavior still need a safe wrapper and tests.
- `ffmpeg-media-finishing/scripts/media_probe.py`: invokes `ffprobe` through `subprocess.run` with captured output and timeout; executable path and media path must be constrained. Do not accept arbitrary executable names/paths from user input.
- iart motion packs may contain After Effects JSX, Node/Playwright/Chromium, FFmpeg, filesystem writes or cloud transcription. Review each script before selecting it; never run an entire pack blindly.
- Higgsfield generation instructions include a remote-shell bootstrap pattern. Omit or replace with a pinned, verified install procedure before any use.

## Security acceptance gates

A candidate fails if it requires unrestricted shell/network/filesystem access, leaks secrets, silently uploads sensitive media, can create unbounded costs, or has an unresolved license/data-flow risk. Every worker must pass path traversal, prompt injection, SSRF, timeout, cancellation, malformed response, duplicate submission, quota exhaustion and cross-tenant tests before production.
