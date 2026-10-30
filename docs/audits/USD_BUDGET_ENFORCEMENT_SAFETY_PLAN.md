# USD Budget Enforcement — Safety-First Implementation Record

**Status: implemented on this branch (2026-10-31); production gates below still open.**  
**Base:** `main` at `3d626702657e0a0cd5c77d145ee1d6bdd67e5d81` (inspected before this branch was created).  
**Scope:** NasrinAI production model routing and MOVO scoped chat requests that use the NasrinAI chat backend.

## Confirmed findings

1. `src/ai/policy.js` currently returns an unlimited routing balance (`usd: Infinity`), has a no-op `spent()`, and exposes `maxRequestUsd: null`.
2. `src/main.js` constructs `createPolicy({ config: effective, provider, logger })` without a budget dependency.
3. `src/ai/budget.js` already contains a shared PostgreSQL spend-reservation client, but its comments identify it as legacy/test compatibility and the production provider billing adapter in `src/ai/provider-billing.js` explicitly makes no application-side USD reservation.
4. `db/migrations/025_global_spend_reservations.sql` already defines atomic daily, weekly, monthly and optional per-request limits. The existence of this migration does not prove that production chat requests invoke it.
5. Current `budget_reached` responses can conflate actual limit exhaustion with reservation/database failures. Those must be distinguished so operators can diagnose the real cause without exposing sensitive internals to end users.

## Safety policy

- Enforce the request ceiling by default; permit an explicit, validated environment toggle to disable **only** that ceiling.
- Daily, weekly and monthly USD limits remain independent and enabled when configured, regardless of the per-request toggle.
- Never interpret missing or malformed production budget settings as unlimited spending.
- Keep atomic PostgreSQL reservations as the enforcement point across Vercel instances; a process-local balance/cache is only a routing hint.
- Do not estimate cost from an untrusted client payload. Reservation estimates must be derived server-side from validated model/usage inputs and conservative policy. Where reliable estimation is unavailable, use a bounded safe fallback or reject before making a paid provider call.
- Settle/reconcile with provider-reported actual cost when available. Preserve held reservations for ambiguous provider failures rather than releasing costs that may already have been incurred.
- Distinguish at least: request ceiling reached, daily budget reached, weekly budget reached, monthly budget reached, reservation service unavailable, and settlement/reconciliation failure. Keep user messages safe and put diagnostic detail only in protected server logs.
- Do not change production Vercel environment values or deploy until code, tests, migration state and the active production route have been verified.

## Required implementation work

1. Add typed/validated budget configuration in `src/config.js`, including daily/weekly/monthly limits and a request-limit enable toggle. Document each variable and safe semantics.
2. Wire the shared budget into production `createPolicy` in `src/main.js`.
3. Integrate budget reservations into the actual per-provider-attempt lifecycle (including failover), not merely the policy balance hint. Avoid double reservations and ensure every reservation is settled, conservatively held, reconciled or released according to the provider call outcome.
4. Preserve Quick/free model eligibility. Avoid charging a paid reservation for a free provider call; ensure the paid fallback gets a reservation before the call.
5. Ensure MOVO-scoped calls use the same safe backend enforcement without crossing MOVO/NasrinAI tenant or usage-isolation boundaries.
6. Update the SQL/RPC reason mapping and application error handling so real limit exhaustion is distinguishable from infrastructure failures. Do not weaken RLS/grants or expose the service role.
7. Add regression tests for toggle semantics, independent daily/weekly/monthly limits, over-limit single requests, concurrent requests, retries/failover, free-to-paid fallback, reservation failures, ambiguous timeouts, settlement/reconciliation, and caller/tenant isolation.
8. Add an operator-facing audit document that records exact code paths, migration prerequisites, Vercel variables (names and semantics only; never values), test evidence, deployment SHA and post-deploy verification evidence.

## Verification gates (must all pass before merge/deploy)

- Unit tests prove request-limit toggle affects only the request ceiling.
- Tests prove each aggregate period still blocks requests when the per-request ceiling is disabled.
- Tests prove concurrent reservations cannot overspend the configured aggregate budget.
- Tests prove infrastructure failures do not masquerade as genuine budget exhaustion.
- Full repository test suite and lint/type/build checks pass.
- Production migration status and RPC grants are verified against the actual Supabase project.
- Vercel environment **names and configured/nonconfigured status** are checked without exposing secret values.
- A controlled production smoke test verifies a permitted request, a blocked request, and accurate operator diagnostics.
- Record the exact deployed commit/deployment and results. If any gate fails or cannot be observed, do not mark complete.

## Current state of this branch

Implemented (code + tests):
- `src/config.js`: `AI_BUDGET_DAILY_USD`, `AI_BUDGET_WEEKLY_USD`, `AI_BUDGET_MONTHLY_USD` (required in production), `AI_BUDGET_REQUEST_LIMIT_ENABLED` (default true; false switches off only the request ceiling), `AI_BUDGET_MAX_REQUEST_USD` (required while the ceiling is on), `AI_BUDGET_RESERVE_USD` (per-call hold, default 0.05). Invalid values refuse to start.
- `src/main.js`: the shared ledger budget is wired into the production policy and the legacy chat path.
- `src/ai/provider-billing.js` + `src/ai/policy.js` + `src/ai/router.js`: every paid provider attempt (including failover) reserves first; settles to the provider-reported cost, keeps the hold when the cost is unknown or the call timed out, and releases when the provider answered with an error status. Free models hold nothing.
- `src/ai/budget.js`: `budget_reached` only for real limits (daily/weekly/monthly/request); ledger failures are `budget_unavailable`.
- Tests: `test/usd-budget.test.js` (config gates, independent periods with the ceiling off, concurrency, settle/release/hold, free models, infrastructure failure, policy blocks the provider call).

Not covered here: picture generation (`src/images.js`) keeps its plan allowance and does not hold USD budget yet.

Still open before production: verify migration 025 and its RPC grants in the production Supabase project; set the Vercel variables; Preview smoke test (one allowed, one blocked request); record the deployed SHA.
