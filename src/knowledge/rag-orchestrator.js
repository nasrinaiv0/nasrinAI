const STOP_WORDS = new Set((
  'the a an and or of to in on at for is are was were be do does did what when where who how why which can could would i you we they it this that my your our me us with from about please show tell explain help me'
  + ' ang ng mga sa si ni na ay at ko mo ka ako ikaw siya kami tayo kayo sila ba po ho naman lang din rin ito iyan iyon yung kung paano saan kailan sino ano bakit may meron wala'
).split(/\s+/));

const ALIASES = Object.freeze({
  js: 'javascript', ts: 'typescript', node: 'nodejs', 'node.js': 'nodejs',
  postgres: 'postgresql', pg: 'postgresql', db: 'database', sql: 'database',
  auth: 'authentication', oauth: 'authentication', jwt: 'token',
  rls: 'row-level-security', ci: 'continuous-integration', cd: 'deployment',
  k8s: 'kubernetes', tf: 'terraform', py: 'python', css: 'styling',
  api: 'application-programming-interface', sdk: 'software-development-kit'
});

const INTENT_RULES = [
  ['security', /\b(security|vulnerabilit(?:y|ies)|exploit|injection|xss|csrf|permission|rls|authentication|authorization|secret|credential)\b/i,
    ['secure', 'threat model', 'permissions', 'mitigation']],
  ['debugging', /\b(debug|debugging|error|exception|failed|failure|bug|stack trace|not working|broken|regression|test fails?)\b/i,
    ['root cause', 'reproduction', 'diagnostics', 'regression test']],
  ['deployment', /\b(deploy|deployment|production|vercel|release|build|ci\/cd|environment variable|cron)\b/i,
    ['configuration', 'runtime', 'deployment', 'rollback']],
  ['database', /\b(database|postgres|postgresql|sql|supabase|migration|query|index|schema|vector|embedding|rls)\b/i,
    ['schema', 'query plan', 'index', 'migration']],
  ['implementation', /\b(implement|build|create|add|write|integrate|refactor|design|architecture)\b/i,
    ['implementation', 'integration', 'tests', 'failure handling']],
  ['explanation', /\b(what is|how does|explain|compare|difference|why)\b/i,
    ['concept', 'trade-offs', 'examples']]
];

const SENSITIVE_QUERY = /\b(?:password|passcode|one.time.password|otp|private key|secret key|authorization:\s*bearer|credit card|debit card|bank account|passport|medical record)\b/i;

export function tokenizeRagQuery(input) {
  return [...new Set((String(input || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}._+#-]{0,47}/gu) || [])
    .map((token) => token.replace(/^[._+#-]+|[._+#-]+$/g, ''))
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token)))].slice(0, 18);
}

export function analyzeRagQuery(input) {
  const query = String(input || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2400);
  const tokens = tokenizeRagQuery(query);
  const matched = INTENT_RULES.find(([, pattern]) => pattern.test(query));
  const intent = matched?.[0] || 'general';
  const aliases = [...new Set(tokens.map((token) => ALIASES[token]).filter(Boolean))];
  const terms = [...new Set([...tokens, ...aliases, ...(matched?.[2] || [])])].slice(0, 18);
  const expansions = [];
  if (query) expansions.push(query);
  if (aliases.length) {
    const aliasQuery = [...new Set(tokens.map((token) => ALIASES[token] || token))].join(' ');
    if (aliasQuery && aliasQuery.toLowerCase() !== query.toLowerCase()) expansions.push(aliasQuery);
  }
  if (matched && query) {
    const intentQuery = [...new Set([...tokens, ...matched[2]])].slice(0, 18).join(' ');
    if (intentQuery && !expansions.some((candidate) => candidate.toLowerCase() === intentQuery.toLowerCase())) expansions.push(intentQuery);
  }
  return Object.freeze({ query, intent, tokens, terms, expansions: expansions.slice(0, 3), sensitive: SENSITIVE_QUERY.test(query) });
}

function bounded(value, min = 0, max = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : null;
}

function lexicalRelevance(candidate, terms, originalQuery) {
  if (!terms.length) return 0;
  const title = String(candidate.title || '').toLowerCase();
  const body = String(candidate.text || candidate.content || candidate.text_content || '').slice(0, 5000).toLowerCase();
  const combined = title + ' ' + body;
  const found = terms.filter((term) => combined.includes(term));
  const titleFound = terms.filter((term) => title.includes(term));
  const coverage = found.length / terms.length;
  const titleCoverage = titleFound.length / terms.length;
  const phrase = originalQuery.length > 5 && combined.includes(originalQuery.toLowerCase()) ? 1 : 0;
  const count = found.reduce((sum, term) => sum + Math.min(3, combined.split(term).length - 1), 0);
  const frequency = Math.min(1, count / Math.max(terms.length * 1.5, 1));
  return bounded(coverage * 0.58 + titleCoverage * 0.2 + frequency * 0.12 + phrase * 0.1);
}

function freshness(candidate, nowMs) {
  const stamp = Date.parse(candidate.fetched_at || candidate.fetchedAt || '');
  if (!Number.isFinite(stamp)) return 0.5;
  const ageDays = Math.max(0, (nowMs - stamp) / 86400000);
  return bounded(1 - Math.min(ageDays, 730) / 730);
}

export function rerankHybridCandidates(candidates, queryAnalysis, { limit = 5, allowedHosts = null, now = () => Date.now() } = {}) {
  const maxResults = Math.max(1, Math.min(10, Number(limit) || 5));
  const hostSet = allowedHosts === null ? null : new Set([...allowedHosts].map((host) => String(host || '').toLowerCase()));
  const terms = queryAnalysis?.terms || tokenizeRagQuery(queryAnalysis?.query || '');
  const query = String(queryAnalysis?.query || '').toLowerCase();
  const merged = new Map();

  for (const raw of Array.isArray(candidates) ? candidates : []) {
    let url;
    try { url = new URL(String(raw?.url || raw?.source_url || '')); } catch { continue; }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
    if (hostSet && (url.protocol !== 'https:' || !hostSet.has(url.hostname.toLowerCase()))) continue;
    url.hash = '';
    const key = url.href;
    const text = String(raw.text || raw.content || raw.text_content || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, 5000);
    if (!text.length) continue;
    const candidate = {
      url: key, title: String(raw.title || url.hostname).replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, 200),
      text, fetched_at: raw.fetched_at || raw.fetchedAt || null,
      media: Array.isArray(raw.media) ? raw.media.slice(0, 30) : [],
      similarity: bounded(raw.similarity),
      _semanticRank: raw._semanticRank != null && Number.isFinite(Number(raw._semanticRank)) ? Number(raw._semanticRank) : null,
      _keywordRank: raw._keywordRank != null && Number.isFinite(Number(raw._keywordRank)) ? Number(raw._keywordRank) : null
    };
    const existing = merged.get(key);
    if (!existing) merged.set(key, candidate);
    else {
      if (candidate.similarity !== null && (existing.similarity === null || candidate.similarity > existing.similarity)) existing.similarity = candidate.similarity;
      if (candidate._semanticRank !== null) existing._semanticRank = Math.min(existing._semanticRank ?? Infinity, candidate._semanticRank);
      if (candidate._keywordRank !== null) existing._keywordRank = Math.min(existing._keywordRank ?? Infinity, candidate._keywordRank);
      if (candidate.text.length > existing.text.length) existing.text = candidate.text;
      if (!existing.fetched_at || (candidate.fetched_at && candidate.fetched_at > existing.fetched_at)) existing.fetched_at = candidate.fetched_at;
    }
  }

  const nowMs = now();
  const rows = [...merged.values()].map((candidate) => {
    const lexical = lexicalRelevance(candidate, terms, query);
    const semantic = candidate.similarity === null ? null : bounded(candidate.similarity);
    const fresh = freshness(candidate, nowMs);
    const semanticRank = candidate._semanticRank === null ? 0 : 1 / (60 + candidate._semanticRank);
    const keywordRank = candidate._keywordRank === null ? 0 : 1 / (60 + candidate._keywordRank);
    const score = semantic !== null
      ? semantic * 0.48 + lexical * 0.4 + fresh * 0.07 + Math.min(1, semanticRank * 60) * 0.025 + Math.min(1, keywordRank * 60) * 0.025
      : lexical * 0.88 + fresh * 0.08 + Math.min(1, keywordRank * 60) * 0.04;
    return { ...candidate, retrieval_score: Number(score.toFixed(6)), _lexicalScore: lexical };
  });
  rows.sort((a, b) => b.retrieval_score - a.retrieval_score || b._lexicalScore - a._lexicalScore || String(b.fetched_at || '').localeCompare(String(a.fetched_at || '')) || a.url.localeCompare(b.url));
  return rows.slice(0, maxResults).map(({ _semanticRank, _keywordRank, _lexicalScore, ...row }) => row);
}
