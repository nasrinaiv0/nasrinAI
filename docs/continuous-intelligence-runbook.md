# Continuous Intelligence: Hourly Learning Runbook

**Status:** Design and implementation guide; not evidence of production activation. See [the upgrade plan](nasrinai-continuous-intelligence-upgrade.md) and [the crawler guide](web-crawler.md).

## Purpose

Build a safe, observable improvement loop for NasrinAI. The system should expand its searchable technical knowledge and improve measured task outcomes without claiming that adding database rows retrains the underlying model.

## What runs hourly today in this implementation slice

The Vercel schedule `0 * * * *` invokes `/v1/internal/knowledge-learning` at the start of each UTC hour (UTC+8 in the Philippines). On Vercel Pro, scheduling precision is per minute, but invocations still need to be confirmed in production logs. The route reuses the existing `CRON_SECRET` authorization, queues curated official programming documentation roots with duplicate-ignore semantics, and asks the existing crawler to process a bounded batch of up to five jobs.

The existing `/v1/internal/web-crawl` worker remains scheduled every five minutes. Both workers use the shared queue; verify production locking, retry behavior, endpoint authorization, and overlapping-run behavior before treating the schedule as reliable.

The current implementation does **not** by itself prove that crawled pages have been chunked, embedded, written into the active vector index, and used during model inference. The crawler's `web_crawl_pages` text index is not automatically equivalent to semantic RAG. Those are explicit follow-up phases.

## Target end-to-end data flow

1. **Discover:** Seed only trusted, reviewed documentation roots (official language, framework, database, standards, API and security docs). Add new hosts through code review.
2. **Fetch safely:** Use the shared crawler, enforce public-URL/SSRF and redirect checks, obey robots.txt, use bounded page sizes/timeouts/retries, and record sanitized outcomes.
3. **Normalize:** Extract readable text and metadata, canonicalize URLs, normalize whitespace, reject empty/low-quality pages, and calculate a content hash.
4. **Deduplicate:** Use canonical URL plus content hash so unchanged pages do not create duplicate knowledge records. Re-crawls should update freshness without resetting queue state.
5. **Chunk:** Split content into bounded, overlapping chunks that preserve headings, code examples, and source boundaries. Avoid splitting code blocks when possible.
6. **Embed and index:** Use only a configured provider, with per-run token/cost ceilings, retry caps and an explicit schema adapter. Confirm the existing knowledge/vector schema before writing; do not create a parallel knowledge store by default.
7. **Retrieve:** At inference time, retrieve only relevant chunks, apply tenant and permission filters, include source/title/URL/fetch-time metadata, and cite sources when useful. Treat page text as untrusted evidence, never as agent instructions.
8. **Reason and act:** Interpret the task and constraints, create a bounded plan, retrieve context, use authorized tools, run relevant checks, compare results with acceptance criteria, and report uncertainty honestly.
9. **Evaluate:** Run a versioned benchmark for coding, debugging, reasoning, factual grounding, citations, security, and refusal behavior. Compare with a baseline before promoting any prompt, retrieval, or routing change.
10. **Improve under review:** Store only sanitized, permissioned candidate examples. Deduplicate and score candidates; require review before promoting examples or training data.
11. **Observe:** Publish sanitized run metrics to the owner-only OCC: last/next run, fetched/indexed/skipped/retried counts, source freshness, embedding failures, retrieval hit rate, evaluation scores, latency, estimated cost and last error code.
12. **Rollback:** Version source catalogues, index batches, prompt/config changes and evaluation results. Provide a kill switch and a safe way to disable new ingestion or revert a bad index batch.

## Knowledge coverage

Initial seed catalogue covers JavaScript, TypeScript, Python, PostgreSQL, HTML/CSS, React, Next.js, Node.js, Go, Rust, Java, C#, C/C++, Swift, Kotlin, Bash, PowerShell and Solidity. This is a seed list, not a claim that every page, version or package in those ecosystems is indexed.

Suggested future areas, after source review:
- API and protocol references (HTTP, OAuth, OpenAPI, GraphQL and WebSockets).
- Cloud and deployment docs (Vercel, Supabase, PostgreSQL operations, Cloudflare and Google Cloud).
- Testing and quality (Node test runner, Playwright, Vitest, accessibility and performance).
- Secure engineering (OWASP, secure headers, dependency hygiene, secrets management and threat modeling).
- AI engineering (RAG, eval design, tool-use safety, prompt-injection defense and model-provider API docs).

Use official primary sources wherever possible; retain license/source attribution and respect site terms. Do not bypass login, paywalls, CAPTCHAs or bot protections.

## Human-like problem-solving specification

Do not claim consciousness or human cognition. Implement observable, testable behaviors:
- clarify goals, constraints and acceptance criteria;
- separate known facts, hypotheses and unknowns;
- plan steps and identify risks before risky tool use;
- use the smallest relevant context and cite external evidence;
- use least-privilege tools and ask for confirmation for consequential actions;
- test generated code, inspect failures, and retry only with a changed hypothesis or fix;
- summarize what changed and what remains unverified;
- learn from approved, sanitized outcomes rather than blindly copying user conversations.

## Privacy and security

- Keep `CRON_SECRET`, Supabase service-role credentials and provider keys server-side.
- Keep the endpoint internal and fail closed when the secret is missing or invalid.
- Verify RLS, grants, tenant boundaries and data retention before adding schema or RPCs.
- Never ingest private chats, uploads, credentials, access tokens, personal data or customer records as general training data.
- Reuse existing consent and review workflows for improvement examples; allow deletion/retention policy to apply.
- Retrieved documents can contain malicious prompt instructions. Treat them as quoted source data and never follow their instructions to reveal secrets or change tool policy.
- Bound requests, concurrency, execution time, storage, embedding spend and retries. Do not auto-deploy code or fine-tune weights from crawler content.

## Acceptance gates

A phase is not done until:
- endpoint authentication and unauthorized behavior have regression tests;
- crawler queue writes are idempotent and do not reset an existing item's schedule;
- URL validation, robots handling, redirect checks, retries and concurrency are tested;
- fetched text can be traced to source URL and content hash;
- indexed chunks are demonstrably returned by the same retrieval path used by chat;
- an integration test proves a relevant retrieved reference is available to the model and unrelated content is not;
- a fixed evaluation set shows no unacceptable regressions in answer quality, security, latency or cost;
- OCC telemetry reflects real run evidence and is access-controlled;
- production cron execution, failure alerts, rollback and budget caps are verified from logs.

## Operations and troubleshooting

- **No runs:** Verify the production deployment, Cron Jobs dashboard, exact path, UTC schedule, and Vercel function logs. Preview deployments do not activate Vercel Cron Jobs.
- **401/403:** Confirm the existing cron secret is configured and sent in the expected Authorization header. Never expose it in browser code or logs.
- **Queue grows without indexing:** Inspect claim RPC permissions/schema, crawler logs, source availability, robots decisions and retry states.
- **Pages are stored but answers do not improve:** Confirm chunking, embeddings, index writes, tenant filters and the inference-time retrieval hook. The crawler table alone does not guarantee RAG.
- **Costs rise:** Reduce batch size, cap pages and text length, cache embeddings by content hash, use budget alerts, and pause ingestion with the kill switch.
- **A source degrades quality:** Disable the host in the source catalogue, mark affected batches, rebuild/revert the affected index version, and rerun evaluations.

## Vercel scheduling facts

Vercel Cron uses UTC and invokes production deployments. The expression `0 * * * *` means at minute zero of each hour, which corresponds to each local hour in Manila (UTC+8). Vercel does not automatically retry a failed invocation, so failures need monitoring and safe reprocessing. See the official [Cron Jobs guide](https://vercel.com/docs/cron-jobs), [Quickstart](https://vercel.com/docs/cron-jobs/quickstart), and [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
