import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerAlertHandler, isAllowedWebhookUrl } from '../api/internal-owner-alerts.js';

const CRON_SECRET = 'cron-secret-for-tests-' + 'x'.repeat(32);
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}
function res() {
  return {
    headers: {}, statusCode: 200, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(v) { this.body = String(v ?? ''); }
  };
}

test('alert webhook validator accepts only HTTPS Slack and Discord webhook URLs', () => {
  assert.equal(isAllowedWebhookUrl('https://hooks.slack.com/services/T00000000/B00000000/abcdefghijklmnop'), true);
  assert.equal(isAllowedWebhookUrl('https://discord.com/api/webhooks/123456789012/abcdefghijklmnopqrstuvwxyz'), true);
  for (const value of [
    'http://hooks.slack.com/services/T/B/C',
    'https://evil.example/hooks.slack.com/services/T/B/C',
    'https://hooks.slack.com.evil.example/services/T/B/C',
    'https://hooks.slack.com/services/T/B/C?redirect=https://evil.example',
    'https://user:pass@hooks.slack.com/services/T/B/C',
    'https://127.0.0.1/services/T/B/C',
    'https://discord.com/api/webhooks/1/short'
  ]) assert.equal(isAllowedWebhookUrl(value), false, value);
});

test('cron endpoint hides itself from unauthorized requests', async () => {
  let called = false;
  const handler = createOwnerAlertHandler({ env: { CRON_SECRET }, fetchImpl: async () => { called = true; throw new Error('must not call'); } });
  const out = res();
  await handler({ method: 'GET', headers: { authorization: 'Bearer wrong' } }, out);
  assert.equal(out.statusCode, 404);
  assert.equal(called, false);
});

test('cron cycle queues threshold alerts, dispatches only approved event summaries, and marks delivery', async () => {
  const calls = [];
  const handler = createOwnerAlertHandler({
    env: {
      CRON_SECRET,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SECRET_KEY: 'server-secret-key-value-that-is-long-enough',
      OWNER_ALERT_WEBHOOK_URL: 'https://hooks.slack.com/services/T00000000/B00000000/abcdefghijklmnop'
    },
    now: () => Date.parse('2026-10-23T00:00:00.000Z'),
    logger: { warn() {} },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes('/owner_console_incident_summary')) return response({ ai_failed_requests: 6, automation_failed_runs: 0, stale_running_runs: 0 });
      if (String(url).includes('/owner_alert_enqueue')) return response(ID);
      if (String(url).includes('/owner_alert_claim')) return response([{ id: ID, event_type: 'ai_failure_spike', severity: 'high', summary: 'AI request failures exceeded the configured 15-minute threshold', attempts: 1 }]);
      if (String(url).includes('/owner_alert_finish')) return response(true);
      if (String(url).startsWith('https://hooks.slack.com/')) return response({});
      throw new Error('unexpected fetch: ' + url);
    }
  });
  const out = res();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + CRON_SECRET } }, out);
  assert.equal(out.statusCode, 200);
  const payload = JSON.parse(out.body);
  assert.equal(payload.queued, 1);
  assert.equal(payload.delivered, 1);
  assert.equal(payload.failed, 0);
  const enqueue = calls.find((call) => call.url.includes('/owner_alert_enqueue'));
  assert.ok(enqueue);
  assert.equal(JSON.parse(enqueue.options.body).p_event_type, 'ai_failure_spike');
  const webhook = calls.find((call) => call.url.startsWith('https://hooks.slack.com/'));
  assert.ok(webhook);
  assert.equal(webhook.options.redirect, 'error');
  assert.match(JSON.parse(webhook.options.body).text, /NasrinAI Owner Console/);
  const finish = calls.find((call) => call.url.includes('/owner_alert_finish'));
  assert.equal(JSON.parse(finish.options.body).p_success, true);
});

test('unsupported webhook URLs never receive alert data and queued monitoring stays available', async () => {
  const calls = [];
  const handler = createOwnerAlertHandler({
    env: {
      CRON_SECRET,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SECRET_KEY: 'server-secret-key-value-that-is-long-enough',
      OWNER_ALERT_WEBHOOK_URL: 'https://attacker.example/collect'
    },
    logger: { warn() {} },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes('/owner_console_incident_summary')) return response({ ai_failed_requests: 0, automation_failed_runs: 0, stale_running_runs: 0 });
      throw new Error('unexpected fetch');
    }
  });
  const out = res();
  await handler({ method: 'GET', headers: { authorization: 'Bearer ' + CRON_SECRET } }, out);
  assert.equal(out.statusCode, 200);
  assert.equal(JSON.parse(out.body).alert_delivery, 'not_configured');
  assert.equal(calls.some((call) => call.url.startsWith('https://attacker.example/')), false);
});

test('Vercel schedules the protected alert monitor and routes it before the general API rewrite', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const here = dirname(fileURLToPath(import.meta.url));
  const config = JSON.parse(await readFile(resolve(here, '../vercel.json'), 'utf8'));
  assert.ok(config.crons.some((cron) => cron.path === '/v1/internal/owner-alerts' && cron.schedule === '*/5 * * * *'));
  const alertRoute = config.rewrites.findIndex((route) => route.source === '/v1/internal/owner-alerts');
  const generalRoute = config.rewrites.findIndex((route) => route.source === '/v1/:path*');
  assert.ok(alertRoute >= 0 && generalRoute >= 0 && alertRoute < generalRoute);
  assert.equal(config.rewrites[alertRoute].destination, '/api/internal-owner-alerts');
});
