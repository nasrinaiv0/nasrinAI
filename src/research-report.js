// Presentation and export helpers for evidence-grounded research reports.
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

const safeFilenamePart = (value) => String(value || 'research')
  .normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  .slice(0, 60).toLowerCase() || 'research';

export function renderResearchMarkdown(scan) {
  const report = scan?.report || {};
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const sources = Array.isArray(scan?.sources) ? scan.sources : [];
  const lines = [
    '# Research report',
    '',
    `**Question:** ${String(scan?.query || 'Research question').replace(/\s+/g, ' ').trim()}`,
    `**Generated:** ${new Date().toISOString()}`,
    '',
    '## Findings',
    ''
  ];
  if (!findings.length) lines.push('No evidence-grounded findings were recorded.', '');
  for (const finding of findings) {
    lines.push(`### ${finding.id}. ${String(finding.finding || '').trim()}`, '');
    lines.push(`**Confidence:** ${finding.confidence || 'uncertain'}`, '');
    const citations = Array.isArray(finding.citations) ? finding.citations : [];
    if (citations.length) {
      lines.push('**Sources:**');
      for (const source of citations) {
        const title = String(source.title || source.url || 'Source').replace(/[\[\]]/g, '');
        lines.push(`- [${title}](${source.url})`);
      }
      lines.push('');
    } else {
      lines.push('_No successfully read source is attached to this finding._', '');
    }
  }
  const conflicts = Array.isArray(report.conflicts) ? report.conflicts : [];
  lines.push('## Review notes', '');
  lines.push(`- Findings without a readable-source citation: ${Number(report.limitations?.findings_without_read_source) || 0}`);
  lines.push(`- Single-source findings: ${Number(report.limitations?.single_source_findings) || 0}`);
  lines.push(`- Potential conflicts needing review: ${conflicts.length}`, '');
  lines.push('## Sources', '');
  for (const source of sources) {
    const title = String(source.title || source.url || 'Untitled source').replace(/[\[\]]/g, '');
    lines.push(`- **${source.status || 'unknown'}** — [${title}](${source.url})`);
  }
  lines.push('', '> Confidence and corroboration labels are review aids, not proof of truth or independent verification.', '');
  return lines.join('\n');
}

export function renderResearchHtml(scan) {
  const report = scan?.report || {};
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const sources = Array.isArray(scan?.sources) ? scan.sources : [];
  const findingHtml = findings.map((finding) => {
    const citations = (Array.isArray(finding.citations) ? finding.citations : []).map((source) =>
      `<li><a rel="noopener noreferrer" href="${escapeHtml(source.url)}">${escapeHtml(source.title || source.url)}</a></li>`
    ).join('');
    return `<article><h2>${escapeHtml(finding.id)}. ${escapeHtml(finding.finding)}</h2><p><strong>Confidence:</strong> ${escapeHtml(finding.confidence || 'uncertain')}</p>${citations ? `<h3>Sources</h3><ul>${citations}</ul>` : '<p>No successfully read source is attached to this finding.</p>'}</article>`;
  }).join('\n');
  const sourceHtml = sources.map((source) =>
    `<li><strong>${escapeHtml(source.status || 'unknown')}</strong> — <a rel="noopener noreferrer" href="${escapeHtml(source.url)}">${escapeHtml(source.title || source.url)}</a></li>`
  ).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Research report — NasrinAI</title>
<style>
:root{color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{max-width:900px;margin:0 auto;padding:clamp(1rem,4vw,3rem);line-height:1.65}
header,article,section{border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:14px;padding:1rem 1.25rem;margin:1rem 0}
h1{line-height:1.2}a{overflow-wrap:anywhere}small,.muted{opacity:.75}
</style></head><body><header><p class="muted">NasrinAI · Evidence-grounded research</p><h1>Research report</h1><p><strong>Question:</strong> ${escapeHtml(scan?.query || 'Research question')}</p><p class="muted">Exported ${escapeHtml(new Date().toISOString())}</p></header>
<section><h2>Findings</h2>${findingHtml || '<p>No evidence-grounded findings were recorded.</p>'}</section>
<section><h2>Review notes</h2><ul><li>Findings without readable-source citation: ${Number(report.limitations?.findings_without_read_source) || 0}</li><li>Single-source findings: ${Number(report.limitations?.single_source_findings) || 0}</li><li>Potential conflicts needing review: ${Array.isArray(report.conflicts) ? report.conflicts.length : 0}</li></ul><p class="muted">Confidence and corroboration labels are review aids, not proof of truth or independent verification.</p></section>
<section><h2>Sources</h2><ul>${sourceHtml || '<li>No sources recorded.</li>'}</ul></section></body></html>`;
}

export function researchExport(scan, format = 'markdown') {
  const base = safeFilenamePart(scan?.query);
  if (format === 'markdown' || format === 'md') {
    return { filename: `${base}-research.md`, contentType: 'text/markdown; charset=utf-8', content: renderResearchMarkdown(scan) };
  }
  if (format === 'html') {
    return { filename: `${base}-research.html`, contentType: 'text/html; charset=utf-8', content: renderResearchHtml(scan) };
  }
  if (format === 'json') {
    return { filename: `${base}-research.json`, contentType: 'application/json; charset=utf-8', content: JSON.stringify(scan, null, 2) };
  }
  return null;
}
