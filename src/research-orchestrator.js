// Provider-agnostic research planning and evidence normalization.
// Plans are deterministic, bounded, and limited to public-source questions.
const DEEP_SIGNALS = /\b(compare|comparison|evaluate|assessment|review|literature|systematic|academic|research|evidence|state of the art|trade-?offs?|pros and cons|why|how does|impact|effectiveness|benchmark|market|industry|technical|architecture|security|202[4-9]|2030)\b/i;
const ACADEMIC = /\b(academic|literature|peer.review|paper|papers|study|studies|scholar|citation|thesis|university|systematic review)\b/i;
const TECHNICAL = /\b(api|sdk|architecture|protocol|security|benchmark|implementation|documentation|standard|database|model|software|technical)\b/i;
const INDUSTRY = /\b(market|industry|company|companies|pricing|adoption|business|revenue|competitor|trend)\b/i;

export function planResearch(input) {
  const query = String(input || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  const deep = query.length >= 100 || DEEP_SIGNALS.test(query);
  if (!deep) return { depth: 'focused', subquestions: [query], searchQueries: [query] };
  const domain = ACADEMIC.test(query) ? 'academic' : TECHNICAL.test(query) ? 'technical' : INDUSTRY.test(query) ? 'industry' : 'general';
  const subquestions = [
    query,
    domain === 'academic' ? 'Peer-reviewed studies and primary research evidence about: ' + query :
      domain === 'technical' ? 'Official documentation, standards, and technical benchmarks about: ' + query :
      domain === 'industry' ? 'Credible industry reports and primary company sources about: ' + query :
      'Primary sources, evidence, and limitations concerning: ' + query,
    'Counterarguments, limitations, risks, or conflicting findings concerning: ' + query
  ];
  return { depth: 'deep', domain, subquestions, searchQueries: subquestions };
}

const normalize = (value) => String(value || '').toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (value) => new Set(normalize(value).split(' ').filter((word) => word.length > 3));

export function buildEvidenceLedger(input) {
  const unique = new Map();
  for (const item of Array.isArray(input) ? input : []) {
    const fact = String(item?.fact || '').replace(/\s+/g, ' ').trim();
    const url = String(item?.url || '').trim();
    if (fact.length < 10 || !url) continue;
    const key = normalize(fact);
    if (!key) continue;
    const current = unique.get(key);
    if (current) {
      if (!current.sources.some((source) => source.url === url)) current.sources.push({ url, title: String(item.title || '').slice(0, 200) });
    } else unique.set(key, { fact, url, title: String(item.title || '').slice(0, 200), sources: [{ url, title: String(item.title || '').slice(0, 200) }] });
  }
  const facts = [...unique.values()].map((item) => ({
    ...item,
    source_count: item.sources.length,
    confidence: item.sources.length >= 2 ? 'corroborated' : 'single_source'
  }));
  const contradictions = [];
  // Conservative polarity overlap is a review signal, not a definitive conflict.
  for (let i = 0; i < facts.length; i++) for (let j = i + 1; j < facts.length; j++) {
    const a = tokens(facts[i].fact), b = tokens(facts[j].fact);
    if (a.size < 4 || b.size < 4) continue;
    let overlap = 0;
    for (const token of a) if (b.has(token)) overlap++;
    const ratio = overlap / Math.min(a.size, b.size);
    const negative = /\b(not|no|never|cannot|can't|fails?|ineffective|unsafe|decreases?)\b/i;
    if (ratio >= 0.65 && negative.test(facts[i].fact) !== negative.test(facts[j].fact)) {
      contradictions.push({ fact_indexes: [i, j], status: 'needs_review' });
    }
  }
  return { facts, contradictions, source_count: new Set(facts.flatMap((fact) => fact.sources.map((source) => source.url))).size };
}


/**
 * Build a source-grounded report without inventing a narrative or citations.
 * Citation links are copied only from the evidence ledger's recorded sources.
 */
export function buildResearchReport(evidence, sources = []) {
  const facts = Array.isArray(evidence?.facts) ? evidence.facts : [];
  const knownUrls = new Set((Array.isArray(sources) ? sources : [])
    .filter((source) => source?.status === 'read' && typeof source.url === 'string')
    .map((source) => source.url));
  const findings = facts.map((item, index) => {
    const citations = (Array.isArray(item.sources) ? item.sources : [{ url: item.url, title: item.title }])
      .filter((source) => source?.url && knownUrls.has(source.url))
      .map((source) => ({ url: source.url, title: String(source.title || '').slice(0, 200) }));
    return {
      id: index + 1,
      finding: String(item.fact || '').slice(0, 300),
      confidence: citations.length === 0 ? 'uncited' : item.confidence === 'corroborated' && citations.length >= 2 ? 'corroborated' : 'single_source',
      citations
    };
  }).filter((item) => item.finding.length >= 10);
  const conflicts = (Array.isArray(evidence?.contradictions) ? evidence.contradictions : [])
    .filter((item) => Array.isArray(item.fact_indexes) && item.fact_indexes.length === 2 &&
      item.fact_indexes.every((index) => Number.isInteger(index) && index >= 0 && index < findings.length))
    .map((item) => ({ finding_ids: item.fact_indexes.map((index) => index + 1), status: 'needs_review' }));
  const uncited = findings.filter((item) => item.citations.length === 0).length;
  const singleSource = findings.filter((item) => item.confidence === 'single_source').length;
  return {
    findings,
    conflicts,
    limitations: {
      findings_without_read_source: uncited,
      single_source_findings: singleSource,
      conflicting_findings_need_review: conflicts.length,
      note: 'Corroboration means matching extracted statements appeared on multiple source URLs; it is not independent verification.'
    },
    citation_integrity: { all_findings_have_read_source: uncited === 0 }
  };
}


/**
 * Deterministic evaluation metrics for fixture-based QA and operational review.
 * These metrics describe this scan only; they are not a measure of factual truth.
 */
export function measureResearchQuality({ report, sources = [], adapters = [] } = {}) {
  const safeSources = Array.isArray(sources) ? sources : [];
  const safeAdapters = Array.isArray(adapters) ? adapters : [];
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const readCount = safeSources.filter((source) => source?.status === 'read').length;
  const failedCount = safeSources.filter((source) => source?.status === 'skipped' || source?.status === 'error').length;
  const citedCount = findings.filter((finding) => Array.isArray(finding?.citations) && finding.citations.length > 0).length;
  const adapterFailures = safeAdapters.filter((adapter) => ['error', 'timeout', 'unavailable'].includes(adapter?.status)).length;
  const ratio = (numerator, denominator) => denominator ? Number((numerator / denominator).toFixed(4)) : null;
  return {
    sources: { discovered: safeSources.length, read: readCount, failed_or_skipped: failedCount, read_rate: ratio(readCount, safeSources.length) },
    citations: { findings: findings.length, cited_findings: citedCount, uncited_findings: Math.max(0, findings.length - citedCount), coverage: ratio(citedCount, findings.length) },
    evidence: {
      single_source_findings: Number(report?.limitations?.single_source_findings || 0),
      conflicts_needing_review: Array.isArray(report?.conflicts) ? report.conflicts.length : 0
    },
    adapters: { checked: safeAdapters.length, failures: adapterFailures },
    note: 'Operational quality indicators only; they do not establish that findings are true, unbiased, or independently corroborated.'
  };
}
