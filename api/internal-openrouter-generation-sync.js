import { timingSafeEqual } from 'node:crypto';
import { runOpenRouterGenerationSync } from '../src/ai/openrouter-generation-sync.js';

function equalSecret(actual, expected) {
  if (!actual || !expected || actual.length !== expected.length || actual.length > 512) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export default async function handler(req, res) {
  const expected = String(process.env.CRON_SECRET || '');
  const auth = String(req.headers?.authorization || '');
  if (req.method !== 'GET' || expected.length < 32 || !equalSecret(auth, 'Bearer ' + expected)) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    res.end('Not found');
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const result = await runOpenRouterGenerationSync();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(result));
  } catch (error) {
    const code = String(error?.message || 'sync_failed');
    console.warn('OpenRouter generation sync failed', {
      source: 'openrouter_generation_sync',
      reason: /^[a-z0-9_]+$/.test(code) ? code : 'sync_failed'
    });
    res.statusCode = code === 'missing_openrouter_management_key' || code === 'missing_openrouter_api_key' ||
      code === 'missing_supabase_url' || code === 'missing_supabase_secret_key' ? 503 : 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: { code: 'openrouter_generation_sync_failed', message: 'OpenRouter generation sync did not complete. Check server-side credentials, migration 072, and provider access.' } }));
  }
}
