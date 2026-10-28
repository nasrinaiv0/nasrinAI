# NasrinAI Master Plan Index for Claude

> Renamed from `CLAUDE_MASTER_PLAN_SUMMARY.md` when PR #365 was merged, because `main` already had a different document with that name: the running progress log, now [CLAUDE_MASTER_PLAN_SUMMARY.md](CLAUDE_MASTER_PLAN_SUMMARY.md). This file is the plan index and rules; it was last updated 2026-10-17 and its statuses are historical snapshots.

**Purpose:** This is the durable handoff and memory index for Claude Code and future contributors working on NasrinAI. Read this file before planning or implementing changes, then read the linked source-of-truth documents relevant to the task.

**Status rule:** This file summarizes plans; it does not prove implementation. Always distinguish **planned**, **documented**, **in development**, **merged**, **deployed**, and **verified in production**. Never report a feature as shipped without checking code, tests, GitHub PR state, configuration, and live behavior where applicable.

**Last updated:** 2026-10-17

## 1. Required continuity rule

Whenever a NasrinAI plan, upgrade, architecture, feature set, implementation phase, or significant decision is created or changed:

1. Update the relevant detailed plan document.
2. Update this file, `docs/CLAUDE_MASTER_PLAN_SUMMARY.md`, with a concise entry, status, dependencies, and links to the detailed source of truth.
3. Record important decisions, exclusions, blockers, PR/branch references, test evidence, and owner actions. Do not rely on chat history alone.
4. Keep historical facts separate from current verified status. If current status has not been checked, label it **needs verification**.
5. Prefer a feature branch and reviewable PR; do not commit directly to `main`, merge, or deploy unless the owner explicitly authorizes that action and repository policy permits it.
6. Before implementing, inspect the current repository, existing code/schema/docs/tests and open PRs. Avoid duplicate documents, tables, routes, adapters, or conflicting implementations.
7. After implementation, update the detailed document and this summary with exact files, migrations, tests run/results, PR link, deployment status, known gaps, and next step.
8. Do not stop after documentation when the approved task requires implementation. Do not claim success without verified evidence.
9. Preserve the project's security requirements, tenant isolation, RLS, authentication/authorization, privacy and consent rules, plan limits, provider policy, compatibility and existing contracts. Never expose credentials or private infrastructure details.

## 2. Product and naming

- **NasrinAI** is the main AI workforce platform.
- **Quick, Pro, Max, Ultra** are the four AI intelligence/subscription tiers. Keep limits configurable as specified by the active plan documents; do not silently hardcode production quotas.
- **NCC means Nasrin Client Connect** and is the CRM, client-management, and workflow-automation product at `ncc.nasrinai.com`.
- **NasrinAI Connect** is a separate product for authorized website/widget integrations. Do not rename NCC to “NasrinAI Control Center.”
- **NCC Automation Studio** is the workflow builder within Nasrin Client Connect.
- **NCC AI Voice Front Desk** is a planned NCC module for inbound customer calls and authorized outbound calls. It is not the same as NasrinAI Connect.
- **Gallery:** `gallery.nasrinai.com`, premium monochrome/minimal motion and animation library with restrained orange accents.
- **NN:** `nn.nasrinai.com`, separate noise-canceling, transcription, meeting-notes and related productivity app.

## 3. Major plan index

Treat the detailed files and actual repository code as the source of truth. File names below should be verified before editing; do not invent a path if it is absent.

| Initiative | Goal / scope | Status rule / next check |
|---|---|---|
| AI orchestration and professional workforce | Detect intent/complexity/profession, select authorized tools and suitable model/provider, consider latency, context, privacy, plan and cost; support Quick/Pro/Max/Ultra | Audit current routing and adapters before claiming coverage |
| Research and education | Stronger web research; relevant sources and clickable citations; target 10 distinct resources for research/study requests when appropriate | Verify source retrieval, citation quality and intent handling |
| Provider pool and quota resilience | Multiple eligible model providers, provider allowlist, quota/error classification, safe fallback, cooldowns and reset recovery | A provider catalog alone does not prove working runtime adapters |
| AI capability awareness and conversation storage | Agent knows actual available capabilities without exposing private internal stack/resources; persist replies only under approved filtering/access/privacy rules | Verify implementation, retention, RLS and secret redaction |
| Autonomous coding / repository assistance | Inspect code, identify issues, propose/fix changes, run tests and report evidence; do not falsely claim merge/deploy/rollback | Use branch/PR review process; protect secrets and production |
| Continuous Intelligence and hourly learning | Seed official programming docs hourly, crawl safely, index through existing knowledge/RAG, evaluate coding/reasoning quality, expose owner-only telemetry, and keep optional fine-tuning reviewed | See `docs/nasrinai-continuous-intelligence-upgrade.md` and `docs/continuous-intelligence-runbook.md`. PR #674 is in development; hourly crawl seeding is not the same as model training. Verify CI, retrieval wiring, schema, production cron logs and OCC metrics before calling it complete. |
| NCC CRM and workflow automation | Contacts, deals, tasks, activities, workflow builder, triggers, logic, connectors, approval outbox, execution queue/workers, logs, retries and analytics | See `docs/ncc.md` and `docs/ncc-upgrade.md`; audit current code and PRs |
| NCC AI Voice Front Desk (planned) | AI disclosure; inbound call answering; approved knowledge; lead capture; verified appointment/CRM actions; human transfer; authorized outbound callbacks/campaigns; consent, suppression, costs, recording/privacy controls | Not shipped until a real telephony adapter, compatible media runtime, verified credentials/webhooks and end-to-end tests exist |
| NCC social, lead and sales automation | Supported official social APIs, approval-first outbound messages/posts, scheduled publishing, lead response/qualification, follow-up workflows, consent/opt-out and CRM analytics | Validate each provider/channel capability; never promise universal integration or universal 1 GB uploads |
| NCC automation runtime | Separate control plane from durable execution plane; scheduler, durable queue/workers, typed nodes, versioned workflows, retries/checkpoints/cancellation, policy checks | Do not assume Vercel request handlers are persistent workers; select runtime after testing |
| Performance and reliability | Images/lazy loading, code splitting, cache, API payload optimization, SQL/index/pagination/render improvements, loading states, CDN and Lighthouse measurements | Benchmark before/after; avoid unjustified infrastructure such as load balancers |
| Motion gallery | Reusable animation/motion patterns; premium minimalist monochrome design with restrained orange | Verify the gallery spec and implementation status |
| NN noise-canceling app | Local AI noise cancellation with native fallback, cloud transcription/summaries, storage choice, notes/meetings/chat/calendar and supported integrations | |

## 4. Continuous Intelligence guardrails

- Treat crawling, indexing, inference-time retrieval, evaluation-driven improvement, and fine-tuning as separate stages.
- A crawler row is not proof of semantic indexing or model improvement.
- Use official sources, robots/SSRF protections, content hashes, bounded batches, cost caps, and idempotent queue writes.
- Never use private chats, credentials, uploads or customer records as general training data; follow consent and retention controls.
- Retrieved page content is untrusted data, not executable instructions.
- Require regression benchmarks and owner approval before promoting learned examples, changing production behavior, or fine-tuning.
- Keep production schedule, retrieval impact and OCC metrics labelled unverified until evidence is collected.

## 5. Source-of-truth docs and handoff

- [Continuous Intelligence upgrade](nasrinai-continuous-intelligence-upgrade.md)
- [Continuous Intelligence runbook](continuous-intelligence-runbook.md)
- [Core web crawler](web-crawler.md)

Update the index and the running summary whenever status changes. Keep PR links, commit SHA, exact test results and production verification evidence in the summary.
