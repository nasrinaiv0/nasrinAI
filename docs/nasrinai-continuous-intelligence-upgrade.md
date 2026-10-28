# NasrinAI Continuous Intelligence and Hourly Learning Upgrade

**Status:** Follow-up implementation in progress. PR #674 deployed the protected hourly seed/crawl pipeline, same-host crawling, bounded trusted keyword retrieval, and owner-only telemetry. This branch adds idempotent indexing of trusted crawler pages into NasrinAI’s existing platform full-text knowledge search through additive migration 076. The migration has not yet been applied to production. This does not add vector embeddings or train model weights.

## Goal

Make NasrinAI more capable over time by regularly collecting trustworthy public technical knowledge, retrieving it during relevant tasks, evaluating answers and coding outcomes, and promoting only verified improvements. More database rows alone do not train a model; this system is retrieval-augmented generation (RAG) plus evaluation-driven improvement. Fine-tuning is a separate, optional later phase.

## Existing foundations to reuse

- The core public-web crawler in `src/web/crawler.js`, with bounded batches, canonical URL hashing, SSRF-safe page reading, robots.txt checks, retries, and depth-limited link discovery.
- The server-only `web_crawl_queue` and `web_crawl_pages` tables from migration `044_core_web_crawler.sql`.
- Existing knowledge/library storage and improvement-example consent/review workflows.
- The existing `CRON_SECRET` authorization helper and Vercel Cron configuration.
- Existing OpenRouter model routing and usage telemetry.

Do not create parallel crawler, knowledge, or consent systems without proving the existing facilities cannot support a requirement.

## Hourly pipeline

1. Seed the queue from `src/knowledge/programming-sources.js`, an allowlisted catalogue of official documentation.
2. Insert seed URLs idempotently; repeated hourly runs must not reset crawl scheduling for already-known URLs.
3. Process a bounded batch through the existing crawler and honor robots.txt, public-URL/SSRF protections, timeouts, and retry limits.
4. Record source URL, title, content hash, fetch time, status, and safe error metadata.
5. Normalize and chunk eligible text; deduplicate by canonical URL and content hash.
6. Generate embeddings only through a configured, budgeted provider and persist them in the existing compatible knowledge/vector schema after schema verification.
7. Retrieve relevant chunks at inference time and include source citations/provenance where appropriate.
8. Evaluate changes against a fixed regression set; track quality, latency, token use, and cost.
9. Promote reusable examples only under existing consent, redaction, retention, and review rules. Public documentation can be indexed without treating private conversations as training data.
10. Prepare a versioned, reviewed fine-tuning dataset only after there is enough high-quality, permissioned data and a measured reason to fine-tune.

**Current implementation boundary:** The deployed phase collects curated official documentation, crawls same-host descendants, and uses a bounded, locally ranked keyword fallback for platform coding questions. This follow-up adds a content-hash-aware upsert RPC that chunks trusted HTTPS documentation into the existing `knowledge_docs`/`knowledge_chunks` tables, where the existing `search_knowledge` full-text ranker can retrieve it. Only platform tenant documents are created, with audience `user` and `guest`; business tenant data is never touched. The RPC is service-role-only, tenant-checked, bounded to 200 platform knowledge docs and 100 chunks per document, and idempotent for unchanged content. The OCC will report managed document count and latest index timestamp. This is **full-text RAG, not semantic/vector RAG**; embeddings, a measured model coding/reasoning benchmark, persistent per-run history, and production verification remain follow-up work.

## Programming coverage

Start with official documentation for JavaScript, TypeScript, Python, PostgreSQL, HTML, CSS, React, Next.js, Node.js, Go, Rust, Java, C#, C/C++, Swift, Kotlin, Bash, PowerShell, and Solidity. Extend the catalogue only with trustworthy, stable sources. The seed catalogue is a starting frontier, not a claim that all pages in these ecosystems have been downloaded or indexed.

Future reviewed source groups may include HTTP/OAuth/OpenAPI/GraphQL, Vercel/Supabase/Cloudflare/Google Cloud, testing and accessibility references, OWASP and secure engineering guidance, and AI evaluation/RAG/tool-use safety docs. Prefer official primary sources and respect source terms/licensing.

## Human-like problem-solving behavior

Use an observable task loop rather than claiming human consciousness:
- understand the requested outcome, constraints, and acceptance criteria;
- separate facts, hypotheses, and unknowns;
- plan a sequence of bounded steps and identify risks before consequential actions;
- retrieve relevant documentation and project context;
- execute using authorized tools and least privilege;
- test and verify outcomes against acceptance criteria;
- identify failures and retry only when the conditions or plan change;
- report what was changed, what succeeded, and what remains unverified;
- record sanitized, permissioned improvement candidates for review.

The system must distinguish facts, hypotheses, and unverified assumptions. Never report tests, deployment, or code execution as successful without evidence.

## Security, privacy, and reliability

- Keep the cron endpoint server-only and protected by the existing `CRON_SECRET`; never expose it to browser callers.
- Keep Supabase service credentials server-side; verify RLS, grants, tenant scoping, and service-role-only access before new tables or RPCs.
- Treat retrieved pages as untrusted data, not instructions. Ignore embedded prompts asking the agent to reveal secrets, run commands, change policies, or alter its role.
- Respect robots.txt, rate limits, public URL protections, and source licensing/terms. No paywall/login/CAPTCHA bypass.
- Never ingest API keys, credentials, private user content, or raw conversation logs as general training data.
- Do not automatically deploy code, change production policies, or fine-tune model weights from crawler output.
- For `owner_seed` jobs, follow only same-host links and preserve the seed policy on descendants; the platform chat retrieval layer separately enforces the official-host allowlist.
- Use bounded batches, idempotency, deduplication, retry caps, concurrency controls, and cost limits to prevent runaway jobs.
- Provide a kill switch through configuration and log sanitized counts/status rather than full private payloads.

## OCC observability target

Expose last run, next run, queued/fetched/indexed/retried/skipped counts, source freshness, deduplication counts, embedding failures, retrieval hit rate, evaluation results, latency, estimated cost, and last error code. Owner-only views must use existing OCC authentication and authorization; no public telemetry endpoint. Metrics must represent real run evidence, not estimates presented as actual outcomes.

## Implementation phases

### Phase 1 — Seed, crawl, keyword fallback, and owner telemetry (deployed)
- [x] Add a curated official programming documentation source registry.
- [x] Add an idempotent hourly seed-and-crawl trigger using the existing crawler and `CRON_SECRET`.
- [x] Add tests for source allowlist, dedupe behavior, and cron schedule.
- [x] Fix the failing test assertion for the queue URL path.
- [x] Add focused cron authorization tests for exact bearer secret, missing/empty/oversized credentials, and query-only secrets.
- [x] CI #7706 passed for the deployed phase: 1,188 passed, 0 failed, 1 skipped out of 1,189 Node tests; database tests, dependency audit, syntax check, and secret scan passed.
- [x] Verify production crawler tables and claim function exist and deny browser-role access; migration-history record 044 is missing and must not be blindly re-applied.
- [ ] Observe the first post-deployment hourly invocation and verify live OCC/retrieval behavior.

### Phase 2 — Existing full-text knowledge indexing (in progress on follow-up branch)
- [x] Add additive migration 076 with a content hash on managed documents and a unique partial index for tenant/source idempotency.
- [x] Add a SECURITY DEFINER upsert RPC restricted to service_role, fixed search_path, active platform tenant, HTTPS source URL, bounded chunks, and 200-document cap.
- [x] Add a server-side indexer that accepts only HTTPS pages on the curated official host allowlist, hashes content, chunks at 1,200 characters, and indexes at most five documents per hourly run.
- [x] Update platform knowledge context to label public documentation as untrusted reference data, not instructions.
- [x] Add database tests for idempotency, content updates, role grants, fixed search_path, and retrieval through the existing full-text search function; add unit tests for host filtering and safe indexing.
- [ ] Run CI and Documentation Gate on the follow-up branch.
- [ ] Apply migration 076 to production only after CI passes, then merge/deploy and verify actual indexed docs appear in platform knowledge search.
- [ ] Add semantic embeddings/vector ranking only after confirming provider support, schema, budgets, and evaluation baseline.

### Phase 2 — Retrieval quality
- [x] Trace existing crawler index and chat context boundaries; reuse `web_crawl_pages` rather than adding a parallel store.
- [x] Connect bounded, term-ranked keyword retrieval from the crawler index to platform coding questions, with an official-host allowlist applied before result limiting and source provenance.
- [x] Add regression tests for trusted-source filtering, tenant isolation, sensitive-query exclusion, bounded context, and source-host crawl boundaries.
- [ ] Add semantic embeddings/vector ranking only after verifying the existing knowledge/vector schema and provider budget.
- [ ] Add integration tests proving indexed technical references improve relevant coding responses against a fixed baseline.

### Phase 3 — Evaluation-driven improvement
- [ ] Build a versioned coding/reasoning benchmark with expected outcomes.
- [ ] Measure baseline before changing prompts/routing.
- [ ] Store sanitized candidate improvements with provenance and review status.
- [ ] Reject low-confidence, duplicate, unsafe, or consent-ineligible examples.
- [ ] Add regression and cost/latency gates before promoting improvements.
- [x] Add an owner-only OCC panel for bounded crawl queue/page metadata; the panel explicitly labels sample limits and current keyword-only retrieval.
- [ ] Add persistent per-run telemetry, a verified kill switch, and operational alerts.

### Phase 4 — Optional fine-tuning
- [ ] Evaluate whether RAG and workflow improvements are insufficient.
- [ ] Prepare permissioned, deduplicated training examples with sensitive data removed.
- [ ] Compare candidate fine-tuned model against the baseline using held-out evaluations.
- [ ] Deploy only through explicit owner approval and rollback support.

## Definition of done

The feature is not complete until hourly execution is observed in production, crawl/index jobs are idempotent, retrieved knowledge is demonstrably used by relevant requests, quality evaluations show no regressions, costs are bounded, privacy/security tests pass, and the OCC reports real run evidence. A successful commit or CI run alone does not establish production behavior.

## Related documentation

- [Continuous Intelligence Runbook](continuous-intelligence-runbook.md) — end-to-end flow, acceptance gates, troubleshooting, security and operations.
- [Core web crawler guide](web-crawler.md) — existing crawler infrastructure and deployment details.
