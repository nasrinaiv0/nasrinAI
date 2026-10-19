// Unified professional-intelligence search planning.
// LinkedIn's API is intentionally not treated as a general-purpose search API:
// only separately authorized LinkedIn integrations may supply LinkedIn data.
import { HttpError } from './http/errors.js';

export const PROFESSIONAL_SEARCH_CATEGORIES = Object.freeze([
  'posts_discussions',
  'jobs_hiring',
  'pay_benefits',
  'reviews_workplace',
  'opportunities',
  'terms_requirements'
]);

const CATEGORY_GUIDANCE = Object.freeze({
  posts_discussions: 'public professional posts discussions opinions trends',
  jobs_hiring: 'jobs hiring vacancies recruitment careers openings. Find up to 20 distinct publicly accessible job listings across relevant employers and reputable job boards; include exact title, company, location or remote status, pay range, required qualifications, benefits, responsibilities, and direct source URL when available. Keep each listing separate and source-backed. Explicitly mark missing fields as Not disclosed and never invent salary, employer details, or requirements.',
  pay_benefits: 'salary compensation pay benefits bonus equity',
  reviews_workplace: 'public company reviews workplace culture employee experience',
  opportunities: 'freelance contracts consulting partnerships business opportunities',
  terms_requirements: 'employment contract terms eligibility qualifications requirements benefits'
});

const clean = (value, max = 300) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function buildProfessionalSearch(input = {}) {
  const query = clean(input.query, 300);
  if (query.length < 2) throw new HttpError(400, 'invalid_query', 'Enter at least 2 characters to search.');
  const category = clean(input.category || 'posts_discussions', 40);
  if (!PROFESSIONAL_SEARCH_CATEGORIES.includes(category)) {
    throw new HttpError(400, 'invalid_category', 'Choose a supported professional search category.');
  }
  const location = clean(input.location, 100);
  const dateRange = clean(input.date_range || 'any', 20);
  if (!['any', 'day', 'week', 'month', 'year'].includes(dateRange)) {
    throw new HttpError(400, 'invalid_date_range', 'Choose any, day, week, month, or year.');
  }
  const source = clean(input.source || 'all', 30);
  if (!['all', 'public_web', 'linkedin_authorized'].includes(source)) {
    throw new HttpError(400, 'invalid_source', 'Choose all, public_web, or linkedin_authorized.');
  }
  const terms = [query, CATEGORY_GUIDANCE[category], location, dateRange === 'any' ? '' : 'published in the last ' + ({ day: '24 hours', week: '7 days', month: '30 days', year: '12 months' }[dateRange])].filter(Boolean);
  // LinkedIn API data is a distinct source channel. Never silently pretend that
  // a public-web result came from LinkedIn or that an unapproved API is active.
  return Object.freeze({
    query,
    category,
    location: location || null,
    date_range: dateRange,
    source,
    discovery_query: terms.join(' '),
    source_policy: {
      public_web: source !== 'linkedin_authorized',
      linkedin_authorized: source !== 'public_web',
      linkedin_status: 'requires_configured_approved_linkedin_api',
      separation: 'Keep LinkedIn API records in a distinct result group from third-party web research.'
    }
  });
}

export function presentProfessionalSearch(scan, plan) {
  const sources = Array.isArray(scan?.sources) ? scan.sources : [];
  const facts = Array.isArray(scan?.facts) ? scan.facts : [];
  const publicWebSources = sources.map((item) => ({
    ...item,
    channel: 'public_web',
    retrieved_at: item.retrieved_at || null
  }));
  return {
    ...scan,
    professional_search: {
      category: plan.category,
      filters: { location: plan.location, date_range: plan.date_range, source: plan.source },
      source_groups: [
        { id: 'public_web', label: 'Public web research', status: plan.source === 'linkedin_authorized' ? 'not_requested' : 'available', sources: plan.source === 'linkedin_authorized' ? [] : publicWebSources, facts: plan.source === 'linkedin_authorized' ? [] : facts },
        { id: 'linkedin_authorized', label: 'LinkedIn authorized API', status: plan.source === 'public_web' ? 'not_requested' : 'not_configured', sources: [], facts: [], limitation: 'Requires a LinkedIn developer app, approved product permissions, and a supported endpoint. General people/posts/jobs search is not implied by sign-in permission.' }
      ],
      analysis_note: 'Findings are limited to sources actually retrieved. Salary and workplace-review statements are attributed to their cited sources and are not assumed representative.'
    }
  };
}

// Preserve the existing Research agent's explicit-URL workflow when professional
// intelligence is used against user-supplied public pages. The Research agent
// remains responsible for URL safety, robots.txt, page limits, and extraction.
export function buildProfessionalResearchInput(input = {}, plan = buildProfessionalSearch(input)) {
  const result = { query: plan.discovery_query };
  if (input.urls !== undefined) {
    if (!Array.isArray(input.urls) || input.urls.length > 5 || input.urls.some((url) => typeof url !== 'string')) {
      throw new HttpError(400, 'invalid_urls', 'Give up to 5 web addresses.');
    }
    result.urls = input.urls;
  }
  return result;
}
