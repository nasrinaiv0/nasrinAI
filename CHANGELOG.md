## Unreleased
- Route Quick Free and paid Quick file extraction and document interpretation through GPT-6 Luna as a first-class task-specific model route, with regression coverage.


- Owner AI Logs and Finance now use finite, non-negative `openrouter_logs.total_cost_usd` values even when older rows lack provenance tags; new OpenRouter telemetry records tag this source explicitly.
- Save reply timing and token usage metadata in the assistant-message insert, avoiding a second write that could leave restored replies without usage details.

- Route Quick Free image generation through the paid, low-cost OpenRouter image lane (`openai/gpt-image-2`, with `openai/gpt-image-2.5-flare` fallback) when OpenRouter is configured, without changing Quick Free text-chat eligibility. Add regression coverage and document route overrides.

- Enforce Quick Free's free-model-only policy independently of provider-presence flags, and prevent paid Quick from falling back to free OpenRouter models. Add regression coverage for the legacy flag-off case.

- Persist sanitized reply timing and token-usage metadata on assistant messages in Supabase; conversation history and the reply details panel now use saved metadata instead of estimating historical token counts from text. Replies without stored metadata show "Not reported".

## Quick free/paid routing correction — 2026-10-26

- Free Quick tries OpenRouter `:free` models first, then allowlisted direct free providers, and reserves GPT-6 Luna for heavy tasks only after the free pool fails.
- Paid Quick uses non-free OpenRouter models only and prioritizes the configured lower-cost shortlist.
- Add regression coverage for free-first ordering, paid model eligibility, and heavy-task fallback.

## OpenRouter generation ID and cost reconciliation fix — 2026-10-26

- Capture the `gen-*` generation ID from OpenRouter response JSON independently of the HTTP request ID, and persist it to `openrouter_logs.openrouter_generation_id`.
- Discover sync candidates from paginated Supabase request logs, including valid legacy `gen-*` IDs, instead of depending on Analytics generation-ID discovery.
- Fetch authoritative per-generation cost, token counts, finish reason, latency, and generation time with the NasrinAI inference key; upsert only selected metadata and never store prompts or completions.
- Add regression tests covering request-ID separation, log persistence, log-based discovery, provider metric mapping, and authorization errors.

## OpenRouter generation discovery sync — 2026-10-26

- Add a protected Vercel cron that discovers generation IDs via OpenRouter Analytics using the Management key, fetches generation metadata with the separate inference key, and idempotently upserts selected fields into private Supabase storage.
- Add migration 072 for provider-discovered generation records with RLS enabled and no public/anon/authenticated access. Do not store raw provider responses, prompts, or completions.
- Include imported generation records in Owner AI Logs without duplicating generations already represented by local request telemetry; preserve provider-reported cost provenance.
- Add regression coverage for credential separation, sync persistence, and Owner AI Logs rendering.

## Owner Command Center model inventory refresh — 2026-10-26

- Replace inferred model membership with explicit OpenRouter and direct OpenAI, Google, and Anthropic inventories supplied for the Owner Command Center.
- Preserve exact IDs, including the 51 supplied OpenRouter entries (49 unique IDs because two entries were repeated) and 14 direct-provider entries.
- Classify recorded telemetry against the appropriate provider inventory only; unknown providers/aliases remain unknown. Catalog membership does not imply model readiness or fabricate activity/costs.
- Add regression coverage for inventory counts and direct-provider AI Logs classification.

## Rich reply rendering polish — 2026-10-26

- Improve assistant reply Markdown with italic, bold-italic, strikethrough, horizontal section dividers, and readable inline code.
- Render Markdown task lists as accessible, non-interactive completion indicators.
- Refine long-answer paragraph rhythm and mobile table/code-block spacing while preserving safe DOM-only rendering.

## OpenRouter generation-log reconciliation correction — 2026-10-26

- Explicitly allow the owner-authenticated reconciliation POST route in the write-method gate; require same-origin JSON requests and retain the owner session, email/IP allowlist, rate-limit and explicit confirmation controls.
- Reconcile using `openrouter_generation_id` first, with a validated `gen-` provider request ID fallback; arbitrary request IDs are not sent to the generation endpoint.
- Revisit recent rows with missing or unverified cost provenance, including legacy rows with an existing unmarked cost, and overwrite only after a successful generation lookup returns a finite non-negative authoritative cost and matching generation identity.
- Persist provider-reported cost provenance, model/provider, token counts and generation timing; convert generation API timing values from milliseconds to seconds. Do not fetch or store prompt/completion content.
- Backfill legacy rows whose cost is present but provenance is missing/unverified. PATCH requests include the observed cost and provenance as optimistic concurrency guards, preventing stale reconciliation from overwriting a concurrently verified value.

## Auto provider default and OpenRouter fallback — 2026-10-26

- Restore the agreed production routing contract: `AI_PROVIDER=auto` is the documented production default and is also selected automatically for production when provider credentials exist but the variable is omitted. Unconfigured local/test environments remain safely disabled.
- In Auto mode, prefer configured direct providers instead of injecting OpenRouter ahead of every route. Keep OpenRouter available as an additional fallback when independent direct providers are configured.
- Fix Quick fallback ordering so explicitly allowlisted direct free-provider candidates are actually appended and tried before OpenRouter free models; retain the approved Luna emergency route and all tier/privacy/capability restrictions.
- Add regression coverage and update routing/deployment documentation. No production environment variables, merge, or deployment are changed by this PR.
- Validation: CI must pass before merge; production guest and signed-in Quick smoke tests remain required after deployment.

- Restore Quick for guests and signed-in users during OpenRouter free-model outages: keep OpenRouter free models first, then allow only separately configured provider models explicitly present in their `*_FREE_MODELS` allowlist, with the approved Luna emergency route last. Preserve privacy checks and prohibit paid-model fallback; add regression coverage.
- Fix guest-session database access for modern Supabase `sb_secret_` keys: send the opaque secret in `apikey` only rather than incorrectly treating it as a JWT Bearer token. Preserve the Authorization header for legacy `service_role` JWTs. Add regression coverage.
- Update the AI Logs regression fixture to use a model in NasrinAI's configured catalog; verify live provider catalog calls are not used for inventory classification and unresolved aliases remain `unknown`.
- Align AI Logs status copy with the configured NasrinAI catalog rather than implying a live provider-catalog check.
- Respect the migration-062 `usage_events.cost_source` provenance marker: direct-provider usage costs are shown only when explicitly marked `provider_reported` with a valid non-negative amount; legacy/unmarked amounts remain unavailable.
- Owner AI log costs now require explicit OpenRouter generation-API provenance; unverified `total_cost_usd` and application-side `usage_events.cost_usd` are not presented as provider spend. Model inventory aggregates leave costs unavailable unless verified provenance is present.
- Owner AI logs no longer display `usage_events.cost_usd` as provider spend without provenance; direct-provider costs remain unavailable until a provider-sourced cost is recorded.
- Clarify Owner Command Center model views: AI Logs uses NasrinAI's configured catalog, Unlisted Models shows logged IDs absent from that catalog, and AI Models Activities includes both. Catalog membership no longer depends on OpenRouter's live catalog.
- Add a private Owner Command Center **Regional Analytics** panel with 24-hour/7/30/90-day filters, country/region/city aggregates, separate registered-user and guest counts, and clear data freshness/precision guidance. The owner API uses a service-role-only aggregate RPC and never returns actor hashes, emails, or raw IPs; migration 071 and owner-console regression coverage included.
- Add privacy-minimizing regional analytics for NasrinAI platform users and guests: capture trusted Vercel country/region/city metadata, HMAC pseudonymous actor IDs, deduplicate session events for 30 minutes, restrict writes to a server-only Supabase RPC, and expire records after 90 days. Includes regression tests; production activation requires the migration and deployment.

- Harden Owner Command Center model-inventory rendering: validate API payload shape, tolerate missing catalog coverage and row fields, safely format counts/costs/dates, sort model rows by request volume, and keep model IDs visible as a dedicated cell. Preserve the separate OpenRouter Unlisted Models and Other Provider Unlisted Models tabs and avoid treating unknown catalog status as confirmed unlisted.

- Add an operator-run Python CSV reconciliation utility that uses Supabase `openrouter_logs` as the source of generation IDs, OpenRouter Management API activity for aggregate analytics, the inference API key for per-generation metadata, and the live model catalog for `Catalog`/`Unlisted`/`Unknown` classification. CSV upserts are atomic and keyed by `generation_id`; prompt/completion bodies and credentials are never logged or stored. Add Python unit tests and run them in CI.

- Fix OpenRouter credential boundaries in the existing Owner Command Center: `OPENROUTER_MANAGEMENT_KEY` (with legacy `OPENROUTER_MANAGEMENT_API_KEY` compatibility) is used for account Analytics API queries, while the inference `OPENROUTER_API_KEY` is used for generation metadata reconciliation and optional credits. Return safe, explicit 401/403 management-key errors without logging provider response bodies or credentials. Document the server-only environment variables and add regression coverage for separate authorization headers.

- Implement private durable storage for generated chat videos: completed provider output is uploaded to the private Supabase `generated-videos` bucket (up to 50 MiB), storage metadata is saved to `generated_videos`, and authenticated owner-scoped playback prefers stored bytes over provider URLs. Add a memory-store adapter and regression coverage for provider-independent playback; upload failures retain the bounded legacy fallback and are logged.

- Document Supabase Auth leaked-password protection as intentionally deferred per owner direction; retain it as a future security-hardening task and do not mark it enabled/resolved.
- Apply production migration `066_openrouter_logs_explicit_deny_policy`; verified its registry entry and restrictive deny policy for browser roles. Supabase security advisor no longer reports `openrouter_logs` as RLS-enabled without a policy; leaked-password protection remains disabled.
- Fix OpenRouter billing analytics parsing to accept the documented `data.data` response envelope; update regression coverage to use the official flat-row response shape and `request_count` metric.

- Route OpenRouter Responses API web search away from `openrouter/auto` to the verified free `nvidia/nemotron-3-super-120b-a12b:free` model, which advertises Responses API and tool support; preserve explicitly configured model IDs other than Auto. This prevents the known production Auto-model HTTP 400 route while keeping Quick/guest search on a free model.
- Replace Owner Command Center billing's legacy OpenRouter activity call with the documented Analytics API, discover available metrics before querying, bound requests to 7/30 days, and keep provider-reported spend separate from Supabase cost data. Credits metadata remains optional if its endpoint is unavailable.
- Add regression coverage for free-model search routing and analytics billing response parsing. Production behavior remains subject to post-deployment smoke tests.

- Record the 2026-10-25 production audit snapshot: migration history still needs manual reconciliation, Supabase Auth leaked-password protection remains disabled, and provider end-to-end verification is still open. No production migration or Auth setting was changed.

- Add migration 066 with an explicit restrictive deny policy for browser roles on OpenRouter telemetry; revoke all browser/public table privileges while preserving service-role select/insert. Add SQL regression checks for RLS, policy semantics, and grants. This is a defense-in-depth database change; it does not resolve migration-history drift or prove provider workflows are production-verified.

- Fix transcription model discovery to recognize text-output models that accept audio input; keep the audio-input capability check mandatory and add regression coverage.
- Align the transcription catalog fixture with an audio-input/text-output model contract, keeping capability checks strict rather than weakening runtime modality validation for a legacy test fixture.
- Preserve compatibility with OpenRouter catalogs that label speech outputs as either `audio` or `speech`, and transcription outputs as `text` or `transcription`; enforce rerank `topN` response bounds in regression coverage.
- Add dedicated OpenRouter capability adapters for image generation, speech synthesis, transcription, embeddings, structured decisions, and reranking. Validate provider-qualified model IDs, bounded inputs, image/audio/vector payloads, response shapes, and avoid fetching model-supplied image URLs to prevent SSRF.
- Harden OpenRouter endpoint selection for speech and transcription modality metadata, validate embedding vectors and batch sizes, and add the dedicated rerank request/response path. Specialized capabilities remain separate from generic chat routing.

- Correct routing regressions to use models explicitly eligible for the requested paid tier; paid Quick now verifies a catalog-confirmed paid-Quick model, and Pro/Max/Ultra tests each use their assigned paid model. This preserves strict tier entitlements instead of relaxing registry enforcement to make legacy tests pass.

- Add regression coverage proving inferred registry models remain blocked without live catalog evidence and become eligible only when the exact ID is discovered for a supported chat task.

- Allow registry entries marked inferred only when their exact model ID is present in the live OpenRouter task-filtered catalog result; static guesses remain excluded. Pass the catalog evidence into the runtime gate rather than treating inferred IDs as permanently disabled.

- Integrate the approved OpenRouter tier registry into runtime chat candidate selection: registry-known models must match tier, chat endpoint, capability/task, and verification status; inferred IDs and specialized endpoint models are excluded from generic chat. Preserve dynamic catalog fallback for eligible paid chat models and free-only Quick behavior.

- Add the clean-tier OpenRouter model routing registry with explicit Guest/free Quick, paid Quick, Pro, Max, and Ultra eligibility; preserve inferred model IDs as disabled until verified; define capability-specific endpoint metadata and safe fallback checks. Provider billing remains OpenRouter-owned; tier entitlements, capability compatibility, privacy, and output validation remain enforced.

## Unreleased

- Add per-table Table Settings to Owner Command Center AI Logs and AI Models Activities: toggle columns, reorder by drag-and-drop, choose a pinned column, set Compact/Regular/Expanded density, and reset settings. Preferences are stored locally per table and do not change source data or filters.

- Fix finished chat videos never appearing: saved jobs are now polled and downloaded through the matching provider adapter (the database stores no tier), and the video content route supports byte ranges so iPhone Safari can play the preview.

- Enforce tier-aware OpenRouter routing: guest/free Quick exhaust explicitly free models before GPT-6 Luna fallback, while paid tiers exclude `:free` model IDs; add routing regression tests.

- Trigger the owner-session verification when a signed-in session is established, fixing the hidden Owner Command Center tile's visibility deadlock while preserving email/IP authorization.

- Use separate owner-supplied NasrinAI logo variants in the Space Connect tile, adapting to explicit light/dark themes and system preference without color inversion.

- Place the Owner Command Center entry inside NasrinAI Space as a hidden-by-default app tile, revealed only after server verification of the signed-in email and client IP.

- Restore the Owner Command Center entry in Settings for sessions verified by both the owner email and IP allowlists; remove it when verification fails or the user signs out.

- Add an owner-only AI Provider Logs view for sanitized OpenRouter request history, with time/model/status/endpoint filters, pagination, token counts, latency, provider-reported cost, and reconciled upstream provider/generation metadata.
- Add migration 065 for upstream provider and generation timing fields; add tests for owner-boundary enforcement, filter validation, and sanitized log responses.

# Changelog

- Fix video quality fallback errors so exhausted model/quality checks report capability unavailability rather than a misleading plan restriction; add regression coverage for requested 2-second clips.

- Add sanitized server-side OpenRouter request telemetry in Supabase, including latency, provider status, token usage, and provider-reported costs when available. Raw prompts and completions are not persisted.

## Unreleased

- Fix video creation failing for every model: a catalog with no frame-rate list is now treated as provider default instead of unsupported.

- Fix the hourly video limit: it has its own message instead of the sign-in one, and only counts videos that actually start.

- Fix chat video creation: Automatic uses the plan's video tier; requested clip lengths resolve to a length the model advertises; native resolution/FPS dialogs removed; "edit/turn photos into a video" requests route to video and offer Video Studio when photos are attached.

- Fix the base reply renderer's structured UI delimiter regex so valid search requests degrade to readable text and malformed UI payloads show a safe fallback when the optional enhancer is unavailable.

- Clarify the Help improve NasrinAI description: Guest and Quick access cannot manage the preference; eligible examples may be considered under screening safeguards, and the copy avoids implying every chat is collected or models are trained automatically.

- Suppress raw structured UI protocol JSON when a widget cannot be rendered; normalize whitespace around UI delimiters.
- Add a base formatter fallback for Quick-tier render paths where the optional Generative UI enhancer does not initialize.
- Fix the escaped UI marker regex and cover valid search fallback plus malformed-payload suppression with regression tests.

- Improve Guest/Quick structured search rendering so raw UI payload JSON is not shown as ordinary chat text.
- Discover live OpenRouter text-capable models for Guest/Quick and filter them to explicitly free IDs, rather than limiting fallback discovery to the static Nemotron list.
- Allow operators to add explicitly free OpenRouter model IDs through `OPENROUTER_FREE_MODELS`; paid IDs are ignored and Guest/Quick remain free-only.


- Clarify third-party AI-provider training restrictions and filtered guest-conversation use for improving NasrinAI.
- Prefer explicitly free OpenRouter models for simple requests on Pro, Max, and Ultra while preserving tier-eligible paid fallback; keep Guest and Quick free-only.

- Add an owner-only live OpenRouter billing panel using the server-side Management API key, showing provider activity, token usage, reported spend, and credit metadata separately from Supabase costs to avoid double-counting.
- Add an owner-triggered reconciliation flow that looks up logged OpenRouter generation IDs, stores provider-reported cost/token metadata with provenance, and leaves unmatched rows explicitly unreconciled.

- Update the transitive `undici` dependency to 7.30.1 (lockfile only) to clear three high-severity advisories flagged by `npm audit`.

- Fix OpenRouter routing: add `OPENROUTER_DATA_COLLECTION` (default `allow`; private requests with contact details or attachments always use `deny`, and a configured `deny` is never loosened) so free and other non-zero-retention models are reachable; a model ID missing from the live catalog now fails as `unavailable` and fails over instead of silently calling the first catalog model; a 400/422 from one chat model fails over to the next candidate. Privacy notice updated (version 2026-10-24).

- Automatically approve community-learning examples only after existing sensitive-content, identifier, secret, and quality screening passes; unsafe or uncertain content remains excluded from the approved retrieval pool.

- Add an owner-only Community Learning review panel with pending/approved/rejected queues, explicit approve/reject actions, review history, and protected server endpoints backed by the existing service-role review RPC.

- Fix image-tier provider overrides so each selected provider receives its own default model ID when no explicit model is configured; add regression tests for Gemini, OpenAI, and OpenRouter primary/fallback combinations.

- Add idempotent indexes for eight foreign-key columns flagged by the live Supabase performance advisor, with regression tests. Unused indexes are intentionally retained until workload evidence establishes they are safe to remove.

- Keep the reply details panel above conversation content with absolute positioning and z-index 1000, while limiting its height to account for the chat composer dock and device safe area.

- Add a separate OpenRouter multimodal quality/security PR with a video-provider adapter, explicit per-second video budget gating, single-shot duration enforcement, and regression coverage. The integration remains a draft pending task-policy routing, provider-specific pricing verification, and passing CI; it is not enabled for production by default.

- Documented the requested OpenRouter video model allowlist with verified IDs `heygen/heygen-video-1` and `alibaba/wan-3.0`, current model-specific duration constraints, and safe modality-preserving failover policy for image, video, voice, and coding.

- Add a manual GitHub Actions workflow to verify live OpenRouter text-model availability and upload a JSON report. Runs only on explicit dispatch with cost confirmation; uses `OPENROUTER_API_KEY`.

- Improve Owner Command Center AI Models Activities to retain every observed request status rather than collapsing non-success values into errors. Show inferred/unavailable model metadata separately from provider catalog membership, and separate internal usage estimates from provider-reported costs. Add regression coverage for unresolved OpenRouter aliases and nonterminal running status.
