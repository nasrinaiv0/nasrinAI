import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planResearch, buildEvidenceLedger } from '../src/research-orchestrator.js';

test('focused questions use one search; complex questions plan domain-aware parallel searches', () => {
  assert.deepEqual(planResearch('What is photosynthesis?').searchQueries, ['What is photosynthesis?']);
  const academic = planResearch('Prepare an academic literature review comparing the effectiveness and limitations of AI tutoring systems in higher education.');
  assert.equal(academic.depth, 'deep');
  assert.equal(academic.domain, 'academic');
  assert.equal(academic.searchQueries.length, 3);
  assert.match(academic.searchQueries[1], /Peer-reviewed studies/);
  assert.match(academic.searchQueries[2], /Counterarguments/);
  assert.equal(planResearch('Compare API security architecture and benchmark results').domain, 'technical');
  assert.equal(planResearch('Compare industry market adoption and pricing trends').domain, 'industry');
});

test('evidence ledger deduplicates facts, preserves provenance, and flags possible conflicts', () => {
  const ledger = buildEvidenceLedger([
    { fact: 'The system reduces latency by 20 percent.', url: 'https://a.example/paper', title: 'Study A' },
    { fact: 'The system reduces latency by 20 percent.', url: 'https://b.example/report', title: 'Report B' },
    { fact: 'The system does not reduce latency by 20 percent.', url: 'https://c.example/paper', title: 'Study C' },
    { fact: 'A different result about memory usage was measured.', url: 'https://d.example/paper', title: 'Study D' },
    { fact: 'too short', url: 'https://e.example/' }
  ]);
  assert.equal(ledger.facts.length, 3);
  assert.equal(ledger.facts[0].source_count, 2);
  assert.equal(ledger.facts[0].confidence, 'corroborated');
  assert.deepEqual(ledger.facts[0].sources.map((s) => s.url), ['https://a.example/paper', 'https://b.example/report']);
  assert.equal(ledger.source_count, 4);
  assert.ok(ledger.contradictions.length >= 1);
  assert.equal(ledger.contradictions[0].status, 'needs_review');
});
