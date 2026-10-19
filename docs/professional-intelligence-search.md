# Professional intelligence search

NasrinAI has one authenticated API for six professional-intelligence categories: Posts & discussions, Jobs & hiring, Pay & benefits, Reviews & workplace, Opportunities, and Terms & requirements. The browser UI is not part of this backend change yet.

## Search API

`POST /v1/professional-search` (requires the normal authenticated `chat` scope):

```json
{
  "query": "AI operations manager",
  "category": "jobs_hiring",
  "location": "Philippines",
  "date_range": "month",
  "source": "all"
}
```

- `category`: `posts_discussions`, `jobs_hiring`, `pay_benefits`, `reviews_workplace`, `opportunities`, `terms_requirements`.
- `location`: optional free-text location.
- `date_range`: `any`, `day`, `week`, `month`, or `year`. Currently this guides public-web discovery; it is not a guarantee of strict date filtering.
- `source`: `all`, `public_web`, or `linkedin_authorized`.
- Optional `organization_id` requests authorized LinkedIn organization-post results for the `posts_discussions` category. It is a numeric LinkedIn organization ID, not a member ID.
- Public-web results and LinkedIn API records remain in separate `professional_search.source_groups`.

## LinkedIn official API connection

The backend integration adds these authenticated endpoints:

- `GET /v1/linkedin/status` — connection and capability status.
- `POST /v1/linkedin/connect` — returns the official LinkedIn OAuth authorization URL.
- `GET /v1/linkedin/callback` — exchanges the authorization code and stores encrypted tokens.
- `DELETE /v1/linkedin` — disconnects the current user's LinkedIn account.
- `GET /v1/linkedin/organization-posts?organization_id=123&query=keyword&count=10` — retrieves posts for an organization only when the approved `r_organization_social` scope is present.

### Deployment configuration

Configure these server-side environment variables in Vercel/Render:

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_OAUTH_SCOPES` — default `openid profile email`; include `r_organization_social` only after LinkedIn has approved the corresponding API product and the app has that permission.
- `LINKEDIN_API_VERSION` — optional six-digit version; defaults to `202610`.
- Existing `SITE_URL`/public URL, `CONNECTOR_SECRET_KEY`, `SUPABASE_URL`, and Supabase server secret must already be configured.

Add `https://<your-app-domain>/v1/linkedin/callback` to the LinkedIn app's authorized redirect URLs. Run `db/migrations/043_linkedin_connections.sql` in Supabase after verifying the current production schema. Tokens are encrypted with the existing connector secret key; the table denies browser-role access. Do not expose tokens to the browser or logs.

## Important API limitation

LinkedIn's official APIs are product- and permission-gated; OAuth sign-in is not a general-purpose LinkedIn search API. This integration can retrieve authorized organization posts only if LinkedIn approves the relevant scope and the connected member has the required organization role. It does **not** implement global search over every member's posts, jobs, salary discussions, workplace reviews, opportunities, or terms. Those five categories (and global posts) must not be represented as LinkedIn API results without a supported approved endpoint. Use the existing public-web research pipeline for other accessible sources and label those sources separately.

Do not use scraping, session cookies, fake accounts, or access-control workarounds. LinkedIn API terms restrict collecting content outside the official APIs and constrain combining API content with third-party data. Keep LinkedIn content attributable and distinct, obtain member consent, and honor LinkedIn's terms and data-retention requirements.

## Current limitations

- No dedicated browser search UI is included yet.
- Search result date ranges currently guide public-web discovery but do not guarantee strict date filtering.
- Pay and workplace claims can be anecdotal or non-representative; preserve source attribution and timestamps when available.
- API credentials and LinkedIn product approval must be supplied by the owner; this repository change does not grant approval.
