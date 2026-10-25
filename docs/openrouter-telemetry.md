# OpenRouter request telemetry

NasrinAI instruments OpenRouter requests through the shared `src/ai/openrouter.js` client and the separate Responses API web-search path in `src/web/search.js`. The shared client is passed into provider routing and the image, video, speech, and transcription adapters so those calls use the same telemetry callback.

## Data captured

The `public.openrouter_logs` table records the endpoint, HTTP method/status, requested and provider-returned model, latency, provider request ID, token usage, and authoritative provider cost when the response exposes it. For successful inference responses, telemetry falls back to the JSON response `id` when request-ID headers are absent, so generation records remain eligible for reconciliation. Model-catalog discovery requests are not inference calls and do not normally have token, generation-time, or per-request cost metrics. It also stores small JSON summaries such as message count, request byte size, response keys, and choice/citation counts.

Raw prompts, completions, uploaded files, authorization headers, API keys, and raw provider error bodies are not persisted. A missing provider-reported cost remains `NULL`; it must not be interpreted as free usage.

## Setup

1. Apply `db/migrations/063_openrouter_logs.sql`, `064_openrouter_generation_reconciliation.sql`, `065_openrouter_provider_performance.sql`, and the existing `066_openrouter_logs_explicit_deny_policy.sql` through the repository migration process. The cached-token schema change is `069_openrouter_cached_tokens.sql` because migration number 066 is already assigned; coordinate 069 with the pending 067–068 release sequence and do not apply migrations out of order.
2. Confirm the existing Vercel server-only environment variables are configured: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `OPENROUTER_API_KEY`.
3. Deploy a Preview and make a normal text request plus one enabled modality request.
4. Open the Owner Command Center and select **AI Provider Logs**. The page reads a bounded, date-filtered set of sanitized request rows from the owner-only API. Apply the existing OpenRouter billing reconciliation to populate upstream provider, finish reason, and generation timing when OpenRouter returns those fields. 5. Verify rows using the SQL below, then confirm RLS denies reads/writes for `anon` and `authenticated`.

```sql
select created_at, request_id, endpoint, http_method, requested_model, model,
       prompt_tokens, completion_tokens, total_tokens, total_cost_usd,
       latency_ms, status, http_status, error_code
from public.openrouter_logs
order by created_at desc
limit 100;
```

## Reliability and privacy

Telemetry is best-effort and intentionally does not block the primary AI response. A Supabase outage or insert failure is reported to server logs and must not change the response returned to the user. Because this is best-effort logging, it is not a durable audit queue: requests may be missing if the serverless invocation is terminated before the background insert finishes. If guaranteed delivery is required, add a durable queue or outbox with retries and idempotency.

Only trusted server code uses `SUPABASE_SECRET_KEY`, which bypasses RLS. Do not expose it to browser bundles or create public table policies. Keep access to telemetry behind the existing owner-only authorization boundary. Apply an explicit retention policy based on operational and privacy requirements.


## Owner Console request log view

The owner-only `/owner/api/openrouter-logs` endpoint supports `24h`, `7d`, `30d`, and `90d` windows, bounded pagination (up to 100 rows per request), and validated status/model/endpoint filters. The response intentionally omits `request_summary` and any prompt/completion content. The console table shows request time, requested/returned model, OpenRouter provider and upstream provider, endpoint, HTTP/status outcome, input/cached/output tokens, output tokens per second when derivable, estimated routing overhead, time to finish, total latency, actual provider-reported cost, finish reason, cost source, and provider/request identifiers.

Cached token counts are captured from provider usage metadata when available. Actual cost is sourced from OpenRouter response usage or the authoritative generation reconciliation API; the UI labels the source. Output tokens per second is derived from output tokens divided by provider generation time. Routing overhead is a rough estimate (total latency minus generation time) and is explicitly labelled as estimated, not a provider-measured metric. Catalog/discovery rows explicitly mark inference-only metrics as not applicable instead of suggesting telemetry is broken. Upstream provider and generation timing fields are only filled by reconciliation against the OpenRouter generation endpoint. Missing values mean unavailable or not yet reconciled; they must not be interpreted as zero or free usage. This view is owner-only and read-only. It does not expose browser access to the underlying telemetry table.
