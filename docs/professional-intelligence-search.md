# Professional intelligence search

This feature builds a unified query on top of the existing public-web research pipeline. Categories are Posts & discussions, Jobs & hiring, Pay & benefits, Reviews & workplace, Opportunities, and Terms & requirements.

## API

`POST /v1/professional-search` (same caller authentication and `chat` scope as research):

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
- `location`: optional free-text location filter.
- `date_range`: `any`, `day`, `week`, `month`, or `year`.
- `source`: `all`, `public_web`, or `linkedin_authorized`.
- Response contains the existing research scan plus `professional_search.source_groups`, keeping public-web findings separate from LinkedIn API results.

## Source and API boundaries

The public-web adapter uses the existing web search, public page reader, SSRF checks, and robots.txt policy. Search results are candidates, not verified facts; citations and timestamps are included only when available from the source. Date filters currently guide discovery queries and do not guarantee strict publication-date filtering.

LinkedIn is explicitly marked `not_configured` until an official LinkedIn app, approved product permissions, OAuth flow appropriate to the approved product, and a supported endpoint have been configured. LinkedIn sign-in permission does not grant unrestricted search across posts, members, jobs, employee reviews, salaries, or opportunities. Do not use scraping, session cookies, fake accounts, or access-control workarounds. Keep any future LinkedIn API result group separate from third-party web results and honor LinkedIn's terms.

## Limitations

- The API is a research endpoint; this commit does not add a dedicated browser UI.
- Company reviews and pay reports may be anecdotal, incomplete, or out of date. The UI should retain source links and explain that they are not representative samples.
- LinkedIn API credentials and product approval are not included in the repository and must be configured by the owner.
