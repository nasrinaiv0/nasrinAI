# Direct-provider billing reconciliation

The Owner Command Center Finance panel can read organization-level billing reports for first-party OpenAI and Anthropic usage. These integrations are read-only and optional.

## Vercel environment variables

Set these as server-only Production environment variables in the NasrinAI project, then redeploy:

- `OPENAI_ADMIN_KEY`: an OpenAI organization Admin API key with permission to read organization costs. A normal inference key is not a substitute.
- `ANTHROPIC_ADMIN_KEY`: an Anthropic Admin API credential permitted to read organization usage/cost reports. Workspace-scoped inference keys do not work.

Do not use `NEXT_PUBLIC_*`, put either key in browser code, or send them to a client. The keys are only loaded into server-side owner-console configuration and are never returned by the endpoint. These credentials are independent from the inference keys used for model calls.

## What is reported

The protected `GET /owner/api/provider-billing?window=7d` endpoint supports `7d`, `30d`, and `90d`. It fetches the OpenAI organization Costs API and Anthropic organization Cost Report API independently. A provider can be `available`, `not_configured`, or `unavailable` without blocking the other provider.

- OpenAI amounts are read from organization cost buckets.
- Anthropic amounts are converted from the API's reported cents to USD.
- The UI displays provider totals and source status separately from request-level telemetry and OpenRouter totals.
- No prompts, completions, API keys, raw provider error bodies, or account identifiers are shown.
- These APIs return organization-level aggregate cost reports. They are **not** exact per-request costs, and the dashboard does not allocate them to individual calls or add them to request-level costs.
- If the provider does not return cost rows, the total is `null`, not an invented zero.

## Request-level estimates

Request-level estimates require observed token categories and a versioned, maintained pricing table. Estimates must remain separate from actual provider-reported request costs and organization-level reconciled spend. Do not treat `usage_events.cost_usd` as provider-billed spend unless its provenance explicitly confirms it came from the provider. Gemini and other direct providers need their own supported billing-source strategy; this change does not claim their spend is reconciled.
