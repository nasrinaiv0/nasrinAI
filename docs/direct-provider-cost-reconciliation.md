# Direct-provider cost reconciliation

The Owner Command Center (OCC) separates **provider-reported actual costs**, **request-level list-price estimates**, and **organization-level billing reconciliation**. These figures must never be blended into one unlabeled number.

## Optional provider billing credentials

Set these as server-only Production environment variables in the NasrinAI project, then redeploy:

- `OPENAI_ADMIN_KEY`: an OpenAI organization Admin API key permitted to read organization costs. A normal inference key is not a substitute.
- `ANTHROPIC_ADMIN_KEY`: an Anthropic Admin API credential permitted to read organization cost reports.

Do not use `NEXT_PUBLIC_*`, put either key in browser code, or send them to a client. The keys are loaded only into server-side owner-console configuration and are never returned by the endpoint. They are independent from `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`.

## Organization-level billing

The protected `GET /owner/api/provider-billing?window=7d` endpoint supports `7d`, `30d`, and `90d`. It fetches the OpenAI organization Costs API and Anthropic organization Cost Report API independently.

- OpenAI amounts come from organization cost buckets.
- Anthropic amounts come from the organization Cost Report API; the adapter follows the provider's page cursor and converts reported cents to USD.
- A provider can be `available`, `not_configured`, or `unavailable` without blocking the other.
- These are organization-level aggregate billing totals. They are **not** assigned to individual requests and must not be added to request-level costs.
- Anthropic's standard Cost Report API excludes Priority Tier costs; review Anthropic usage reporting separately if Priority Tier is used.

Official references: [OpenAI API pricing and usage documentation](https://developers.openai.com/api/docs/pricing), [Anthropic Cost Report API](https://platform.claude.com/docs/en/api/http/beta/organization/cost_report/retrieve), [Anthropic Usage and Cost API guide](https://platform.claude.com/docs/en/manage-claude/usage-cost-api).

## Request-level estimates

Migration `077_direct_provider_estimated_costs.sql` adds separate columns for estimate amount, source, pricing version, and estimate timestamp. It does not loosen migration 062's rule that `usage_events.cost_usd` and `cost_source` are reserved for provider-reported actual costs.

- OCC AI Logs prefers verified actual cost when available. Otherwise it displays a marked estimate (`~`) with the pricing-registry version and source.
- OCC Finance shows a separate aggregate of request-level estimates grouped by provider and model through `owner_console_estimated_cost_summary`.
- Estimates use observed token counts and the maintained `config/model-prices.json` registry. Unknown model IDs remain unknown; no nearest-model price is guessed.
- Pricing registry version: `2026-10-26-v1`.
- Gemini estimates use paid Standard list prices because the runtime cannot establish whether a particular request consumed free quota. The estimate is not a claim that Google charged that amount.
- Current priced direct text models include GPT-6 Luna, GPT-6.1 Sol, Gemini 3.8 Flash, Gemini 3.1 Flash-Lite, and Claude Haiku 5.5 / Sonnet 5.5 / Opus 5.5. Unknown/unpriced models and non-token products remain unavailable until a reviewed rate is added.
- Anthropic cache-read tokens are counted separately from uncached input tokens. Haiku 5.5 uses its higher listed rate when total prompt tokens exceed 100K.
- Estimates do not include unsupported usage dimensions such as image/video generation, search grounding, audio, discounts, free quota, or provider-specific taxes/credits. Those require separate provider telemetry or billing reconciliation.

Official price snapshots used for this version: [OpenAI API pricing](https://developers.openai.com/api/docs/pricing), [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing), and [Anthropic API pricing](https://platform.claude.com/docs/en/about-claude/pricing).

## Gemini and other providers

Gemini direct inference is estimated from token usage where its model has a verified registry entry. No Google Cloud billing total is claimed in this change; that requires a separately configured Cloud Billing export or a supported billing source tied to the correct billing account. Other direct providers without a verified price row or usable billing endpoint remain `unknown`, not zero.

## Deployment checklist

1. Apply database migration 077 after migration 076.
2. Add `OPENAI_ADMIN_KEY` and/or `ANTHROPIC_ADMIN_KEY` to Vercel as server-only variables if organization billing is desired.
3. Deploy the application.
4. Open OCC Finance and refresh the direct-provider billing and request-estimate panels.
5. Confirm each figure's source label; never add aggregate billing totals to request-level costs.
