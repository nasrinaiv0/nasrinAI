## Production rollout state — 2026-10-29

- Migration 078 is applied to production. Both public technical tables have RLS enabled; anonymous and authenticated roles have no SELECT privilege; service_role access and the matching RPC grant were verified.
- The production deployment for commit c9cb52ae72e1868a9622913dd8742cb5d8a3a37a is READY. SEMANTIC_KNOWLEDGE_ENABLED=true and SEMANTIC_MAX_EMBEDDINGS_PER_RUN=10 are configured for production.
- An unauthenticated request to the learning endpoint returned HTTP 401, confirming the route is protected.
- The first actual scheduled invocation has not yet been observed at the time of this update; the semantic table and run-history table are still empty. The next hourly tick must produce a run record and indexed chunks before the pipeline can be considered proven.
- Model-quality improvement is not yet established. The six-case benchmark must run with a populated index, and its per-task baseline/candidate results must be reviewed before claiming a gain.

# Continuous Intelligence: Semantic Index and Quality Gate

## Security model

- Global public documentation is stored in public_technical_chunks, separate from tenant-owned knowledge_docs and knowledge_chunks.
- The table has RLS enabled, no client policies, and grants only to service_role; the matching RPC is similarly restricted.
- Only HTTPS pages on the fixed official programming-documentation host allowlist are indexed. Retrieval repeats host/protocol checks in SQL and application code.
- Embeddings use the existing 384-dimensional OpenAI embedding adapter. The model identifier is stored with each row and the RPC filters by exact model before ranking.
- Page text is chunked and bounded; the hourly indexer processes at most five recent pages and ten embedding requests per run (SEMANTIC_MAX_EMBEDDINGS_PER_RUN, clamped to 1–10). The feature remains disabled unless SEMANTIC_KNOWLEDGE_ENABLED=true.
- Retrieved content is untrusted reference material, never instructions. Private chats, prompts, credentials, tenant documents, and model outputs are not indexed here.

## Rollout sequence

1. Apply db/migrations/078_secure_semantic_knowledge.sql after confirming the vector extension is available and the migration-history drift is reconciled. Do not write into tenant-scoped knowledge tables.
2. Deploy the application code and verify the migration's table, function signature, RLS, grants, and HNSW index in production.
3. Set SEMANTIC_KNOWLEDGE_ENABLED=true only after those checks pass. The code safely falls back to keyword retrieval if semantic lookup is unavailable.
4. Invoke the internal route through Vercel Cron and verify a knowledge_learning_runs record plus structured runtime log. Do not treat the presence of crawl rows as proof of a scheduled invocation.
5. Check the owner-only Continuous Intelligence panel and verify its run counts agree with database telemetry.

## Quality benchmark

The versioned six-case set in src/knowledge/quality-benchmark.js covers TypeScript, SQL injection, JavaScript async behavior, deployment constraints, evidence-based claims, and untrusted retrieved content. The rubric is a screening gate, not a substitute for human review or a comprehensive benchmark.

To compare baseline and retrieval-augmented responses with the same OpenRouter model, set OPENAI_API_KEY, OPENROUTER_API_KEY, OPENROUTER_MODEL, SUPABASE_URL, and SUPABASE_SECRET_KEY, then run npm run benchmark:knowledge. It makes at most 12 chat-completion calls and six embedding calls. Do not place secrets in source control or paste them into logs. The benchmark fails closed when it cannot retrieve semantic context and reports per-task scores, aggregate score/pass-rate delta, and model-reported cost when available.

Only enable broader rollout if the candidate has the same task coverage, no rubric regressions, and manual review confirms that citations are relevant and retrieved content did not override system policy. A green unit-test suite validates implementation; it does not prove quality improvement. Save the benchmark output as a reviewed artifact for comparisons over time.

## Scheduled-run telemetry

knowledge_learning_runs stores only sanitized counters, timestamps, bounded duration, status, and a constrained error code. It deliberately excludes page bodies, prompts, raw exception messages, and credentials. The endpoint logs aggregate counts only. A succeeded run means the handler completed; quality improvement still requires the benchmark gate above.


## Hybrid retrieval and orchestration

- `src/knowledge/rag-orchestrator.js` classifies query intent (security, debugging, deployment, database, implementation, explanation, or general), normalizes common technical aliases, and produces at most three deterministic query variants without an extra model call.
- `src/web/crawler.js` retrieves vector and keyword candidates concurrently, validates source protocol/host/model, merges duplicate URLs, and reranks with semantic similarity, lexical coverage/title evidence, and freshness.
- Telemetry contains only bounded metadata (intent, expansion count, candidate counts, mode, result count, latency); raw prompts and retrieved text are deliberately excluded. Retrieval is best-effort and falls back to whichever search path is available.
- Official documentation excerpts remain untrusted reference data and are formatted with their source URLs. Tenant-owned business documents and user memory remain in their existing permission-scoped retrieval paths and are not mixed into the global public index.


## Tenant-owned business knowledge

- Migration `079_tenant_hybrid_knowledge.sql` adds nullable 384-dimensional embeddings to `knowledge_chunks` and a tenant-scoped hybrid RPC. It preserves the existing `tenant_id` and `knowledge_docs.who` audience filters inside the SQL function, and grants execution only to `service_role`.
- Tenant embedding is opt-in via `TENANT_KNOWLEDGE_EMBEDDINGS_ENABLED=true` (off by default). When enabled and the OpenAI embedding adapter is configured, document chunks are embedded in one bounded batch and stored beside their text with the exact embedding model ID. Queries embed only the current user question; retrieval ranks semantic and full-text evidence together.
- If embedding configuration or a provider request fails, document ingestion and chat retrieval continue through the existing full-text path. Embeddings for tenant-owned documents are never copied to `public_technical_chunks`.
- This migration is not applied automatically by the application. Apply it through the normal reviewed migration process before enabling tenant hybrid retrieval in production.
