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
