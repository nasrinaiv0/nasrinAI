# OpenRouter request telemetry

NasrinAI instruments OpenRouter requests through the shared `src/ai/openrouter.js` client and the separate Responses API web-search path in `src/web/search.js`. The shared client is passed into provider routing and the image, video, speech, and transcription adapters so those calls use the same telemetry callback.

## Data captured

The `public.openrouter_logs` table records the endpoint, HTTP method/status, requested and provider-returned model, latency, provider request ID, token usage, and authoritative provider cost when the response exposes it. For successful inference responses, telemetry falls back to the JSON response `id` when request-ID headers are absent, so generation records remain eligible for reconciliation. The `model` field records only the actual model identifier returned by OpenRouter and is never filled with the requested alias. For `openrouter/auto`, the UI displays the actual returned model when available and explicitly indicates when OpenRouter did not report it. Model-catalog discovery requests are not inference calls and do not normally have token, generation-time, or per-request cost metrics. It also stores small JSON summaries such as message count, request byte size, response keys, and choice/citation counts.

Raw prompts, completions, uploaded files, authorization headers, API keys, and raw provider error bodies are not persisted. A missing provider-reported cost remains `NULL`; it must not be interpreted as free usage.

## Setup

1. Apply `db/migrations/063_openrouter_logs.sql`, `064_openrouter_generation_reconciliation.sql`, `065_openrouter_provider_performance.sql`, and the existing `066_openrouter_logs_explicit_deny_policy.sql`, the pending migrations in sequence, `069_openrouter_cached_tokens.sql`, and `072_openrouter_generations.sql` through the repository migration process. Do not skip or reorder migrations 067–071 if they are pending in the target environment.
2. Confirm these Vercel server-only environment variables are configured: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `OPENROUTER_API_KEY` (inference key for per-generation metadata and optional `/credits`). Configure `OPENROUTER_MANAGEMENT_KEY` for account Analytics API access; the legacy name `OPENROUTER_MANAGEMENT_API_KEY` remains supported. Keep both keys server-only. Analytics uses the management key; generation reconciliation and optional credits use the inference key. This separation prevents a management key from being incorrectly sent to an endpoint that expects an inference key.
3. Deploy a Preview and make a normal text request plus one enabled modality request.
4. Open the Owner Command Center and select **AI Provider Logs**. The page combines sanitized NasrinAI request telemetry with provider-discovered generation records from `openrouter_generations`, avoiding duplicates when a generation is already represented by a local request row. 5. Verify rows using the SQL below, then confirm RLS denies reads/writes for `anon` and `authenticated`.

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


## Cross-provider unlisted model inventory

The Owner Command Center exposes a separate read-only **Unlisted / Guardrail Models** category aggregating sanitized model/provider metadata from `usage_events` and `openrouter_logs`. `openrouter/auto` is a requested alias, not an actual model, and is excluded as a model identity unless OpenRouter returns an actual model ID. OpenRouter catalog status is checked against its current public model catalog when available. Other provider records are included, but their catalog status remains `unknown` until a verified provider-specific catalog/guardrail adapter is available; catalog fetch failures never imply a model is unlisted. Prompts, completions, raw request summaries, and credentials are not returned.



## Local daily CSV reconciliation utility

The production application remains Node/Vercel with Supabase as its durable telemetry store. For operators who also need a local daily CSV snapshot, use `scripts/openrouter_activity_sync.py`. It reads the day's generation IDs from the existing `public.openrouter_logs` table, fetches per-generation metadata, validates actual model IDs against the current public catalog, and atomically upserts `openrouter_activity_YYYY-MM-DD.csv` by `generation_id`.

Install dependencies with `python -m pip install -r requirements-openrouter-sync.txt`. Configure these environment variables in the local shell (never commit them): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENROUTER_API_KEY` (inference key for `/generation`), and `OPENROUTER_MANAGEMENT_KEY` (Management API key for `/activity`). Optional controls are `OPENROUTER_DATE`, `OPENROUTER_LOG_DIR`, `OPENROUTER_TIMEOUT`, and `OPENROUTER_PAGE_SIZE`.

Run `python scripts/openrouter_activity_sync.py`. The `/activity` response is aggregate analytics and is used only as an independent summary; it does not contain per-generation IDs and is not merged as if it were generation data. Generation IDs are discovered directly from OpenRouter account analytics and are also reconciled against Supabase request telemetry. The script never requests prompt/completion content, skips missing or unavailable generation metadata safely, keeps API keys out of logs, and leaves existing CSV data intact if the input file cannot be read. `Unlisted` means the model slug was absent from the successfully fetched catalog; missing IDs and `openrouter/auto` are `Unknown`, not false-positive unlisted models.


## Account generation discovery and sync

The protected Vercel cron at `/v1/internal/openrouter-generation-sync` runs every 15 minutes. It follows the supplied `openrouter-sync` pattern:

1. Query `/analytics/query` with the Management API key, `metrics: ["total_usage"]`, `dimensions: ["generation_id"]`, and a bounded 48-hour window.
2. Validate and deduplicate `gen-...` IDs, then fetch each generation using `/generation?id=...` with the separate inference API key. Retries cover transient network errors, 404 materialization delays, 429, and server errors.
3. Upsert selected provider-returned fields into private `public.openrouter_generations` by `generation_id`. Repeated runs are idempotent and refresh the last 48 hours to catch delayed records.
4. AI Logs includes these account generation records when there is no matching locally logged generation. They are marked with `telemetry_source: "openrouter_generations"` and endpoint `/generation`; they are not represented as NasrinAI-originated chat requests.

Required server-only Vercel variables: `CRON_SECRET` (at least 32 characters), `OPENROUTER_MANAGEMENT_KEY` (or legacy `OPENROUTER_MANAGEMENT_API_KEY`), `OPENROUTER_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY`. Never reuse the Management key for generation-detail requests. Do not expose any of these variables in browser code.

The generation table intentionally stores selected metadata only. It does not persist the raw response, prompt, completion, or uploaded content. Cost remains null if OpenRouter does not provide a valid non-negative cost. The cron reports discovered/fetched/saved/unavailable/failed counts and whether the 1,000-ID analytics cap may have been reached. A successful deploy does not prove the cron is configured with valid credentials; inspect the cron response and the Owner Command Center after applying migration 072.


```sql
select generation_id, created_at, model, provider_name, cost_total,
       tokens_prompt, tokens_completion, tokens_cached, finish_reason, synced_at
from public.openrouter_generations
order by created_at desc
limit 100;
```
