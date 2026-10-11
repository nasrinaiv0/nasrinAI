# Token quota and realtime voice architecture

## Current policy

- Quick has no per-user token ceiling; platform users and guests do not share a tenant-wide token ceiling.
- Pro, Max and Ultra have weekly paid-model allowances, reset Monday at midnight in `Asia/Manila`; when an allowance is exhausted, paid-model work falls back to Quick.
- Business tenants retain their configured tenant token ceiling. Shared per-IP/hourly anti-abuse controls, global estimated-USD spend budgets, per-request cost caps, image limits and daily realtime voice-minute allowances remain separate safeguards.
- Token usage is still recorded for accounting and abuse monitoring. Unlimited Quick chat is not unlimited provider spend.
- Realtime voice currently uses conservative per-started-minute token reservations; because the browser connects directly to the provider, the server cannot verify every audio turn's exact token usage.
- Resolve paid plan server-side from the active subscription. Never trust a plan/tier supplied by the browser.
- A cache hit consumes no new provider-generation tokens; cached-token telemetry is a subset of input tokens, not an extra charge. Cache hits must still pass request and abuse limits.

## Required enforcement architecture

### 1. Atomic reservation ledger

A preflight read of `usage_events` is not a hard limit: concurrent requests can all observe the same remaining allowance and start provider calls. Enforce reservations transactionally in PostgreSQL.

The reservation operation must serialize quota decisions for the tenant and the relevant actor, then account for:
1. legacy usage events that predate reservations;
2. settled reservations (the authoritative token ledger for newly reserved calls);
3. in-flight reservations that have not yet been reconciled.

It must enforce paid actor allowances and configured business-tenant ceilings in the same transaction. A zero tenant limit disables the platform-wide tenant ceiling; per-IP abuse limits and the separate global USD spend ledger still apply. A blocked reservation must not be inserted. Database/RPC errors must fail closed.

### 2. Idempotent settlement

Every provider invocation gets a server-generated reservation ID before the provider is called. After the provider returns, reconcile the reservation with trusted provider usage (input + output). Settlement must be idempotent so retries cannot count the same reservation twice. The usage event should carry the reservation ID, allowing the quota query to avoid counting that event twice.

If a provider may have consumed tokens but usage is unavailable, do not release the full reservation as if the call were free. Settle conservatively to the reserved amount. Release only when it is known that the provider was never invoked or consumed no tokens. Abandoned reservations must not silently expire into free quota; use a conservative recovery path.

Reservations are per provider call, not just per user message, because routing can retry, escalate, and call the model again after tools.

### 3. Realtime voice accounting (critical)

Current realtime sessions mint short-lived provider credentials and then the browser connects directly to OpenAI Realtime or Gemini Live. The server sees session creation, but does not receive a trustworthy complete record of every audio turn's input/output token usage. Session-start usage events currently have zero token counts. Browser-reported usage is not authoritative.

To include realtime in the exact same token allowance, move voice traffic through a server-controlled realtime gateway/relay that can observe provider usage events, bind each session to the authenticated actor and tenant, and reconcile every turn against the reservation ledger. The gateway must enforce session expiration, per-turn output caps, disconnect on quota exhaustion, and never expose permanent provider keys. A client-side-only counter or session-start log is not sufficient.

Until this gateway exists and is tested, the shared quota must **not** be described as fully enforced for realtime voice. Do not merge or release a claim of complete text+voice quota enforcement while direct-to-provider voice can bypass the ledger.

### 4. Cost-conscious voice responses

Realtime voice should default to one short sentence (normally fewer than 20 words), avoid greetings/repetition/unrequested detail, and expand when asked or when accuracy/safety requires it. Apply server-side output-token caps per tier; prompt instructions alone are not a security control.

## Verification gates before release

- Concurrent requests for one paid user cannot overspend the same weekly paid-model allowance.
- Paid users have independent weekly allowances; Quick/platform users and guests have no shared platform token ceiling; configured business-tenant ceilings remain shared within each business.
- Plan expiration/change is read from the active subscription, not client input.
- Manila midnight boundary and requests crossing midnight are covered.
- Each model retry, escalation, and tool round reserves and settles independently.
- Cache hits add zero generation tokens and cannot bypass hourly limits.
- Provider errors, timeout, cancellation, missing usage, RPC outage, duplicate settlement, and abandoned reservations fail safely.
- Realtime usage is measured from a trusted provider/server path; quota exhaustion stops further voice turns.
- Apply the SQL migration in a non-production Supabase environment first, run database and application tests, then deploy the backend and migration in a controlled order.

## Current implementation status

- Pro/Max/Ultra weekly paid-plan allowances are enforced by actor reservations; Quick and platform guests do not share a platform-wide token ceiling. Configured business-tenant ceilings remain enforced. The PostgreSQL reservation/settlement ledger covers routed chat calls, legacy chat calls, web-search model calls, retries, escalations, and tool rounds.
- Reservations are reconciled to reported input + output usage when available. Provider failures, fallback paths, and missing usage are charged conservatively at the reserved amount. Usage events carry reservation IDs so quota accounting does not double-count them.
- Realtime replies are shortened and provider-side output caps are configured for OpenAI Realtime and Gemini Live; Gemini Live is also wired into the runtime.
- **Still not complete:** realtime sessions connect directly from the browser to the provider. The server cannot verify every turn's actual audio token usage. A server-controlled realtime gateway or equivalent provider-verifiable accounting path is still required before claiming strict shared daily limits across text and voice.
- Migration `015_daily_token_reservations.sql` must be applied to Supabase before deploying code that calls the reservation RPCs. If the migration is absent or the quota RPC fails, reservation attempts fail closed.
