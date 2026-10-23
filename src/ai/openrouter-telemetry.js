import { randomUUID } from 'node:crypto';

const SAFE_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_SUMMARY_BYTES = 4000;

function safeModel(value) {
  return typeof value === 'string' ? value.slice(0, 180) : null;
}
function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function safeCost(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function summary(value) {
  try {
    const json = JSON.stringify(value ?? {});
    if (Buffer.byteLength(json) <= MAX_SUMMARY_BYTES) return JSON.parse(json);
  } catch { /* omit malformed or oversized metadata */ }
  return { omitted: true, reason: 'summary_too_large_or_invalid' };
}

/**
 * Creates a best-effort, server-only Supabase writer for OpenRouter telemetry.
 * It never stores raw prompts, completions, binary payloads, auth headers, or
 * provider error bodies. Logging errors cannot affect model responses.
 */
export function createOpenRouterTelemetry({ url, secretKey, fetchImpl = fetch, logger = console }) {
  const baseUrl = String(url || '').replace(/\/+$/, '');
  const key = String(secretKey || '');
  if (!baseUrl || !key) return null;

  return async function logOpenRouterRequest(event = {}) {
    const method = String(event.method || 'POST').toUpperCase();
    if (!SAFE_METHODS.has(method)) return;
    const requestId = event.requestId || randomUUID();
    const payload = {
      request_id: requestId,
      provider: 'openrouter',
      endpoint: String(event.endpoint || '/unknown').slice(0, 160),
      http_method: method,
      requested_model: safeModel(event.requestedModel),
      model: safeModel(event.model),
      prompt_tokens: safeCount(event.promptTokens),
      completion_tokens: safeCount(event.completionTokens),
      total_tokens: safeCount(event.totalTokens),
      total_cost_usd: safeCost(event.totalCostUsd),
      request_summary: summary(event.requestSummary),
      response_summary: summary(event.responseSummary),
      status: event.status === 'success' ? 'success' : 'error',
      http_status: safeCount(event.httpStatus),
      error_code: typeof event.errorCode === 'string' ? event.errorCode.slice(0, 100) : null,
      latency_ms: Math.max(0, Math.floor(Number(event.latencyMs) || 0)),
      provider_request_id: typeof event.providerRequestId === 'string'
        ? event.providerRequestId.slice(0, 200) : null
    };

    try {
      const response = await fetchImpl(baseUrl + '/rest/v1/openrouter_logs', {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(2500),
        redirect: 'error'
      });
      if (!response.ok) {
        logger?.warn?.('OpenRouter telemetry insert failed', {
          requestId, status: response.status
        });
      }
    } catch (error) {
      logger?.warn?.('OpenRouter telemetry write failed', {
        requestId,
        error: error instanceof Error ? error.name : 'UnknownError'
      });
    }
  };
}
