# OCC Google Search & Traffic Analytics

The Owner Command Center's **Google Search & Traffic** panel combines two distinct Google sources:

- **Google Analytics 4 (GA4):** sessions, total users, new users, page views, engagement rate, and top page paths.
- **Google Search Console:** clicks, impressions, click-through rate, average search position, top search queries, and pages appearing in Google Search.

The panel supports 7-, 28-, and 90-day windows and uses completed UTC dates. Google Search Console data is delayed and anonymized queries may be omitted. Search Console clicks are not the same as GA4 sessions; do not add these values together.

## Server-side configuration

Set these variables on the NasrinAI Vercel project, Production environment, and redeploy:

- `GOOGLE_ANALYTICS_PROPERTY_ID`: numeric GA4 property ID, not the Measurement ID that starts with `G-`.
- `GOOGLE_SEARCH_CONSOLE_SITE_URL`: the exact verified property, either `https://nasrinai.com/` for a URL-prefix property or `sc-domain:nasrinai.com` for a domain property.
- `GOOGLE_SEARCH_ANALYTICS_SERVICE_ACCOUNT_JSON`: the full service-account JSON key contents. Keep it server-only; never prefix it with `NEXT_PUBLIC_`, commit it, or expose it in browser code/logs.

In Google Cloud, enable **Google Analytics Data API** and **Google Search Console API**. Create a dedicated service account and grant its email **Viewer** access to the GA4 property. Add the same service-account email as a user with suitable read access to the exact verified Search Console property. The property must be owned/verified in Search Console independently; enabling an API does not verify ownership.

The API requests use read-only OAuth scopes. The OCC endpoint is protected by the existing owner session, allowlist, rate limiter, no-store headers, and server-side authorization. If any configuration is missing, the panel explicitly reports setup required rather than inventing zeros. If a Google source fails independently, that source is shown as unavailable.

## Privacy and interpretation

Only aggregate reports and top page/query rows are returned to the owner UI. No Google credential, access token, email, or raw request headers are returned. Do not use this report as real-time visitor monitoring; GA4 and Search Console have different processing delays and metric definitions.

## Validation

Run `npm test` and `npm run check:secrets`. Confirm a preview with no Google credentials shows the setup-required state, then configure credentials and verify both APIs with real properties before enabling the integration in production.
