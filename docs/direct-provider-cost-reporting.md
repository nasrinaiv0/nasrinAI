# Cerebras and Cloudflare cost reporting

## Request-level estimates

The owner console's request estimate registry now includes these direct-provider model prices. Values are public list-price snapshots in USD per million tokens and are estimates, not invoices.

- Cerebras Developer tier: `gpt-oss-120b` ($0.35 input / $0.75 output) and `qwen-3.8-27b` ($0.99 input / $1.49 output).
- Cloudflare Workers AI: selected models have their published input/output rates in `config/model-prices.json`.

Unknown model IDs remain unavailable instead of inheriting a similar model's price. Cloudflare's neuron-based/free allocation and account-level adjustments are not allocated to individual requests. Pricing is versioned as `2026-10-26-v2`.

## Cloudflare account billing

The owner-only `GET /owner/api/provider-billing?window=7d|30d|90d` report can read Cloudflare's account-level Billable Usage API. Configure these server-side Vercel environment variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_BILLING_API_TOKEN` — a Cloudflare API token with Billing Read access.

The endpoint uses the Cloudflare account `/billable-usage` API, parses `ContractedCost` only when `BillingCurrency` is USD, and marks data freshness as daily. This API covers account-level Cloudflare products, not only Workers AI, and totals must not be allocated to individual model calls or added to request-level estimates.

Keep the token server-only. The owner console is gated by the existing owner email/IP allowlist and short-lived session.

## Cerebras actual billing

This implementation adds request estimates for Cerebras but does not claim an actual-billing API integration. The integration reports Cerebras actual spend as unavailable and directs the owner to the provider dashboard until a verified, supported billing API is available.

## Sources

- Cerebras pricing: https://www.cerebras.ai/pricing
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Cloudflare Billable Usage API: https://blog.cloudflare.com/billable-usage-api/
