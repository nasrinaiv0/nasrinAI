import { timingSafeEqual } from 'node:crypto';

const ALLOWED_EVENTS = new Set(['ai_failure_spike', 'automation_failure_spike', 'stale_automation']);
const WINDOW_MS = 15 * 60 * 1000;
const BUCKET_MS = 5 * 60 * 1000;

function equalSecret(actual, expected) {
  if (!actual || !expected || actual.length !== expected.length || actual.length > 512) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function isAllowedWebhookUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return false;
    if (url.hostname === 'hooks.slack.com' && /^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.pathname)) return true;
    if (url.hostname === 'discord.com' && /^\/api\/webhooks\/[0-9]{10,30}\/[A-Za-z0-9._-]{20,200}$/.test(url.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

async function rpc({ fetchImpl, supabaseUrl, serviceKey }, name, body) {
  const response = await fetchImpl(supabaseUrl + '/rest/v1/rpc/' + name, {
    method: 'POST',
    redirect: 'error',
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('database_rpc_failed');
  if (response.status === 204) return null;
  return response.json();
}

function boundedInt(value, fallback, max = 1000) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= max ? number : fallback;
}

export function createOwnerAlertHandler({ env = process.env, fetchImpl = fetch, now = () => Date.now(), logger = console } = {}) {
  return async function handler(req, res) {
    const expected = String(env.CRON_SECRET || '');
    const auth = String(req.headers?.authorization || '');
    if (req.method !== 'GET' || expected.length < 32 || !equalSecret(auth, 'Bearer ' + expected)) {
      res.statusCode = 404;
      res.setHeader('Cache-Control', 'no-store');
      res.end('Not found');
      return;
    }
    const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
    const serviceKey = String(env.SUPABASE_SECRET_KEY || '');
    if (!/^https:\/\/[^/]+$/.test(supabaseUrl) || serviceKey.length < 20) {
      res.statusCode = 503;
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ error: 'alert_database_not_configured' }));
      return;
    }

    const webhook = String(env.OWNER_ALERT_WEBHOOK_URL || '');
    const webhookEnabled = isAllowedWebhookUrl(webhook);
    const at = now();
    const since = new Date(at - WINDOW_MS).toISOString();
    const bucket = new Date(Math.floor(at / BUCKET_MS) * BUCKET_MS).toISOString();
    const client = { fetchImpl, supabaseUrl, serviceKey };
    let queued = 0;
    let delivered = 0;
    let failed = 0;

    try {
      const signalRaw = await rpc(client, 'owner_console_incident_summary', { p_since: since });
      const signal = Array.isArray(signalRaw) ? signalRaw[0] : signalRaw;
      if (!signal || typeof signal !== 'object') throw new Error('invalid_signal_response');
      const aiThreshold = boundedInt(env.OWNER_ALERT_AI_FAILURE_THRESHOLD, 5);
      const automationThreshold = boundedInt(env.OWNER_ALERT_AUTOMATION_FAILURE_THRESHOLD, 3);
      const staleThreshold = boundedInt(env.OWNER_ALERT_STALE_RUN_THRESHOLD, 1, 100);

      const candidates = [
        { type: 'ai_failure_spike', count: Number(signal.ai_failed_requests), threshold: aiThreshold, severity: 'high', summary: 'AI request failures exceeded the configured 15-minute threshold' },
        { type: 'automation_failure_spike', count: Number(signal.automation_failed_runs), threshold: automationThreshold, severity: 'high', summary: 'Automation failures exceeded the configured 15-minute threshold' },
        { type: 'stale_automation', count: Number(signal.stale_running_runs), threshold: staleThreshold, severity: 'medium', summary: 'Automation runs exceeded the configured stale-running threshold' }
      ];
      for (const item of candidates) {
        if (!Number.isFinite(item.count) || item.count < item.threshold || !ALLOWED_EVENTS.has(item.type)) continue;
        const id = await rpc(client, 'owner_alert_enqueue', {
          p_dedupe_key: item.type + ':' + bucket,
          p_event_type: item.type,
          p_severity: item.severity,
          p_summary: item.summary
        });
        if (id) queued++;
      }

      if (webhookEnabled) {
        const claimedRaw = await rpc(client, 'owner_alert_claim', { p_limit: 20 });
        const claimed = Array.isArray(claimedRaw) ? claimedRaw : [];
        for (const alert of claimed) {
          if (!alert || typeof alert.id !== 'string' || !ALLOWED_EVENTS.has(alert.event_type)) {
            failed++;
            continue;
          }
          const text = '[NasrinAI Owner Console] [' + String(alert.severity).toUpperCase() + '] ' + String(alert.summary).slice(0, 240);
          const message = new URL(webhook).hostname === 'discord.com' ? { content: text } : { text };
          try {
            const response = await fetchImpl(webhook, {
              method: 'POST',
              redirect: 'error',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(message),
              signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) throw new Error('webhook_rejected');
            await rpc(client, 'owner_alert_finish', { p_id: alert.id, p_success: true, p_error_code: null });
            delivered++;
          } catch {
            await rpc(client, 'owner_alert_finish', { p_id: alert.id, p_success: false, p_error_code: 'webhook_delivery_failed' }).catch(() => {});
            failed++;
          }
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({
        ok: true,
        signals_window_minutes: 15,
        alert_delivery: webhookEnabled ? 'enabled' : 'not_configured',
        queued,
        delivered,
        failed
      }));
    } catch (error) {
      logger?.warn?.('owner alert cycle failed', { code: error?.message === 'database_rpc_failed' ? 'database_rpc_failed' : 'alert_cycle_failed' });
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ error: 'alert_cycle_unavailable' }));
    }
  };
}

export default createOwnerAlertHandler();
