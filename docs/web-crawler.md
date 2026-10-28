# NasrinAI core web crawler and multimodal metadata index

This is the **main NasrinAI research/retrieval crawler**, not NasrinAI Connect. It uses research-discovered public URLs as seeds, reads public HTML with the existing SSRF-safe reader, follows a bounded number of ordinary links, refreshes indexed pages on a schedule, and stores extracted text plus image/video/audio/transcript URL metadata for retrieval.

## Deployment

1. Review the live schema and migration history, then apply `db/migrations/044_core_web_crawler.sql` through the team's controlled production migration process. Do not assume the database's recorded migration history matches repository filenames.
2. Deploy the branch/PR with the existing `CRON_SECRET` set (the existing secret is reused; do not create a second one).
3. Vercel invokes `/v1/internal/web-crawl` every five minutes; each invocation processes a bounded batch.
4. Vercel invokes `/v1/internal/knowledge-learning` hourly to seed official programming documentation roots and process a small batch. It uses the same `CRON_SECRET` and idempotent queue insertion, so repeated seeds do not reset existing crawl scheduling.
5. Vercel cron expressions use **UTC**. The hourly expression `0 * * * *` therefore fires at minute zero of each UTC hour, which corresponds to the start of each hour in Manila (UTC+8). Vercel Cron runs only on production deployments; confirm invocations in the project's Cron Jobs and function logs after deployment.
6. Research-discovered URLs and official programming-documentation seeds share the same frontier. The crawler follows at most three discovery levels and limits links/media per page.

## Scope and safeguards

- This is not a claim to crawl every website on the internet. Coverage grows from research/search discoveries and links reachable from them.
- Only public HTTP(S) pages on standard ports are accepted by the shared reader; DNS/IP checks prevent SSRF and redirect escapes.
- robots.txt exclusions are respected. No login, CAPTCHA, paywall, bot-blocker bypass, JavaScript execution, or binary media downloading.
- Multimodal indexing records public asset URLs and available alt/title metadata; it does not yet run OCR on images, transcribe audio, or decode video frames.
- The queue and page index are service-role only; the internal cron endpoint requires `CRON_SECRET`.
- A row in `web_crawl_pages` does not automatically mean the page is embedded or searchable through semantic RAG. Confirm chunking, embeddings, schema mapping and inference-time retrieval before claiming the model uses newly crawled information.
- Vercel does not automatically retry a failed cron invocation. Check logs and ensure reprocessing is safe and idempotent.
- Run `npm test` and the repository's required CI/database checks before merging. The migration must be applied separately in Supabase.

See [Continuous Intelligence Runbook](continuous-intelligence-runbook.md) for the target pipeline, monitoring, acceptance gates and troubleshooting.
