# Media Skills — Test Plan and Acceptance Criteria

**Status:** Test specification. No upstream tests are claimed to have passed as part of the discovery pass.

## Test layers

1. **Source/provenance:** pinned commit and file hashes match the manifest; license and notice files included.
2. **Static checks:** secrets, suspicious URLs, shell invocations, unsafe deserialization, path handling, dependencies and license scan.
3. **Unit tests:** schema validation, planning decisions, path authorization, cost calculation, state transitions and cancellation.
4. **Sandbox tests:** exact upstream helper tests run in a disposable environment with no production credentials and restricted network.
5. **Contract tests:** mocked provider success, queued/running/completed/failed states, malformed payloads, missing fields, throttling and timeouts.
6. **Integration tests:** authorized non-production provider calls only after approval, with test budgets and recorded estimates/actuals.
7. **Security tests:** prompt injection, SSRF, path traversal, oversized media, cross-tenant access, secret leakage and arbitrary command prevention.
8. **UX/accessibility:** mobile layout, progress, cancel/retry, clear cost/consent disclosure, captions and error recovery.
9. **Regression:** existing NasrinAI tests and feature tests must pass before a release.

## Candidate acceptance tests

### Storyboard / explainer / social-short planning
- A brief yields a structured concept, target duration, shot list, camera/motion, voice/audio direction, aspect ratio, captions/accessibility, rights/provenance notes and QA checklist.
- Conflicting instructions or missing information produce clarification rather than invented facts.
- Provider names and prices are not fabricated; claims requiring current facts are sourced or marked unknown.
- Sensitive user content is not sent to a provider without consent.
- Social format suggestions are recommendations, not guaranteed retention/virality claims.

### Generated-media QA
- Accept valid report; reject malformed JSON and unknown fields according to schema.
- Test missing/invalid policy, path traversal, symlink escape, unwritable output, overwrite denied, output size limit and interrupted write.
- Preserve deterministic output for identical input/policy where applicable.
- Execute exact pinned upstream tests in an isolated runtime; add NasrinAI-specific tests.

### FFmpeg/ffprobe finishing
- Probe supported media and validate malformed/empty input.
- Test timeout, missing executable, non-zero exit, oversized stdout/stderr, invalid JSON and unexpected codecs.
- Reject arbitrary executable path and user-controlled command interpolation.
- Enforce input/output roots, duration/resolution/file-size and resource limits.
- Verify cancellation kills children and cleans temporary files.
- Test deterministic output metadata and checksums where appropriate.

### Provider adapters
- Test missing key, invalid request, quota exhaustion, 429, 5xx, timeout, provider outage, malformed output, unsafe returned URL and job status unknown.
- Prove idempotency prevents duplicate paid jobs after retry/network interruption.
- Verify estimate/approval/cost ceiling and actual-cost reconciliation.
- Test provider terms/pricing stale flag disables live calls.

### Privacy/security
- No secret appears in browser bundle, logs, skill text or errors.
- No cloud upload before consent; no identity generation without explicit authorized request.
- Tenant A cannot access tenant B's jobs or artifacts.
- Deletion and retention settings propagate to all NasrinAI-managed copies.
- Prompt injection cannot override permissions, tool allowlists or cost limits.

## Required evidence per candidate

Record exact source SHA, test command, runtime version, environment/network profile, pass/fail, logs/artifacts with secrets redacted, failures and limitations. “Not run” is an explicit status, not a pass. Mocked tests do not prove a live provider works. Live calls do not replace deterministic unit/security tests.

## Release gate

No candidate may be imported unless provenance/license/security review is complete and owner-approved. No candidate may be enabled until its required tests pass, exceptions are approved and cost/privacy controls are verified. Existing repository regression tests must pass for the implementation PR; merge/deploy requires separate approval.
