# Operations (Phase 10)

How to run NasrinAI in production and what to do when something goes wrong.

## Before each release

1. CI is green (tests, secret scan, database tests).
2. Supabase migrations are run in order, each once (all are safe to re-run):
   `001_core` … `005_legal`, `006_connectors`, `007_channels`,
   `008_connector_events`, `009_knowledge_memory`, `010_connector_oauth`,
   `011_knowledge_only`, `012_library`, `013_projects`, `014_storage`,
   `015_daily_token_reservations`, `015_retention`,
   `016_hardening`, `016_weekly_paid_token_allowances`,
   `017_nasrinai_connect`, `017_retention_config`, `017_videos`,
   `018_improvement_consent`, `018_marketing_cache`, `018_nasrinai_connect_keys`,
   `019_improvement_examples`, `019_nasrinai_connect_approval`,
   `020_improvement_review_deletion`, `020_nasrinai_connect_publishable_key`,
   `021_nasrinai_connect_account_owner`, `022_security_boundary`,
   `023_semantic_cache_search_path`, `024_security_definer_search_path`,
   `025_global_spend_reservations`, `026_daily_realtime_voice_allowances`, `027_disable_platform_tenant_token_ceiling`, `028_explicit_server_only_rls_policies`, `029_media_bucket_size_limit`, `030_ai_automation`, `031_chat_uploads_bucket`, `032_automation_server_only_rls`, `033_automation_run_identity_fk`, `034_security_definer_temp_path`, and `035_chat_uploads_allow_any_type`.
3. **Migration-history gate:** before applying pending SQL, reconcile production migration versions/names and actual schema using [Database migration reconciliation](db-migration-reconciliation.md). Historical prefixes are duplicated and migration 029 documents a production label that conflicts with repository migration 026. Do not renumber historical files or blindly apply migrations to resolve that mismatch. The live production state must be verified directly.
4. After deploying: open `https://www.nasrinai.com/healthz` (should say ok), then
   `node scripts/eval/run.js --suite quality` and `--suite redteam`.
5. Vercel → Logs: no `setting ignored` lines you did not expect. Confirm provider-side spend caps and billing alerts are enabled for every configured model/media provider.
6. In Supabase migration history, verify that `015_daily_token_reservations`, `016_weekly_paid_token_allowances`, `025_global_spend_reservations`, and `026_daily_realtime_voice_allowances` are applied. Missing token RPCs block token-limited calls; verify migration history before changing production schema.
7. Verify Vercel's production environment variables and the active Supabase project directly in their dashboards. Repository code and a Ready preview do not prove that production secrets, migrations, payment webhook mode, or provider keys are correct.
8. Application-side estimated USD budgets and per-model cost caps have been removed. Enable provider-side spending limits and alerts for every configured provider. Realtime voice still requires migration `026_daily_realtime_voice_allowances`; it atomically tracks daily use per account across sessions/devices (Quick 5m, Pro 15m, Max 20m, Ultra 30m), resetting at Manila midnight. It also reserves `REALTIME_TOKEN_RESERVE_PER_MINUTE` units per started minute (default 10,000) against the paid actor allowance when applicable. The platform-wide token ceiling is disabled; business tenants retain their configured tenant ceiling. These are conservative quota units, not exact provider token counts. Sessions may be shortened/refused by a paid tier allowance or token/abuse controls.

## Turnstile sign-in protection

Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` together in Vercel for each environment that should use the challenge. The site key is public; the secret must remain a Sensitive server environment variable and must never be placed in client code. Configure Supabase Dashboard → Authentication → Bot and Abuse Protection → CAPTCHA to use Cloudflare Turnstile and enter the same secret for email OTP verification. The application uses Turnstile's `interaction-only` appearance so the widget is shown only when Cloudflare requires interaction. Each protected sign-in request gets a single-use token; the client resets the widget after the request finishes, not immediately before the request. Email challenge tokens are passed to Supabase and Google OAuth-start tokens are verified server-side. After changing environment variables, redeploy and test both email OTP and Google sign-in. If either key is missing, configuration fails; with both absent, Turnstile remains disabled.

**Troubleshooting "Security check failed" on email codes.** The page shows this when Supabase Auth rejects the CAPTCHA. Check Supabase → Logs → Auth for `/otp` warnings:

- `no captcha_token found`: the server sent the token in the wrong field. Fixed by sending it as `gotrue_meta_security.captcha_token` (see `test/signin.test.js`). Every email sign-in failed this way until that fix (seen 2026-10-11).
- `invalid-input-secret` or similar: the Turnstile secret in Supabase's CAPTCHA settings does not belong to the widget whose site key is in Vercel. Re-enter the matching secret in Supabase.
- `timeout-or-duplicate`: the token was expired or reused. The page resets the widget after each request; ask the user to try again.

## Manual live quality and red-team evaluations

The `.github/workflows/manual-live-evaluations.yml` workflow is intentionally manual; it does not run on pushes or pull requests. It lets an operator launch the existing evaluation suites from GitHub Actions, including from a phone.

1. Open **Actions → Manual live evaluations → Run workflow** on the `main` branch.
2. Select `quality`, `redteam`, or `both`.
3. Enable the explicit confirmation checkbox only when you intend to send live requests to `https://www.nasrinai.com`, then run the workflow.
4. Open the run and inspect the step output. Successful suites print a passed/total count. Download the `nasrinai-live-evaluation-reports` artifact for the JSON reports; artifacts are retained for 7 days.

The repository currently has no `package-lock.json` or `npm-shrinkwrap.json`, so this workflow installs declared dependencies using `npm install --no-package-lock --ignore-scripts` instead of `npm ci`. This avoids the clean-install failure caused by the missing lockfile and avoids running dependency lifecycle scripts. For fully reproducible installs, add and review a committed lockfile in a separate change before switching this workflow back to `npm ci`.

**Token quota policy:** Quick users have no per-user token ceiling and platform users/guests do not share a tenant-wide token ceiling. Pro, Max and Ultra retain their weekly paid-model allowances; reaching one falls back to Quick. Shared per-IP abuse protections, image limits and daily realtime voice allowances remain enforced. Business tenants retain their configured tenant token ceiling. Migration `027_disable_platform_tenant_token_ceiling` must be applied after `026_daily_realtime_voice_allowances`; its database RPC change is required alongside the application changes. Token usage is still recorded for accounting and abuse monitoring; provider-side billing and spend caps govern actual cost.

**Live evaluation authentication:** use the canonical production host `https://www.nasrinai.com` directly for all requests. The apex domain may redirect to `www`; a cross-origin redirect can cause Node fetch to omit the `Authorization` header, making a valid guest token appear unauthenticated. Before sending any chat cases, the evaluator checks the issued guest credential with `GET /v1/whoami`. If that check fails, it writes a report with the HTTP status, safe error code, and request ID when available, then stops without sending chat requests. Never log the guest token. For chat failures, the evaluator records the HTTP status, safe error code, request ID when available, and `Retry-After` header when present. On the first HTTP 429 it stops sending further cases, marks remaining cases as skipped, and reports the full suite size so rate limits are not repeatedly hit. Use these diagnostics to distinguish rate-limit causes before changing production limits; do not raise abuse limits merely to make a test suite pass.

**Cost and safety:** the quality suite sends 6 guest-chat cases; red-team sends 8. Selecting `both` can send up to 14 guest-chat cases, plus a guest-session creation request per suite. These are real production requests and may incur provider costs or consume guest rate limits. Run one suite at a time and do not repeatedly retry failures. The workflow has a 10-minute timeout, serializes runs, uses no provider secrets, and requires an explicit confirmation checkbox. The checkbox is a guardrail, not a hard dollar-spend cap; provider-side spending limits must remain enabled. These evaluations do not prove daily voice allowance or spend-limit exhaustion behavior; test those separately with controlled, specifically designed tests.

## Scheduled retention

Vercel Cron calls `/v1/internal/retention` hourly. The endpoint requires the `CRON_SECRET` bearer token and invokes the idempotent `purge_retention()` Supabase function. It also invokes `purge_improvement_consent()` to remove guest choice records after 24 hours and signed-in choice records after 10 years. It also runs `purge_improvement_examples()` to delete expired examples and any examples whose matching consent is no longer the latest active grant. Set `CRON_SECRET` as a Vercel Sensitive environment variable before production deployment. The job covers inactive signed-in users, guest expiry, and old operational rate-limit counters.

## Watching

In the Supabase SQL Editor:

```sql
-- cost and quality by day, level, task and model
select * from public.routing_daily order by day desc, cost_usd desc;

-- failures in the last 24 hours
select provider, model, task, outcome, count(*)
from public.usage_events
where created_at > now() - interval '24 hours' and outcome <> 'ok'
group by 1, 2, 3, 4 order by 5 desc;

-- Historical USD reservation ledger records (legacy schema; not used as a production spend gate)
select kind, status, count(*) as reservations,
       round(sum(case when status = 'reserved' then reserved_usd else coalesce(actual_usd, 0) end), 4) as usd
from public.spend_reservations
where created_at > now() - interval '30 days'
group by kind, status
order by kind, status;
```

## When something goes wrong

| What you see | What to do |
| --- | --- |
| Chat says it cannot answer | Logs: `model call failed`. Key or quota: fix in OpenAI. Quick switches: `ROUTING=fixed`, `TOOLS_ENABLED=false`, then Redeploy. |
| Provider billing / spend alerts | Review provider dashboards and account-level caps. NasrinAI does not enforce estimated USD budgets. |
| Pictures fail | Logs: `image failed` (has the provider's reason). Off switch: remove `GEMINI_API_KEY`. |
| A bad release | Vercel → Deployments → the previous good one → ⋯ → Promote to Production. |
| Abuse from one business | `update public.tenants set status = 'suspended' where id = '<id>';` (all its keys stop at once). |
| One key leaked | Revoke it: `update public.api_keys set revoked_at = now() where id = '<key id>';` |

## If a server secret leaks

Change it at its source, put the new value in Vercel (Sensitive), Redeploy.

| Secret | Effect of changing it |
| --- | --- |
| `OPENAI_API_KEY`, `GEMINI_API_KEY` | none for users |
| `SUPABASE_SECRET_KEY` | none for users (rotate in Supabase first) |
| `GUEST_SESSION_SECRET` | every guest starts a new session; guest chats are no longer reachable |
| `PAYMONGO_*` | new webhook secret must match PayMongo's |
| `FACEBOOK_APP_SECRET` | none, if updated in Meta at the same time |
| `CONNECTOR_SECRET_KEY` | every business must send its connector keys, webhook secrets and Page tokens again |

## Data

- Guest chats and their pictures: deleted after 24 hours.
- Signed-in users' pictures: 30 days by default, or the user's selected retention period. The application setting is the source of truth.
- Connector events: 30 days. Memories: until the person deletes them or the account.
- Backups: Supabase manages database backups according to the project's plan and settings. **Application deletion does not guarantee immediate removal from provider backups.** Before launch, verify the project's backup/PITR retention and keep the verified period synchronized with the Privacy Notice.


## Owner Console operational alerts (Phase 3)

The scheduled `/v1/internal/owner-alerts` job runs every five minutes and is protected by the existing `CRON_SECRET` bearer token. It inspects aggregate operational signals from the previous 15 minutes and writes deduplicated alerts to the server-only outbox in migration 059. It never reads prompts, message bodies, emails, workflow payloads, or raw IP addresses.

Optional delivery uses `OWNER_ALERT_WEBHOOK_URL` with a Slack incoming webhook (`hooks.slack.com/services/...`) or a Discord webhook (`discord.com/api/webhooks/...`). Only exact HTTPS provider hosts and expected paths are accepted; redirects are rejected. Keep the webhook URL as a Sensitive server environment variable and never expose it to the browser. Set thresholds using `OWNER_ALERT_AI_FAILURE_THRESHOLD` (default 5), `OWNER_ALERT_AUTOMATION_FAILURE_THRESHOLD` (default 3), and `OWNER_ALERT_STALE_RUN_THRESHOLD` (default 1). If no supported webhook is configured, monitoring still queues deduplicated alerts but does not dispatch them. Configure a real provider webhook before relying on delivery.

Migration 057 and the existing Auth audit migration 058 must be applied before migration 059. Delivery attempts are retried with bounded exponential backoff and stop after eight attempts; inspect provider delivery and database health during rollout. This first release covers AI failure spikes, automation failure spikes, and stale automation. It does not yet reconcile settled PayMongo payouts or deliver alerts for billing/deployment/security events.
