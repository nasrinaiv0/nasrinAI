import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfessionalSearch, presentProfessionalSearch, PROFESSIONAL_SEARCH_CATEGORIES } from '../src/professional-intelligence.js';

test('supports every professional intelligence category', () => {
  assert.deepEqual(PROFESSIONAL_SEARCH_CATEGORIES, ['posts_discussions', 'jobs_hiring', 'pay_benefits', 'reviews_workplace', 'opportunities', 'terms_requirements']);
  for (const category of PROFESSIONAL_SEARCH_CATEGORIES) {
    const plan = buildProfessionalSearch({ query: 'AI operations', category, location: 'Philippines', date_range: 'month' });
    assert.equal(plan.category, category);
    assert.match(plan.discovery_query, /Philippines/);
    assert.match(plan.discovery_query, /30 days/);
  }
});

test('rejects invalid category, date range, source, and too-short query', () => {
  assert.throws(() => buildProfessionalSearch({ query: 'AI', category: 'private_messages' }), { code: 'invalid_category' });
  assert.throws(() => buildProfessionalSearch({ query: 'AI', date_range: 'decade' }), { code: 'invalid_date_range' });
  assert.throws(() => buildProfessionalSearch({ query: 'AI', source: 'scrape_private' }), { code: 'invalid_source' });
  assert.throws(() => buildProfessionalSearch({ query: ' ' }), { code: 'invalid_query' });
});

test('labels public web and LinkedIn API as separate source groups without fabricating LinkedIn results', () => {
  const plan = buildProfessionalSearch({ query: 'remote jobs', category: 'jobs_hiring' });
  const result = presentProfessionalSearch({ sources: [{ url: 'https://example.com/job', status: 'read' }], facts: [{ fact: 'Role is remote', url: 'https://example.com/job' }] }, plan);
  assert.equal(result.professional_search.source_groups[0].id, 'public_web');
  assert.equal(result.professional_search.source_groups[0].sources[0].channel, 'public_web');
  assert.equal(result.professional_search.source_groups[1].id, 'linkedin_authorized');
  assert.equal(result.professional_search.source_groups[1].status, 'not_configured');
  assert.deepEqual(result.professional_search.source_groups[1].sources, []);
});

test('LinkedIn-only request does not mislabel public web sources as LinkedIn', () => {
  const plan = buildProfessionalSearch({ query: 'company reviews', category: 'reviews_workplace', source: 'linkedin_authorized' });
  const result = presentProfessionalSearch({ sources: [{ url: 'https://example.com/review', status: 'read' }], facts: [{ fact: 'A review exists', url: 'https://example.com/review' }] }, plan);
  assert.equal(result.professional_search.source_groups[0].status, 'not_requested');
  assert.deepEqual(result.professional_search.source_groups[0].sources, []);
  assert.equal(result.professional_search.source_groups[1].status, 'not_configured');
});
