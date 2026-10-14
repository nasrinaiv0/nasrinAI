import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResearchSourceRegistry } from '../src/research-sources.js';

test('registry normalizes and deduplicates public URL candidates and rejects invalid adapter registrations', async () => {
  const registry = createResearchSourceRegistry({ webSearch: { async search() { return { citations: [{ url: 'https://docs.example.com/start', title: 'Docs' }, { url: 'https://docs.example.com/start' }, { url: 'javascript:alert(1)' }, { url: 'https://user:pass@docs.example.com/private' }] }; } }, fetchImpl: null });
  const result = await registry.discover({ query: 'API basics', plan: { searchQueries: ['API basics'] } });
  assert.equal(result.candidates.length, 1); assert.equal(result.candidates[0].adapter, 'web-search'); assert.equal(result.candidates[0].title, 'Docs');
  assert.throws(() => registry.register({ id: 'web-search', discover: async () => [] }), /already registered/);
  assert.throws(() => registry.register({ id: '', discover: async () => [] }), /needs an id/);
});

test('Crossref contributes scholarly metadata alongside healthy web results', async () => {
  let called = 0;
  const registry = createResearchSourceRegistry({ webSearch: { async search() { return { citations: [{ url: 'https://docs.example.com/api' }] }; } }, fetchImpl: async (url, options) => {
    called++; assert.equal(new URL(url).origin, 'https://api.crossref.org'); assert.match(options.headers['User-Agent'], /NasrinAI/);
    return { ok: true, async json() { return { message: { items: [{ DOI: '10.1234/example', URL: 'https://doi.org/10.1234/example', title: ['A paper title'], publisher: 'Example Press', published: { 'date-parts': [[2024]] } }] } }; } };
  } });
  const result = await registry.discover({ query: 'academic literature review about AI tutoring', plan: { searchQueries: ['AI tutoring papers'] } });
  assert.equal(called, 1); assert.ok(result.candidates.some((c) => c.adapter === 'crossref' && c.metadata.doi === '10.1234/example')); assert.ok(result.candidates.some((c) => c.adapter === 'web-search'));
});

test('one adapter failure is isolated from healthy adapters', async () => {
  const registry = createResearchSourceRegistry({ webSearch: { async search() { throw new Error('provider down'); } }, fetchImpl: null });
  registry.register({ id: 'healthy', async discover() { return [{ url: 'https://healthy.example/research', title: 'Healthy' }]; } });
  const result = await registry.discover({ query: 'research basics' });
  assert.ok(result.candidates.some((c) => c.adapter === 'healthy')); assert.equal(result.adapters.find((a) => a.id === 'web-search').status, 'unavailable');
});

test('Crossref is skipped for nonacademic questions', async () => {
  let called = false; const registry = createResearchSourceRegistry({ fetchImpl: async () => { called = true; throw new Error('should not call'); } });
  const result = await registry.discover({ query: 'How to use this API?' });
  assert.equal(called, false); assert.equal(result.adapters.find((a) => a.id === 'crossref').status, 'no_results');
});