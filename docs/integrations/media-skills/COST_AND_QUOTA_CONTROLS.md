# Media Skills — Cost and Quota Controls

**Status:** Required controls for any future integration; values must be configured from verified provider prices and NasrinAI plan policy.

## Cost model

For each job, estimate and reconcile separately:
- Existing NasrinAI model/token usage.
- External generation API units/credits.
- Rendering compute (CPU/GPU), worker duration and storage/egress.
- Transcription, TTS, music, stock/media licensing and other services.
- Retries, fan-out/child jobs, enhancement/upscale and alternate renders.
- Any commercial runtime license (for example, automated rendering terms).

Never report an estimate as actual spend. Store currency, provider, model, unit basis, price verification timestamp, provider job/generation ID, estimated cost, actual cost and source of the actual figure.

## Mandatory controls

- Preflight estimate before creating a paid provider job.
- User confirmation above configured threshold and for sensitive/paid workflows.
- Per-job maximum cost passed to provider when supported; reject plans that exceed it.
- Per-user, per-tier, per-provider daily/weekly caps and global emergency cap.
- Separate hourly anti-abuse limits from token/credit budgets.
- Idempotency keys and duplicate-request detection.
- Bounded retries, exponential backoff and no blind retry for unknown job state.
- Concurrency limits and fair scheduling.
- Kill switch per provider, skill and overall media execution.
- Alert owner when spend, failure rate or queue time crosses thresholds.
- Reconcile actual provider costs and credits; preserve raw provider IDs and sanitized response metadata.
- Do not permit a free-tier skill to bypass plan entitlements or call an unapproved direct provider.
- Fail closed when pricing/terms are stale or cost cannot be bounded.

## UX and logging

Show users whether the operation is local or cloud-based, estimated charge/credit consumption, applicable quota and whether cancellation can still incur cost. Owner dashboard distinguishes estimated from actual spend and includes provider job ID, latency, token/credit usage, finish reason and failure category where the provider exposes them.

Do not expose secret values, internal environment variable names, management keys or unredacted provider payloads to users.

## Configuration

No numeric thresholds are approved in this document. Implementation must read current NasrinAI tier policy and verified provider prices, use server-side configuration, validate values at startup and have safe defaults. Missing/invalid budget configuration disables paid generation rather than allowing unlimited spend.
