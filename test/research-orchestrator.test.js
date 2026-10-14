import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planResearch, buildEvidenceLedger, buildResearchReport, measureResearchQuality } from '../src/research-orchestrator.js';

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


test('Phase 4 report binds every citation to a successfully read source and exposes review limits', () => {
  const evidence = buildEvidenceLedger([
    { fact: 'The service reduced request latency in the reported test.', url: 'https://a.example/report', title: 'Report A' },
    { fact: 'The service reduced request latency in the reported test.', url: 'https://b.example/study', title: 'Study B' },
    { fact: 'The service does not reduce request latency in the reported test.', url: 'https://c.example/study', title: 'Study C' }
  ]);
  const report = buildResearchReport(evidence, [
    { url: 'https://a.example/report', status: 'read', title: 'Report A' },
    { url: 'https://b.example/study', status: 'read', title: 'Study B' },
    { url: 'https://c.example/study', status: 'skipped', title: 'Study C' },
    { url: 'https://d.example/page', status: 'skipped', title: 'Skipped page' }
  ]);
  assert.equal(report.findings.length, 2);
  assert.equal(report.findings[0].confidence, 'corroborated');
  assert.deepEqual(report.findings[0].citations.map((source) => source.url), [
    'https://a.example/report', 'https://b.example/study'
  ]);
  assert.equal(report.findings[1].confidence, 'uncited');
  assert.deepEqual(report.findings[1].citations, []);
  assert.equal(report.citation_integrity.all_findings_have_read_source, false);
  assert.equal(report.limitations.findings_without_read_source, 1);
  assert.ok(report.conflicts.every((item) => item.status === 'needs_review'));
});


test('Phase 5 quality metrics report source, citation, evidence, and adapter coverage deterministically', () => {
  const evidence = buildEvidenceLedger([
    { fact: 'The service reduced request latency in the reported test.', url: 'https://a.example/report', title: 'Report A' },
    { fact: 'The service reduced request latency in the reported test.', url: 'https://b.example/study', title: 'Study B' },
    { fact: 'The service does not reduce request latency in the reported test.', url: 'https://c.example/study', title: 'Study C' }
  ]);
  const sources = [
    { url: 'https://a.example/report', status: 'read', title: 'Report A' },
    { url: 'https://b.example/study', status: 'read', title: 'Study B' },
    { url: 'https://c.example/study', status: 'skipped', title: 'Study C' }
  ];
  const report = buildResearchReport(evidence, sources);
  const quality = measureResearchQuality({
    report, sources,
    adapters: [{ id: 'web-search', status: 'ok' }, { id: 'crossref', status: 'unavailable' }]
  });
  assert.deepEqual(quality.sources, { discovered: 3, read: 2, failed_or_skipped: 1, read_rate: 0.6667 });
  assert.deepEqual(quality.citations, { findings: 2, cited_findings: 1, uncited_findings: 1, coverage: 0.5 });
  assert.equal(quality.evidence.conflicts_needing_review, report.conflicts.length);
  assert.equal(quality.adapters.checked, 2);
  assert.equal(quality.adapters.failures, 1);
  assert.match(quality.note, /do not establish that findings are true/);
  assert.equal(measureResearchQuality({}).sources.read_rate, null, 'zero denominators remain undefined');
});
