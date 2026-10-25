/**
 * Sync provider-reported OpenRouter generation records into private Supabase storage.
 * Analytics (management key) discovers generation IDs; /generation (inference key)
 * retrieves authoritative per-generation details. No prompt/completion content is stored.
 */
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const validGenerationId = (value) => typeof value === 'string' && /^gen-[0-9A-Za-z-]{1,120}$/.test(value);

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value || /[\r\n]/.test(value)) throw new Error('missing_' + name.toLowerCase());
  return value;
}

async function readJson(response, label) {
  if (!response.ok) {
    if (response.status === 401) throw new Error(label + '_unauthorized');
    if (response.status === 403) throw new Error(label + '_forbidden');
    throw new Error(label + '_http_' + response.status);
  }
  try { return await response.json(); } catch { throw new Error(label + '_invalid_json'); }
}

function analyticsRows(payload) {
  const rows = payload?.data?.data ?? payload?.data?.rows ?? payload?.rows ?? [];
  if (!Array.isArray(rows)) throw new Error('analytics_invalid_shape');
  return rows;
}

function analyticsGenerationIds(payload) {
  const ids = new Set();
  for (const row of analyticsRows(payload)) {
    const id = row?.generation_id ?? row?.dimensions?.generation_id ?? row?.group?.generation_id;
    if (validGenerationId(id)) ids.add(id);
  }
  return [...ids];
}

/**
 * OpenRouter analytics can return at most 1,000 rows per query. Treat that as
 * a per-request page size, not a total sync limit: recursively split saturated
 * time windows and deduplicate IDs across the resulting intervals.
 */
async function discoverGenerationIds({ start, end, managementKey, fetchImpl, timeoutMs }) {
  const queryWindow = async (windowStart, windowEnd) => {
    const response = await fetchImpl(OPENROUTER_BASE + '/analytics/query', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + managementKey, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metrics: ['total_usage'],
        dimensions: ['generation_id'],
        time_range: { start: windowStart, end: windowEnd },
        limit: 1000
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs)
    });
    return readJson(response, 'analytics');
  };

  const collect = async (windowStart, windowEnd, depth = 0) => {
    if (depth > 32) throw new Error('analytics_window_split_limit');
    const payload = await queryWindow(windowStart, windowEnd);
    const rows = analyticsRows(payload);
    if (rows.length < 1000) return analyticsGenerationIds(payload);

    const from = Date.parse(windowStart);
    const to = Date.parse(windowEnd);
    const midpoint = Math.floor((from + to) / 2);
    if (!Number.isFinite(from) || !Number.isFinite(to) || midpoint <= from || midpoint >= to) {
      throw new Error('analytics_window_overflow');
    }
    const mid = new Date(midpoint).toISOString();
    const [left, right] = await Promise.all([
      collect(windowStart, mid, depth + 1),
      collect(mid, windowEnd, depth + 1)
    ]);
    return [...new Set([...left, ...right])];
  };

  return collect(start, end);
}

async function fetchGeneration(id, inferenceKey, fetchImpl, timeoutMs = 8000) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response;
    try {
      response = await fetchImpl(OPENROUTER_BASE + '/generation?id=' + encodeURIComponent(id), {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + inferenceKey, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (attempt === 3) throw new Error('generation_network_error');
      await sleep(750 * (attempt + 1));
      continue;
    }
    if (response.status === 404 || response.status === 429 || response.status >= 500) {
      if (attempt === 3) return null;
      const retryAfter = Number(response.headers?.get?.('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10000) : 1000 * (attempt + 1));
      continue;
    }
    const payload = await readJson(response, 'generation');
    const row = payload?.data;
    if (!row || !validGenerationId(row.id) || row.id !== id || !row.created_at) return null;
    return row;
  }
  return null;
}

function nullable(value) {
  return value === undefined || value === '' ? null : value;
}
function safeInt(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function toStoredRow(g) {
  const latency = safeNumber(g.latency);
  const generationTime = safeNumber(g.generation_time);
  return {
    generation_id: g.id,
    request_id: nullable(g.request_id),
    session_id: nullable(g.session_id),
    created_at: g.created_at,
    model: typeof g.model === 'string' ? g.model.slice(0, 180) : null,
    provider_name: typeof g.provider_name === 'string' ? g.provider_name.slice(0, 160) : null,
    api_type: typeof g.api_type === 'string' ? g.api_type.slice(0, 80) : null,
    router: typeof g.router === 'string' ? g.router.slice(0, 100) : null,
    app_id: nullable(g.app_id),
    origin: typeof g.origin === 'string' ? g.origin.slice(0, 255) : null,
    api_key_name: typeof g.api_key_name === 'string' ? g.api_key_name.slice(0, 160) : null,
    external_user: typeof g.external_user === 'string' ? g.external_user.slice(0, 160) : null,
    cost_total: safeNumber(g.total_cost ?? g.usage),
    cost_upstream: safeNumber(g.upstream_inference_cost),
    cache_discount: safeNumber(g.cache_discount),
    is_byok: typeof g.is_byok === 'boolean' ? g.is_byok : null,
    tokens_prompt: safeInt(g.tokens_prompt ?? g.prompt_tokens),
    tokens_completion: safeInt(g.tokens_completion ?? g.completion_tokens),
    tokens_reasoning: safeInt(g.native_tokens_reasoning ?? g.tokens_reasoning),
    tokens_cached: safeInt(g.native_tokens_cached ?? g.tokens_cached),
    finish_reason: typeof g.native_finish_reason === 'string' ? g.native_finish_reason.slice(0, 120) : null,
    finish_reason_norm: typeof g.finish_reason === 'string' ? g.finish_reason.slice(0, 120) : null,
    streamed: typeof g.streamed === 'boolean' ? g.streamed : null,
    cancelled: typeof g.cancelled === 'boolean' ? g.cancelled : null,
    latency_ms: safeInt(latency),
    generation_time_ms: safeInt(generationTime),
    synced_at: new Date().toISOString()
  };
}

async function upsertRows(rows, { supabaseUrl, serviceKey, fetchImpl, timeoutMs }) {
  let saved = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const response = await fetchImpl(supabaseUrl + '/rest/v1/openrouter_generations?on_conflict=generation_id', {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(rows.slice(i, i + 100)),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs)
    });
    await readJsonOrNoContent(response, 'supabase_upsert');
    saved += Math.min(100, rows.length - i);
  }
  return saved;
}
async function readJsonOrNoContent(response, label) {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error(label + '_forbidden');
    throw new Error(label + '_http_' + response.status);
  }
  return null;
}

export async function runOpenRouterGenerationSync({
  env = process.env, fetchImpl = fetch, now = () => Date.now(), timeoutMs = 8000, lookbackHours = 48
} = {}) {
  const managementKey = String(env.OPENROUTER_MANAGEMENT_KEY || env.OPENROUTER_MANAGEMENT_API_KEY || '').trim();
  if (!managementKey) throw new Error('missing_openrouter_management_key');
  const inferenceKey = required(env, 'OPENROUTER_API_KEY');
  const supabaseUrl = required(env, 'SUPABASE_URL').replace(/\/+$/, '');
  const serviceKey = required(env, 'SUPABASE_SECRET_KEY');
  if (!/^https:\/\/[^/]+$/.test(supabaseUrl)) throw new Error('invalid_supabase_url');

  const end = new Date(now()).toISOString();
  const start = new Date(now() - Math.min(Math.max(Number(lookbackHours) || 48, 1), 168) * 3600000).toISOString();
  const ids = await discoverGenerationIds({ start, end, managementKey, fetchImpl, timeoutMs });
  let fetched = 0, unavailable = 0, failed = 0;
  const rows = [];
  for (let i = 0; i < ids.length; i += 5) {
    const batch = await Promise.all(ids.slice(i, i + 5).map(async (id) => {
      try {
        const generation = await fetchGeneration(id, inferenceKey, fetchImpl, timeoutMs);
        if (!generation) { unavailable++; return null; }
        fetched++;
        return toStoredRow(generation);
      } catch (error) {
        if (error?.message === 'generation_unauthorized' || error?.message === 'generation_forbidden') throw error;
        failed++;
        return null;
      }
    }));
    rows.push(...batch.filter(Boolean));
  }
  const saved = rows.length ? await upsertRows(rows, { supabaseUrl, serviceKey, fetchImpl, timeoutMs }) : 0;
  return {
    source: 'openrouter_analytics_and_generation_api',
    window: { start, end },
    discovered: ids.length,
    fetched,
    saved,
    unavailable,
    failed
  };
}
