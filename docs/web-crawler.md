# NasrinAI core web crawler and multimodal metadata index

This is the **main NasrinAI research/retrieval crawler**, not NasrinAI Connect. It uses research-discovered public URLs as seeds, reads public HTML with the existing SSRF-safe reader, follows a bounded number of ordinary links, refreshes indexed pages on a schedule, and stores extracted text plus image/video/audio/transcript URL metadata for retrieval.

## Deployment

1. Apply `db/migrations/037_core_web_crawler.sql` in Supabase after migrations 001–036.
2. Deploy the branch/PR with the existing `CRON_SECRET` set (the existing secret is reused; do not create a second one).
3. Vercel invokes `/v1/internal/web-crawl` hourly. Each invocation is bounded to a small batch.
4. Research-discovered URLs seed the frontier. The crawler follows at most three discovery levels and limits links/media per page.

## Scope and safeguards

- This is not a claim to crawl every website on the internet. Coverage grows from research/search discoveries and links reachable from them.
- Only public HTTP(S) pages on standard ports are accepted by the shared reader; DNS/IP checks prevent SSRF and redirect escapes.
- robots.txt exclusions are respected. No login, CAPTCHA, paywall, bot-blocker bypass, JavaScript execution, or binary media downloading.
- Multimodal indexing records public asset URLs and available alt/title metadata; it does not yet run OCR on images, transcribe audio, or decode video frames.
- The queue and page index are service-role only; the internal cron endpoint requires `CRON_SECRET`.
- Run `npm test` and the repository's required CI/database checks before merging. The migration must be applied separately in Supabase.
