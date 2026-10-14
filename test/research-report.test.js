import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderResearchMarkdown, renderResearchHtml, researchExport } from '../src/research-report.js';

const scan = {
  query: 'Compare safe <script>alert("x")</script> research',
  report: {
    findings: [
      { id: 1, finding: 'Evidence suggests this works & needs review.', confidence: 'single_source', citations: [{ url: 'https://example.com/a?x=1&y=2', title: 'Source <one>' }] },
      { id: 2, finding: 'An uncited finding.', confidence: 'uncited', citations: [] }
    ],
    conflicts: [{ finding_ids: [1, 2], status: 'needs_review' }],
    limitations: { findings_without_read_source: 1, single_source_findings: 1 }
  },
  sources: [{ url: 'https://example.com/a?x=1&y=2', title: 'Source <one>', status: 'read' }]
};

test('Markdown export includes findings, citation URLs, source statuses, and limitations', () => {
  const markdown = renderResearchMarkdown(scan);
  assert.match(markdown, /Evidence suggests this works/);
  assert.match(markdown, /https:\/\/example\.com\/a\?x=1&y=2/);
  assert.match(markdown, /No successfully read source is attached/);
  assert.match(markdown, /Potential conflicts needing review: 1/);
});

test('HTML export escapes untrusted report and source text and has safe document metadata', () => {
  const html = renderResearchHtml(scan);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /Source &lt;one&gt;/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('export format is explicit, filenames are sanitized, and JSON remains parseable', () => {
  const md = researchExport(scan, 'markdown');
  assert.equal(md.contentType, 'text/markdown; charset=utf-8');
  assert.match(md.filename, /^[a-z0-9-]+-research\.md$/);
  const html = researchExport(scan, 'html');
  assert.equal(html.contentType, 'text/html; charset=utf-8');
  const json = researchExport(scan, 'json');
  assert.deepEqual(JSON.parse(json.content), scan);
  assert.equal(researchExport(scan, 'pdf'), null);
});
