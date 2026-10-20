import { randomUUID } from 'node:crypto';
import { UpstreamError } from '../http/errors.js';
import { UUID } from '../tenants.js';
import { mapKey, mapTenant, mapConversation, mapMessage, mapConnector, mapChannel } from './shape.js';

const KEY_ID = /^[0-9a-f]{12}$/;
const OWNER_ID = /^[A-Za-z0-9_-]{1,80}$/;
const OWNER_TYPES = new Set(['user', 'guest', 'service']);
const CONVERSATION_COLUMNS = 'id,tenant_id,owner_type,owner_id,title,created_at,updated_at,expires_at';
const MESSAGE_COLUMNS = 'id,role,content,created_at';

const PROJECT_COLUMNS = 'id,name,description,instructions,status,created_at,updated_at';
const mapProject = (r) => ({ id: r.id, name: r.name, description: r.description, instructions: r.instructions, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });
const NCC_CONTACT_COLUMNS = 'id,name,email,phone,company,tags,notes,source,created_at,updated_at';
const NCC_DEAL_COLUMNS = 'id,contact_id,title,stage,value,currency,created_at,updated_at';
const mapNccContact = (r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, company: r.company, tags: Array.isArray(r.tags) ? r.tags : [], notes: r.notes, source: r.source, createdAt: r.created_at, updatedAt: r.updated_at });
const mapNccDeal = (r) => ({ id: r.id, contactId: r.contact_id, title: r.title, stage: r.stage, value: Number(r.value), currency: r.currency, createdAt: r.created_at, updatedAt: r.updated_at });
const NCC_TASK_COLUMNS = 'id,title,due_at,done,contact_id,deal_id,origin,created_at,updated_at';
const NCC_ACTIVITY_COLUMNS = 'id,kind,text,created_at';
const NCC_AUTOMATION_COLUMNS = 'id,name,enabled,trigger,conditions,actions,runs,last_run_at,last_result,created_at,updated_at';
const mapNccTask = (r) => ({ id: r.id, title: r.title, dueAt: r.due_at, done: r.done, contactId: r.contact_id, dealId: r.deal_id, origin: r.origin, createdAt: r.created_at, updatedAt: r.updated_at });
const mapNccActivity = (r) => ({ id: r.id, kind: r.kind, text: r.text, createdAt: r.created_at });
const mapNccAutomation = (r) => ({ id: r.id, name: r.name, enabled: r.enabled, trigger: r.trigger, conditions: Array.isArray(r.conditions) ? r.conditions : [], actions: Array.isArray(r.actions) ? r.actions : [], runs: r.runs, lastRunAt: r.last_run_at, lastResult: r.last_result, createdAt: r.created_at, updatedAt: r.updated_at });
// A table that is not there yet (its migration not run): PostgREST answers 404
// (PGRST205) or names the missing relation (42P01).
const missingTable = (err) => err instanceof UpstreamError && / 404 |PGRST205|42P01|does not exist|schema cache/.test(String(err.message));
const NCC_CHANNEL_COLUMNS = 'id,kind,external_id,name,created_at';
const NCC_OUTBOX_COLUMNS = 'id,channel_id,automation_id,contact_id,action,payload,status,result,external_ref,created_at,updated_at';
const mapNccChannel = (r) => ({ id: r.id, kind: r.kind, externalId: r.external_id, name: r.name, createdAt: r.created_at, ...(r.token_enc ? { tokenEnc: r.token_enc } : {}) });
const mapNccOutbox = (r) => ({ id: r.id, channelId: r.channel_id, automationId: r.automation_id, contactId: r.contact_id, action: r.action, payload: r.payload && typeof r.payload === 'object' ? r.payload : {}, status: r.status, result: r.result, externalRef: r.external_ref, createdAt: r.created_at, updatedAt: r.updated_at });
const NCC_CONTACT_FIELDS = ['name', 'email', 'phone', 'company', 'tags', 'notes'];
const NCC_DEAL_FIELDS = ['title', 'stage', 'value', 'currency'];
// A second contact with the same email (unique index ncc_contacts_email_uq).
const nccDuplicate = (err) => {
  if (err instanceof UpstreamError && / 409 /.test(err.message)) { const e = new Error('duplicate contact'); e.code = 'duplicate'; throw e; }
  throw err;
};
const mapLibraryFile = (r) => ({ id: r.id, title: r.title, kind: r.kind, format: r.format, chars: r.chars, createdAt: r.created_at });

function assertOwner(ownerType, ownerId) {
  if (!OWNER_TYPES.has(ownerType) || !OWNER_ID.test(String(ownerId))) throw new Error('invalid conversation owner');
}

// Talks to the NasrinAI Supabase project through its REST API with the
// service-role key, the same headers supabase-js sends. Every value placed in a
// URL is validated first, so nothing a caller sends can change the query.
export function createSupabaseStore({ url, serviceKey, fetchImpl = fetch, timeoutMs = 8000 }) {
  async function request(method, path, { body, prefer } = {}) {
    const headers = {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      Accept: 'application/json'
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;

    let resp;
    try {
      resp = await fetchImpl(url + '/rest/v1/' + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (err) {
      throw new UpstreamError('database request failed: ' + (err?.name || 'error'));
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new UpstreamError(`database answered ${resp.status} for ${method} ${path.split('?')[0]}: ${text.slice(0, 200)}`);
    }
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  }

  async function mediaRequest(method, path, { bytes, mime = 'application/octet-stream' } = {}) {
    const deleting = method === 'DELETE';
    let resp;
    try {
      resp = await fetchImpl(url + (deleting ? '/storage/v1/object/media' : '/storage/v1/object/media/' + path), {
        method,
        headers: {
          apikey: serviceKey,
          Authorization: 'Bearer ' + serviceKey,
          ...(bytes ? { 'Content-Type': mime, 'x-upsert': 'false' } : {}),
          ...(deleting ? { 'Content-Type': 'application/json' } : {})
        },
        ...(bytes ? { body: bytes } : {}),
        ...(deleting ? { body: JSON.stringify({ prefixes: [path] }) } : {}),
        signal: AbortSignal.timeout(Math.max(timeoutMs, 60_000))
      });
    } catch (err) {
      throw new UpstreamError('media storage request failed: ' + (err?.name || 'error'));
    }
    if (!resp.ok) {
      const status = resp.status;
      await resp.text().catch(() => '');
      throw new UpstreamError('media storage answered ' + status + ' for ' + method + ' object request');
    }
    return method === 'GET' ? Buffer.from(await resp.arrayBuffer()) : true;
  }

  const AUDIO_ASSET_COLUMNS = 'id,tenant_id,owner_id,project_id,kind,storage_path,mime,size_bytes,voice_id,model_id,duration_seconds,label,created_at,updated_at';
  const mapAudioAsset = (r) => ({
    id: r.id, tenantId: r.tenant_id, ownerId: r.owner_id, projectId: r.project_id || null,
    kind: r.kind, storagePath: r.storage_path, mime: r.mime, sizeBytes: r.size_bytes,
    voiceId: r.voice_id || null, modelId: r.model_id || null,
    durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
    label: r.label, createdAt: r.created_at, updatedAt: r.updated_at
  });

  return {
    kind: 'supabase',
    request,

    async createPublishableKey({ tenantId, origin, label = 'NasrinAI Connect' }) {
      if (!UUID.test(String(tenantId)) || typeof origin !== 'string' || !/^https:\/\/[^/]+$/.test(origin)) {
        throw new Error('invalid Connect key request');
      }
      const rows = await request('POST', 'rpc/create_connect_publishable_key', {
        body: {
          p_tenant: tenantId,
          p_origin: origin.toLowerCase().replace(/\/+$/, ''),
          p_label: String(label).slice(0, 80)
        }
      });
      if (typeof rows !== 'string' || !/^nsp_[0-9a-f]{12}$/.test(rows)) throw new UpstreamError('create_api_key returned an unexpected shape');
      return rows;
    },

    async revokePublishableKey({ tenantId, key }) {
      const m = /^nsp_([0-9a-f]{12})$/.exec(String(key));
      if (!UUID.test(String(tenantId)) || !m) throw new Error('invalid Connect key revoke request');
      await request('PATCH', `api_keys?id=eq.${m[1]}&tenant_id=eq.${tenantId}&kind=eq.publishable`, {
        body: { revoked_at: new Date().toISOString() }
      });
    },

    async getApiKey(id) {
      if (!KEY_ID.test(String(id))) return null;
      const rows = await request('GET', `api_keys?id=eq.${id}&select=id,tenant_id,kind,secret_hash,scopes,allowed_origins,revoked_at&limit=1`);
      return rows && rows[0] ? mapKey(rows[0]) : null;
    },

    async getTenant(id) {
      if (!UUID.test(String(id))) return null;
      let rows;
      try {
        rows = await request('GET', `tenants?id=eq.${id}&select=id,kind,status,daily_token_limit,knowledge_only,off_topic_reply&limit=1`);
      } catch (err) {
        // Before migration 011 those columns do not exist: read without them
        // (every business answers as before) instead of failing every request.
        if (!/knowledge_only|off_topic_reply|42703/.test(String(err?.message))) throw err;
        rows = await request('GET', `tenants?id=eq.${id}&select=id,kind,status,daily_token_limit&limit=1`);
      }
      return rows && rows[0] ? mapTenant(rows[0]) : null;
    },

    // Counts one hit in a shared fixed window (database function rate_hit).
    async rateHit(bucket, windowSeconds, limit) {
      const rows = await request('POST', 'rpc/rate_hit', {
        body: { p_bucket: bucket, p_window_seconds: windowSeconds, p_limit: limit }
      });
      const r = Array.isArray(rows) ? rows[0] : rows;
      if (!r || typeof r.allowed !== 'boolean') throw new UpstreamError('rate_hit returned an unexpected shape');
      return { allowed: r.allowed, used: Number(r.used), retryAfter: Number(r.retry_after) };
    },

    async tokensSince({ since, tenantId = null, actorType = null, actorId = null }) {
      const n = await request('POST', 'rpc/usage_tokens_since', {
        body: { p_since: since.toISOString(), p_tenant: tenantId, p_actor_type: actorType, p_actor_id: actorId }
      });
      const value = Number(n);
      if (!Number.isFinite(value)) throw new UpstreamError('usage_tokens_since returned an unexpected shape');
      return value;
    },

    // Atomically reserve daily token capacity in PostgreSQL. The DB derives the
    // Manila day and serializes quota checks across all server instances.
    async reserveDailyTokens({ reservationId, tenantId, actorType, actorId, reservedTokens, actorLimit, guestLimit, tenantLimit }) {
      const rows = await request('POST', 'rpc/reserve_daily_tokens', {
        body: {
          p_reservation_id: reservationId,
          p_tenant: tenantId,
          p_actor_type: actorType,
          p_actor_id: actorId,
          p_reserved_tokens: reservedTokens,
          p_actor_limit: actorLimit,
          p_guest_limit: guestLimit,
          p_tenant_limit: tenantLimit
        }
      });
      const r = Array.isArray(rows) ? rows[0] : rows;
      if (!r || typeof r.allowed !== 'boolean' || typeof r.reason !== 'string' && r.reason !== null) {
        throw new UpstreamError('reserve_daily_tokens returned an unexpected shape');
      }
      return { allowed: r.allowed, reason: r.reason, reservationId: r.reservation_id || null,
        actorUsed: Number(r.actor_used || 0), tenantUsed: Number(r.tenant_used || 0) };
    },

    async settleDailyTokenReservation({ reservationId, actualTokens }) {
      const value = await request('POST', 'rpc/settle_daily_token_reservation', {
        body: { p_reservation_id: reservationId, p_actual_tokens: actualTokens }
      });
      if (typeof value !== 'boolean') throw new UpstreamError('settle_daily_token_reservation returned an unexpected shape');
      return value;
    },

    async releaseDailyTokenReservation({ reservationId }) {
      const value = await request('POST', 'rpc/release_daily_token_reservation', {
        body: { p_reservation_id: reservationId }
      });
      if (typeof value !== 'boolean') throw new UpstreamError('release_daily_token_reservation returned an unexpected shape');
      return value;
    },

    async reserveDailyRealtimeVoice({ reservationId, tenantId, actorType, actorId, reservedSeconds, dailyLimitSeconds }) {
      const rows = await request('POST', 'rpc/reserve_daily_realtime_voice', {
        body: {
          p_reservation_id: reservationId, p_tenant: tenantId, p_actor_type: actorType, p_actor_id: actorId,
          p_reserved_seconds: reservedSeconds, p_daily_limit_seconds: dailyLimitSeconds
        }
      });
      const r = Array.isArray(rows) ? rows[0] : rows;
      if (!r || typeof r.allowed !== 'boolean' || (r.reason !== null && typeof r.reason !== 'string')) {
        throw new UpstreamError('reserve_daily_realtime_voice returned an unexpected shape');
      }
      return { allowed: r.allowed, reason: r.reason, reservationId: r.reservation_id || null, usedSeconds: Number(r.used_seconds || 0), reservedSeconds: Number(r.reserved_seconds || 0) };
    },

    async settleDailyRealtimeVoiceReservation({ reservationId }) {
      const value = await request('POST', 'rpc/settle_daily_realtime_voice', {
        body: { p_reservation_id: reservationId }
      });
      if (typeof value !== 'boolean') throw new UpstreamError('settle_daily_realtime_voice returned an unexpected shape');
      return value;
    },

    async releaseDailyRealtimeVoiceReservation({ reservationId }) {
      const value = await request('POST', 'rpc/release_daily_realtime_voice', {
        body: { p_reservation_id: reservationId }
      });
      if (typeof value !== 'boolean') throw new UpstreamError('release_daily_realtime_voice returned an unexpected shape');
      return value;
    },

    async reserveGlobalSpend({ reservationId, kind, tenantId, actorType, actorId, reservedUsd, dailyLimit, weeklyLimit, monthlyLimit, maxRequestUsd = null }) {
      const rows = await request('POST', 'rpc/reserve_global_spend', {
        body: {
          p_reservation_id: reservationId, p_kind: kind, p_tenant: tenantId,
          p_actor_type: actorType, p_actor_id: actorId, p_reserved_usd: reservedUsd,
          p_daily_limit: dailyLimit, p_weekly_limit: weeklyLimit, p_monthly_limit: monthlyLimit,
          p_max_request_usd: maxRequestUsd
        }
      });
      const r = Array.isArray(rows) ? rows[0] : rows;
      if (!r || typeof r.allowed !== 'boolean' || (r.reason !== null && typeof r.reason !== 'string')) {
        throw new UpstreamError('reserve_global_spend returned an unexpected shape');
      }
      return { allowed: r.allowed, reason: r.reason, reservationId: r.reservation_id || null,
        dailyUsed: Number(r.daily_used || 0), weeklyUsed: Number(r.weekly_used || 0), monthlyUsed: Number(r.monthly_used || 0) };
    },

    async settleGlobalSpendReservation({ reservationId, actualUsd }) {
      const value = await request('POST', 'rpc/settle_global_spend', {
        body: { p_reservation_id: reservationId, p_actual_usd: actualUsd }
      });
      if (typeof value !== 'boolean') throw new UpstreamError('settle_global_spend returned an unexpected shape');
      return value;
    },

    async releaseGlobalSpendReservation({ reservationId }) {
      const value = await request('POST', 'rpc/release_global_spend', { body: { p_reservation_id: reservationId } });
      if (typeof value !== 'boolean') throw new UpstreamError('release_global_spend returned an unexpected shape');
      return value;
    },

    async createConversation({ tenantId, ownerType, ownerId, title = '', expiresAt = null }) {
      assertOwner(ownerType, ownerId);
      const rows = await request('POST', `conversations?select=${CONVERSATION_COLUMNS}`, {
        prefer: 'return=representation',
        body: { tenant_id: tenantId, owner_type: ownerType, owner_id: ownerId, title, expires_at: expiresAt }
      });
      return mapConversation(rows[0]);
    },

    async getConversation(id) {
      if (!UUID.test(String(id))) return null;
      const rows = await request('GET', `conversations?id=eq.${id}&select=${CONVERSATION_COLUMNS}&limit=1`);
      return rows && rows[0] ? mapConversation(rows[0]) : null;
    },

    async listConversations({ tenantId, ownerType, ownerId, limit = 20 }) {
      if (!UUID.test(String(tenantId))) return [];
      assertOwner(ownerType, ownerId);
      const rows = await request('GET', `conversations?tenant_id=eq.${tenantId}&owner_type=eq.${ownerType}`
        + `&owner_id=eq.${encodeURIComponent(ownerId)}&order=updated_at.desc&limit=${Math.min(100, limit)}&select=${CONVERSATION_COLUMNS}`);
      return (rows || []).map(mapConversation);
    },

    async setConversationTitle(id, title) {
      if (!UUID.test(String(id))) return;
      await request('PATCH', `conversations?id=eq.${id}`, { prefer: 'return=minimal', body: { title } });
    },

    async deleteConversation(id) {
      if (!UUID.test(String(id))) return;
      await request('DELETE', `conversations?id=eq.${id}`, { prefer: 'return=minimal' });
    },

    async addMessage({ conversationId, tenantId, role, content }) {
      const rows = await request('POST', `messages?select=${MESSAGE_COLUMNS}`, {
        prefer: 'return=representation',
        body: { conversation_id: conversationId, tenant_id: tenantId, role, content }
      });
      return mapMessage(rows[0]);
    },

    // The latest `limit` messages, oldest first.
    async listMessages(conversationId, limit = 50) {
      if (!UUID.test(String(conversationId))) return [];
      const rows = await request('GET', `messages?conversation_id=eq.${conversationId}`
        + `&order=created_at.desc&limit=${Math.min(200, limit)}&select=${MESSAGE_COLUMNS}`);
      return (rows || []).map(mapMessage).reverse();
    },

    // One message of one conversation (both ids must match).
    async deleteMessage(conversationId, id) {
      if (!UUID.test(String(conversationId)) || !UUID.test(String(id))) return;
      await request('DELETE', `messages?id=eq.${id}&conversation_id=eq.${conversationId}`, { prefer: 'return=minimal' });
    },

    async getMessage(id) {
      if (!UUID.test(String(id))) return null;
      const rows = await request('GET', `messages?id=eq.${id}&select=id,conversation_id,role,content,created_at&limit=1`);
      const r = rows && rows[0];
      return r ? { ...mapMessage(r), conversationId: r.conversation_id } : null;
    },

    // The user's plan periods that are running now.
    async activePlans({ tenantId, userId }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) return [];
      const at = new Date().toISOString();
      const rows = await request('GET', `plan_periods?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}`
        + `&status=eq.active&starts_at=lte.${encodeURIComponent(at)}&ends_at=gt.${encodeURIComponent(at)}&select=plan,ends_at&limit=20`);
      return (rows || []).map((r) => ({ plan: r.plan, endsAt: r.ends_at }));
    },

    // Records one paid period (database function add_plan_period). Null when
    // this payment was already recorded.
    async addPlanPeriod({ tenantId, userId, plan, days, provider, ref = null, amount = null, currency = null }) {
      const id = await request('POST', 'rpc/add_plan_period', {
        body: { p_tenant: tenantId, p_user: userId, p_plan: plan, p_days: days, p_provider: provider, p_ref: ref, p_amount: amount, p_currency: currency }
      });
      return typeof id === 'string' ? id : null;
    },

    async purgeExpired() {
      await request('POST', 'rpc/purge_expired', { body: {} });
    },

    async recordUsage(e) {
      const body = {
        tenant_id: e.tenantId, actor_type: e.actorType, actor_id: e.actorId,
        provider: e.provider, model: e.model,
        input_tokens: e.inputTokens, output_tokens: e.outputTokens,
        latency_ms: e.latencyMs, outcome: e.outcome
      };
      const reservation = e.reservationId ? { reservation_id: e.reservationId } : {};
      const spendReservation = e.spendReservationId ? { spend_reservation_id: e.spendReservationId } : {};
      const routing = {
        task: e.task ?? null, level: e.level ?? null, cost_usd: e.costUsd ?? null,
        cached_tokens: e.cachedTokens ?? null, escalated: e.escalated === true, cache_hit: e.cacheHit === true
      };
      try {
        await request('POST', 'usage_events', { prefer: 'return=minimal', body: { ...body, ...reservation, ...spendReservation, ...routing } });
      } catch (err) {
        // Before migration 003 the routing columns do not exist: keep the basic record.
        if (!/PGRST204|column|budget_blocked|23514/.test(err.message)) throw err;
        if (body.outcome === 'budget_blocked') return;
        await request('POST', 'usage_events', { prefer: 'return=minimal', body });
      }
    },

    // Pictures actually made (usage records, migration 003), for allowances.
    // Counts up to `limit` rows (allowances are small).
    async imagesMadeSince({ since, tenantId, actorType, actorId = null, limit = 1000 }) {
      const q = [
        'select=id', 'task=eq.image', 'outcome=eq.ok',
        'tenant_id=eq.' + encodeURIComponent(tenantId), 'actor_type=eq.' + encodeURIComponent(actorType),
        ...(actorId === null ? [] : ['actor_id=eq.' + encodeURIComponent(actorId)]),
        'created_at=gte.' + encodeURIComponent(since.toISOString()), 'limit=' + Math.max(1, Math.floor(limit))
      ].join('&');
      const rows = await request('GET', 'usage_events?' + q);
      if (!Array.isArray(rows)) throw new UpstreamError('usage_events returned an unexpected shape');
      return rows.length;
    },

    // Improvement consent (migration 018): append-only choice events; no content is stored here.
    async getImprovementConsent({ tenantId, subjectType, subjectId }) {
      if (!UUID.test(String(tenantId)) || !['user', 'guest'].includes(subjectType) || !OWNER_ID.test(String(subjectId))) return null;
      const rows = await request('GET', `improvement_consent_events?tenant_id=eq.${tenantId}&subject_type=eq.${subjectType}&subject_id=eq.${encodeURIComponent(subjectId)}&select=version,decision,created_at&order=created_at.desc,id.desc&limit=1`);
      const row = rows && rows[0];
      return row ? { version: row.version, decision: row.decision, createdAt: row.created_at } : null;
    },
    async recordImprovementConsent({ tenantId, subjectType, subjectId, version, decision }) {
      if (!UUID.test(String(tenantId)) || !['user', 'guest'].includes(subjectType) || !OWNER_ID.test(String(subjectId)) ||
          !/^[A-Za-z0-9._-]{1,40}$/.test(String(version)) || !['granted', 'declined', 'withdrawn'].includes(decision)) {
        throw new Error('invalid improvement consent event');
      }
      await request('POST', 'improvement_consent_events', { prefer: 'return=minimal', body: { tenant_id: tenantId, subject_type: subjectType, subject_id: subjectId, version, decision } });
    },
    // Delete all examples for a server-verified subject and record a content-free tombstone.
    async deleteImprovementExamplesForSubject({ tenantId, subjectType, subjectId, reasonCode }) {
      if (!UUID.test(String(tenantId)) || !['user', 'guest'].includes(subjectType) || !OWNER_ID.test(String(subjectId)) ||
          !['consent_withdrawal', 'account_deletion', 'privacy_request'].includes(reasonCode)) {
        throw new Error('invalid improvement-example deletion request');
      }
      const result = await request('POST', 'rpc/delete_improvement_examples_for_subject', {
        body: { p_tenant_id: tenantId, p_subject_type: subjectType, p_subject_id: subjectId, p_request_id: randomUUID(), p_reason_code: reasonCode }
      });
      if (!Number.isSafeInteger(result) || result < 0) throw new UpstreamError('improvement-example deletion returned an unexpected result');
      return result;
    },

    // Legal acceptance records (migration 005): insert-only.
    async recordAcceptance({ tenantId, userId, document, version, action, method }) {
      await request('POST', 'legal_acceptances', { prefer: 'return=minimal', body: { tenant_id: tenantId, user_id: userId, document, version, action, method } });
    },
    async hasAccepted({ tenantId, userId, document, version }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) return false;
      const rows = await request('GET', `legal_acceptances?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}`
        + `&document=eq.${encodeURIComponent(document)}&version=eq.${encodeURIComponent(version)}&select=id&limit=1`);
      return Boolean(rows && rows.length);
    },
    async listAcceptances({ tenantId, userId }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) return [];
      return (await request('GET', `legal_acceptances?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&select=document,version,action,method,created_at&order=created_at.asc&limit=200`)) || [];
    },
    async listPlanPeriods({ tenantId, userId }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) return [];
      return (await request('GET', `plan_periods?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&select=id,plan,starts_at,ends_at,provider,provider_ref,amount,currency,created_at&order=created_at.asc&limit=500`)) || [];
    },
    // Every conversation of one owner (their messages and pictures go with them).
    async deleteConversationsOf({ tenantId, ownerType, ownerId }) {
      if (!UUID.test(String(tenantId))) return;
      assertOwner(ownerType, ownerId);
      await request('DELETE', `conversations?tenant_id=eq.${tenantId}&owner_type=eq.${ownerType}&owner_id=eq.${encodeURIComponent(ownerId)}`, { prefer: 'return=minimal' });
    },
    // Permanent web answers (migration 037): no owner, no session.
    async addWebAnswer({ question, answer, sources }) {
      await request('POST', 'web_answers', { body: { question, answer, sources }, prefer: 'return=minimal' });
    },
    // GitHub connections (migrations 038, 039): sealed tokens only; up to 10
    // accounts per person, one of them the main account.
    async listGithubConnections({ tenantId, userId }) {
      if (!UUID.test(String(tenantId))) return [];
      const rows = await request('GET', `github_connections?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&select=login,is_main,access_token_enc,refresh_token_enc,expires_at,refresh_expires_at,created_at&order=is_main.desc,created_at.asc`);
      return (Array.isArray(rows) ? rows : []).map((r) => ({ tenantId, userId, login: r.login, isMain: r.is_main === true, accessTokenEnc: r.access_token_enc, refreshTokenEnc: r.refresh_token_enc, expiresAt: r.expires_at, refreshExpiresAt: r.refresh_expires_at }));
    },
    // One account: the given login, or the main one.
    async getGithubConnection({ tenantId, userId, login = null }) {
      const all = await this.listGithubConnections({ tenantId, userId });
      return (login ? all.find((r) => r.login === login) : all.find((r) => r.isMain) || all[0]) || null;
    },
    async saveGithubConnection({ tenantId, userId, login, isMain = false, accessTokenEnc, refreshTokenEnc = null, expiresAt = null, refreshExpiresAt = null }) {
      await request('POST', 'github_connections?on_conflict=tenant_id,user_id,login', {
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: { tenant_id: tenantId, user_id: userId, login, is_main: isMain, access_token_enc: accessTokenEnc, refresh_token_enc: refreshTokenEnc, expires_at: expiresAt, refresh_expires_at: refreshExpiresAt, updated_at: new Date().toISOString() }
      });
    },
    async setGithubMain({ tenantId, userId, login }) {
      if (!UUID.test(String(tenantId))) return;
      const who = `tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}`;
      await request('PATCH', `github_connections?${who}&is_main=eq.true`, { body: { is_main: false }, prefer: 'return=minimal' });
      await request('PATCH', `github_connections?${who}&login=eq.${encodeURIComponent(login)}`, { body: { is_main: true }, prefer: 'return=minimal' });
    },
    // One account (login), or all of them.
    async deleteGithubConnection({ tenantId, userId, login = null }) {
      if (!UUID.test(String(tenantId))) return;
      await request('DELETE', `github_connections?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}${login ? `&login=eq.${encodeURIComponent(login)}` : ''}`, { prefer: 'return=minimal' });
    },
    async deleteUserData({ tenantId, userId }) {
      await request('POST', 'rpc/delete_user_data', { body: { p_tenant: tenantId, p_user: userId } });
      // Migration 051 is additive; tolerate its absence so account deletion
      // remains available before the Studio migration is applied.
      try {
        await request('DELETE', `video_studio_projects?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}`, { prefer: 'return=minimal' });
      } catch (err) {
        if (!missingTable(err)) throw err;
      }
      await this.deleteNccData({ tenantId, userId });
      await this.deleteGithubConnection({ tenantId, userId });
      await this.deleteResearchScansOf({ tenantId, ownerType: 'user', ownerId: userId });
    },

    // NCC contacts and deals (migration 040). Every query filters by tenant AND user.
    async listNccContacts({ tenantId, userId }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) return [];
      const rows = await request('GET', `ncc_contacts?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=20000&select=${NCC_CONTACT_COLUMNS}`);
      return (rows || []).map(mapNccContact);
    },
    async getNccContact({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return null;
      const rows = await request('GET', `ncc_contacts?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=${NCC_CONTACT_COLUMNS}&limit=1`);
      return rows && rows[0] ? mapNccContact(rows[0]) : null;
    },
    async createNccContact({ tenantId, userId, name, email = '', phone = '', company = '', tags = [], notes = '', source = 'manual' }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) throw new Error('invalid NCC owner');
      const rows = await request('POST', `ncc_contacts?select=${NCC_CONTACT_COLUMNS}`, { prefer: 'return=representation', body: { tenant_id: tenantId, user_id: userId, name, email, phone, company, tags, notes, source } }).catch(nccDuplicate);
      return mapNccContact(rows[0]);
    },
    // Many contacts in one request (an import batch): all are saved, or none.
    async createNccContacts({ tenantId, userId, contacts }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) throw new Error('invalid NCC owner');
      const body = contacts.map((c) => ({ tenant_id: tenantId, user_id: userId, name: c.name, email: c.email || '', phone: c.phone || '', company: c.company || '', tags: c.tags || [], notes: c.notes || '', source: c.source || 'import' }));
      await request('POST', 'ncc_contacts', { prefer: 'return=minimal', body }).catch(nccDuplicate);
    },
    async updateNccContact({ tenantId, userId, id, patch }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return null;
      const body = { updated_at: new Date().toISOString() };
      for (const k of NCC_CONTACT_FIELDS) if (k in patch) body[k] = patch[k];
      const rows = await request('PATCH', `ncc_contacts?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=${NCC_CONTACT_COLUMNS}`, { prefer: 'return=representation', body }).catch(nccDuplicate);
      return rows && rows[0] ? mapNccContact(rows[0]) : null;
    },
    async deleteNccContact({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return false;
      const rows = await request('DELETE', `ncc_contacts?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=id`, { prefer: 'return=representation' });
      return Boolean(rows && rows.length);
    },
    async listNccDeals({ tenantId, userId }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) return [];
      const rows = await request('GET', `ncc_deals?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=20000&select=${NCC_DEAL_COLUMNS}`);
      return (rows || []).map(mapNccDeal);
    },
    async createNccDeal({ tenantId, userId, contactId, title, stage = 'lead', value = 0, currency = 'PHP' }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(contactId))) throw new Error('invalid NCC deal');
      const rows = await request('POST', `ncc_deals?select=${NCC_DEAL_COLUMNS}`, { prefer: 'return=representation', body: { tenant_id: tenantId, user_id: userId, contact_id: contactId, title, stage, value, currency } });
      return mapNccDeal(rows[0]);
    },
    async updateNccDeal({ tenantId, userId, id, patch }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return null;
      const body = { updated_at: new Date().toISOString() };
      for (const k of NCC_DEAL_FIELDS) if (k in patch) body[k] = patch[k];
      const rows = await request('PATCH', `ncc_deals?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=${NCC_DEAL_COLUMNS}`, { prefer: 'return=representation', body });
      return rows && rows[0] ? mapNccDeal(rows[0]) : null;
    },
    async deleteNccDeal({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return false;
      const rows = await request('DELETE', `ncc_deals?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=id`, { prefer: 'return=representation' });
      return Boolean(rows && rows.length);
    },
    async listNccTasks({ tenantId, userId }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) return [];
      const rows = await request('GET', `ncc_tasks?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&order=due_at.asc.nullslast,created_at.asc&limit=20000&select=${NCC_TASK_COLUMNS}`);
      return (rows || []).map(mapNccTask);
    },
    async createNccTask({ tenantId, userId, title, dueAt = null, contactId = null, dealId = null, origin = 'person' }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) throw new Error('invalid NCC owner');
      if ((contactId && !UUID.test(String(contactId))) || (dealId && !UUID.test(String(dealId)))) throw new Error('invalid NCC task link');
      const rows = await request('POST', `ncc_tasks?select=${NCC_TASK_COLUMNS}`, { prefer: 'return=representation', body: { tenant_id: tenantId, user_id: userId, title, due_at: dueAt, contact_id: contactId, deal_id: dealId, origin } });
      return mapNccTask(rows[0]);
    },
    async updateNccTask({ tenantId, userId, id, patch }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return null;
      const body = { updated_at: new Date().toISOString() };
      if ('title' in patch) body.title = patch.title;
      if ('dueAt' in patch) body.due_at = patch.dueAt;
      if ('done' in patch) body.done = patch.done;
      const rows = await request('PATCH', `ncc_tasks?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=${NCC_TASK_COLUMNS}`, { prefer: 'return=representation', body });
      return rows && rows[0] ? mapNccTask(rows[0]) : null;
    },
    async deleteNccTask({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return false;
      const rows = await request('DELETE', `ncc_tasks?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=id`, { prefer: 'return=representation' });
      return Boolean(rows && rows.length);
    },
    async listNccActivities({ tenantId, userId, contactId, limit = 100 }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(contactId))) return [];
      const n = Math.min(Math.max(Number(limit) || 100, 1), 1000);
      const rows = await request('GET', `ncc_activities?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&contact_id=eq.${contactId}&order=created_at.desc&limit=${n}&select=${NCC_ACTIVITY_COLUMNS}`);
      return (rows || []).map(mapNccActivity);
    },
    async addNccActivity({ tenantId, userId, contactId, kind, text }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(contactId))) throw new Error('invalid NCC activity');
      const rows = await request('POST', `ncc_activities?select=${NCC_ACTIVITY_COLUMNS}`, { prefer: 'return=representation', body: { tenant_id: tenantId, user_id: userId, contact_id: contactId, kind, text } });
      return mapNccActivity(rows[0]);
    },
    async listNccAutomations({ tenantId, userId }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) return [];
      const rows = await request('GET', `ncc_automations?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc&limit=200&select=${NCC_AUTOMATION_COLUMNS}`);
      return (rows || []).map(mapNccAutomation);
    },
    async createNccAutomation({ tenantId, userId, name, enabled = false, trigger, conditions = [], actions }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) throw new Error('invalid NCC owner');
      const rows = await request('POST', `ncc_automations?select=${NCC_AUTOMATION_COLUMNS}`, { prefer: 'return=representation', body: { tenant_id: tenantId, user_id: userId, name, enabled, trigger, conditions, actions } });
      return mapNccAutomation(rows[0]);
    },
    async updateNccAutomation({ tenantId, userId, id, patch }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return null;
      const body = { updated_at: new Date().toISOString() };
      for (const k of ['name', 'enabled', 'trigger', 'conditions', 'actions']) if (k in patch) body[k] = patch[k];
      const rows = await request('PATCH', `ncc_automations?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=${NCC_AUTOMATION_COLUMNS}`, { prefer: 'return=representation', body });
      return rows && rows[0] ? mapNccAutomation(rows[0]) : null;
    },
    async deleteNccAutomation({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return false;
      const rows = await request('DELETE', `ncc_automations?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=id`, { prefer: 'return=representation' });
      return Boolean(rows && rows.length);
    },
    // The run counter is informational: read, then write.
    async recordNccAutomationRun({ tenantId, userId, id, result, at }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return;
      const who = `tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}`;
      const rows = await request('GET', `ncc_automations?${who}&select=runs&limit=1`);
      if (!rows || !rows[0]) return;
      await request('PATCH', `ncc_automations?${who}`, { prefer: 'return=minimal', body: { runs: rows[0].runs + 1, last_run_at: at, last_result: String(result).slice(0, 300) } });
    },
    // The business's Meta channels. Tokens are read only by getNccChannel (to send).
    async listNccChannels({ tenantId, userId }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) return [];
      const rows = await request('GET', `ncc_channels?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc&limit=50&select=${NCC_CHANNEL_COLUMNS}`);
      return (rows || []).map(mapNccChannel);
    },
    async getNccChannel({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return null;
      const rows = await request('GET', `ncc_channels?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=${NCC_CHANNEL_COLUMNS},token_enc&limit=1`);
      return rows && rows[0] ? mapNccChannel(rows[0]) : null;
    },
    async upsertNccChannel({ tenantId, userId, kind, externalId, name, tokenEnc }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !/^[0-9]{1,30}$/.test(String(externalId))) throw new Error('invalid NCC channel');
      const rows = await request('POST', `ncc_channels?on_conflict=tenant_id,user_id,kind,external_id&select=${NCC_CHANNEL_COLUMNS}`, { prefer: 'return=representation,resolution=merge-duplicates', body: { tenant_id: tenantId, user_id: userId, kind, external_id: externalId, name, token_enc: tokenEnc } });
      return mapNccChannel(rows[0]);
    },
    async deleteNccChannel({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return false;
      const rows = await request('DELETE', `ncc_channels?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=id`, { prefer: 'return=representation' });
      return Boolean(rows && rows.length);
    },
    async listNccOutbox({ tenantId, userId, limit = 100 }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) return [];
      const n = Math.min(Math.max(Number(limit) || 100, 1), 1000);
      const rows = await request('GET', `ncc_outbox?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=${n}&select=${NCC_OUTBOX_COLUMNS}`);
      return (rows || []).map(mapNccOutbox);
    },
    async createNccOutbox({ tenantId, userId, channelId, automationId = null, contactId = null, action, payload }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(channelId))) throw new Error('invalid NCC outbox item');
      if ((automationId && !UUID.test(String(automationId))) || (contactId && !UUID.test(String(contactId)))) throw new Error('invalid NCC outbox link');
      const rows = await request('POST', `ncc_outbox?select=${NCC_OUTBOX_COLUMNS}`, { prefer: 'return=representation', body: { tenant_id: tenantId, user_id: userId, channel_id: channelId, automation_id: automationId, contact_id: contactId, action, payload } });
      return mapNccOutbox(rows[0]);
    },
    // pending -> sending in one conditional update: only one caller wins.
    async claimNccOutbox({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return null;
      const rows = await request('PATCH', `ncc_outbox?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&status=eq.pending&select=${NCC_OUTBOX_COLUMNS}`, { prefer: 'return=representation', body: { status: 'sending', updated_at: new Date().toISOString() } });
      return rows && rows[0] ? mapNccOutbox(rows[0]) : null;
    },
    async finishNccOutbox({ tenantId, userId, id, status, result, externalRef }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return null;
      const rows = await request('PATCH', `ncc_outbox?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&status=eq.sending&select=${NCC_OUTBOX_COLUMNS}`, { prefer: 'return=representation', body: { status, result, external_ref: externalRef, updated_at: new Date().toISOString() } });
      return rows && rows[0] ? mapNccOutbox(rows[0]) : null;
    },
    async discardNccOutbox({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId)) || !UUID.test(String(id))) return null;
      const rows = await request('PATCH', `ncc_outbox?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&status=eq.pending&select=${NCC_OUTBOX_COLUMNS}`, { prefer: 'return=representation', body: { status: 'discarded', updated_at: new Date().toISOString() } });
      return rows && rows[0] ? mapNccOutbox(rows[0]) : null;
    },
    // Contacts first (their deals, tasks and timelines go with them), then the rest.
    async deleteNccData({ tenantId, userId }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(userId))) return;
      const who = `tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}`;
      // Each table on its own: one whose migration (040, 041) is not run yet
      // is skipped, so deleting an account never fails because of NCC.
      for (const table of ['ncc_channels', 'ncc_contacts', 'ncc_tasks', 'ncc_automations']) {
        await request('DELETE', `${table}?${who}`, { prefer: 'return=minimal' }).catch((err) => { if (!missingTable(err)) throw err; });
      }
    },

    // Research agent (migration 036). Scans are always read by tenant AND owner.
    async addResearchScan({ tenantId, ownerType, ownerId, query, sources, facts, expiresAt }) {
      if (!UUID.test(String(tenantId))) throw new Error('invalid tenant');
      assertOwner(ownerType, ownerId);
      const rows = await request('POST', 'research_scans?select=id,created_at,expires_at', {
        body: { tenant_id: tenantId, owner_type: ownerType, owner_id: ownerId, query, sources, facts, expires_at: expiresAt.toISOString() },
        prefer: 'return=representation'
      });
      const r = rows[0];
      return { id: r.id, createdAt: r.created_at, expiresAt: r.expires_at };
    },
    async getResearchScan({ tenantId, ownerType, ownerId, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return null;
      assertOwner(ownerType, ownerId);
      const rows = await request('GET', `research_scans?select=id,query,sources,facts,created_at,expires_at&id=eq.${id}&tenant_id=eq.${tenantId}&owner_type=eq.${ownerType}&owner_id=eq.${encodeURIComponent(ownerId)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`);
      const r = rows[0];
      return r ? { id: r.id, query: r.query, sources: r.sources, facts: r.facts, createdAt: r.created_at, expiresAt: r.expires_at } : null;
    },
    async listResearchScans({ tenantId, ownerType, ownerId, limit = 50 }) {
      if (!UUID.test(String(tenantId))) return [];
      assertOwner(ownerType, ownerId);
      const n = Math.max(1, Math.min(100, Number(limit) || 50));
      const rows = await request('GET', `research_scans?select=id,query,sources,facts,created_at,expires_at&tenant_id=eq.${tenantId}&owner_type=eq.${ownerType}&owner_id=eq.${encodeURIComponent(ownerId)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc&limit=${n}`);
      return rows.map((r) => ({ id: r.id, query: r.query, sources: r.sources, facts: r.facts, createdAt: r.created_at, expiresAt: r.expires_at }));
    },
    async deleteResearchScansOf({ tenantId, ownerType, ownerId }) {
      if (!UUID.test(String(tenantId))) return;
      assertOwner(ownerType, ownerId);
      await request('DELETE', `research_scans?tenant_id=eq.${tenantId}&owner_type=eq.${ownerType}&owner_id=eq.${encodeURIComponent(ownerId)}`, { prefer: 'return=minimal' });
    },
    // Shared facts: only the fact and its source. A fact already known is skipped.
    async addResearchFacts(rows) {
      if (!rows.length) return 0;
      const added = await request('POST', 'research_facts?on_conflict=fact_hash&select=id', {
        body: rows.map((f) => ({ fact: f.fact, source_url: f.sourceUrl, source_title: f.sourceTitle || '', fact_hash: f.factHash })),
        prefer: 'resolution=ignore-duplicates,return=representation'
      });
      return Array.isArray(added) ? added.length : 0;
    },
    async listResearchFacts({ status = 'pending', limit = 100 } = {}) {
      if (!['pending', 'approved', 'rejected'].includes(status)) throw new Error('invalid status');
      const n = Math.max(1, Math.min(500, Number(limit) || 100));
      const rows = await request('GET', `research_facts?select=id,fact,source_url,source_title,status,created_at&status=eq.${status}&order=created_at.desc&limit=${n}`);
      return rows.map((r) => ({ id: r.id, fact: r.fact, sourceUrl: r.source_url, sourceTitle: r.source_title, status: r.status, createdAt: r.created_at }));
    },
    async purgeResearch() {
      await request('POST', 'rpc/purge_research', { body: {} });
    },

    // Retention: pictures of businesses older than `before`. Signed-in people's
    // pictures follow their own keep-time (purgeUserBefore).
    async purgeImagesBefore(before) {
      await request('DELETE', 'generated_images?owner_type=eq.service&created_at=lt.' + encodeURIComponent(before.toISOString()), { prefer: 'return=minimal' });
    },

    async purgeImprovementConsent() {
      await request('POST', 'rpc/purge_improvement_consent', { body: {} });
    },

    async purgeImprovementExamples() {
      await request('POST', 'rpc/purge_improvement_examples', { body: {} });
    },

    async purgeRetention(imageRetentionDays = 30) {
      if (!Number.isInteger(imageRetentionDays) || imageRetentionDays < 0 || imageRetentionDays > 3650) {
        throw new Error('invalid image retention days');
      }
      await request('POST', 'rpc/purge_retention', { body: { p_image_retention_days: imageRetentionDays } });
    },

    // Generated images (migration 004). Bytes travel as Postgres hex (bytea).
    async getMarketingCache({ tenantId, ownerType, ownerId, kind, key }) {
      if (!UUID.test(String(tenantId)) || !/^[A-Za-z0-9_-]{1,80}$/.test(String(ownerId)) ||
          !['user', 'guest', 'service'].includes(ownerType) || !['image', 'video', 'brief'].includes(kind) ||
          !/^[0-9a-f]{64}$/.test(String(key))) return null;
      const q = `marketing_cache?tenant_id=eq.${tenantId}&owner_type=eq.${ownerType}&owner_id=eq.${encodeURIComponent(ownerId)}&kind=eq.${kind}&cache_key=eq.${key}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=value&limit=1`;
      const rows = await request('GET', q);
      return Array.isArray(rows) && rows[0] ? rows[0].value : null;
    },
    async setMarketingCache({ tenantId, ownerType, ownerId, kind, key, value, ttlMs = 7 * 86400_000 }) {
      if (!UUID.test(String(tenantId)) || !/^[A-Za-z0-9_-]{1,80}$/.test(String(ownerId)) ||
          !['user', 'guest', 'service'].includes(ownerType) || !['image', 'video', 'brief'].includes(kind) ||
          !/^[0-9a-f]{64}$/.test(String(key)) || !value || typeof value !== 'object' || Array.isArray(value) ||
          !Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 30 * 86400_000) return false;
      if (JSON.stringify(value).length > 100_000) return false;
      // Opportunistic cleanup bounds table growth without requiring pg_cron.
      await request('DELETE', 'marketing_cache?expires_at=lt.' + encodeURIComponent(new Date().toISOString()), { prefer: 'return=minimal' });
      const body = { tenant_id: tenantId, owner_type: ownerType, owner_id: ownerId, kind, cache_key: key,
        value, expires_at: new Date(Date.now() + ttlMs).toISOString(), updated_at: new Date().toISOString() };
      const rows = await request('POST', 'marketing_cache?on_conflict=tenant_id,owner_type,owner_id,kind,cache_key&select=id', {
        prefer: 'return=representation,resolution=merge-duplicates', body
      });
      return Array.isArray(rows) && rows.length > 0;
    },

    async addImage({ tenantId, conversationId, ownerType, ownerId, mime, bytes, provider, model }) {
      assertOwner(ownerType, ownerId);
      const rows = await request('POST', 'generated_images?select=id', {
        prefer: 'return=representation',
        body: { tenant_id: tenantId, conversation_id: conversationId, owner_type: ownerType, owner_id: ownerId, mime, bytes: '\\x' + bytes.toString('hex'), provider, model }
      });
      return rows[0].id;
    },

    async getImage(id) {
      if (!UUID.test(String(id))) return null;
      const rows = await request('GET', `generated_images?id=eq.${id}&select=id,tenant_id,owner_type,owner_id,mime,bytes&limit=1`);
      const r = rows && rows[0];
      if (!r) return null;
      return { id: r.id, tenantId: r.tenant_id, ownerType: r.owner_type, ownerId: r.owner_id, mime: r.mime,
        bytes: Buffer.from(String(r.bytes).replace(/^\\x/, ''), 'hex') };
    },

    async createVideoStudioAudioAsset(row) {
      if (!UUID.test(String(row.tenantId)) || !OWNER_ID.test(String(row.ownerId)) || row.ownerType !== 'user' ||
          !Buffer.isBuffer(row.bytes) || row.bytes.length < 1 || row.bytes.length > 12 * 1024 * 1024 ||
          !['voiceover', 'sound_effect'].includes(row.kind)) throw new Error('invalid Video Studio audio asset');
      if (row.projectId && !UUID.test(String(row.projectId))) throw new Error('invalid Video Studio project id');
      const id = randomUUID();
      const storagePath = row.tenantId + '/' + row.ownerId + '/' + id + '.mp3';
      await mediaRequest('POST', storagePath, { bytes: row.bytes, mime: 'audio/mpeg' });
      try {
        const rows = await request('POST', 'video_studio_audio_assets?select=' + AUDIO_ASSET_COLUMNS, {
          prefer: 'return=representation',
          body: {
            id, tenant_id: row.tenantId, owner_type: 'user', owner_id: row.ownerId,
            project_id: row.projectId || null, kind: row.kind, storage_path: storagePath,
            mime: 'audio/mpeg', size_bytes: row.bytes.length, voice_id: row.voiceId || null,
            model_id: row.modelId || null, duration_seconds: row.durationSeconds ?? null,
            label: String(row.label || (row.kind === 'voiceover' ? 'AI voiceover' : 'Sound effect')).slice(0, 120)
          }
        });
        return mapAudioAsset(rows[0]);
      } catch (err) {
        await mediaRequest('DELETE', storagePath).catch(() => {});
        throw err;
      }
    },
    async listVideoStudioAudioAssets({ tenantId, ownerId, projectId = null }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(ownerId))) return [];
      const filter = projectId ? '&project_id=eq.' + encodeURIComponent(projectId) : '';
      const rows = await request('GET', 'video_studio_audio_assets?tenant_id=eq.' + tenantId +
        '&owner_type=eq.user&owner_id=eq.' + encodeURIComponent(ownerId) + filter +
        '&order=created_at.desc&limit=200&select=' + AUDIO_ASSET_COLUMNS);
      return (rows || []).map(mapAudioAsset);
    },
    async getVideoStudioAudioAsset({ tenantId, ownerId, id }) {
      if (!UUID.test(String(tenantId)) || !OWNER_ID.test(String(ownerId)) || !UUID.test(String(id))) return null;
      const rows = await request('GET', 'video_studio_audio_assets?id=eq.' + id +
        '&tenant_id=eq.' + tenantId + '&owner_type=eq.user&owner_id=eq.' + encodeURIComponent(ownerId) +
        '&limit=1&select=' + AUDIO_ASSET_COLUMNS);
      return rows?.[0] ? mapAudioAsset(rows[0]) : null;
    },
    async readVideoStudioAudioAsset({ tenantId, ownerId, id }) {
      const asset = await this.getVideoStudioAudioAsset({ tenantId, ownerId, id });
      if (!asset) return null;
      const bytes = await mediaRequest('GET', asset.storagePath);
      if (bytes.length !== asset.sizeBytes || bytes.length > 12 * 1024 * 1024) throw new UpstreamError('stored audio asset failed integrity checks');
      return { ...asset, bytes };
    },
    async deleteVideoStudioAudioAsset({ tenantId, ownerId, id }) {
      const asset = await this.getVideoStudioAudioAsset({ tenantId, ownerId, id });
      if (!asset) return false;
      await request('DELETE', 'video_studio_timeline_items?tenant_id=eq.' + tenantId +
        '&owner_id=eq.' + encodeURIComponent(ownerId) + '&audio_asset_id=eq.' + id, { prefer: 'return=minimal' }).catch(() => {});
      await mediaRequest('DELETE', asset.storagePath);
      const rows = await request('DELETE', 'video_studio_audio_assets?id=eq.' + id +
        '&tenant_id=eq.' + tenantId + '&owner_type=eq.user&owner_id=eq.' + encodeURIComponent(ownerId) + '&select=id',
        { prefer: 'return=representation' });
      return Array.isArray(rows) && rows.length > 0;
    },
    async addVideoStudioTimelineItem(row) {
      if (!UUID.test(String(row.tenantId)) || !UUID.test(String(row.projectId)) ||
          !UUID.test(String(row.audioAssetId)) || !OWNER_ID.test(String(row.ownerId))) throw new Error('invalid Video Studio timeline item');
      const rows = await request('POST', 'video_studio_timeline_items?select=*', {
        prefer: 'return=representation',
        body: { tenant_id: row.tenantId, owner_id: row.ownerId, project_id: row.projectId,
          audio_asset_id: row.audioAssetId, start_seconds: row.startSeconds, trim_start_seconds: row.trimStartSeconds || 0,
          trim_end_seconds: row.trimEndSeconds ?? null, gain: row.gain ?? 1, lane: row.lane ?? 1 }
      });
      return this.mapVideoStudioTimelineItem(rows[0]);
    },
    mapVideoStudioTimelineItem(r) {
      return { id: r.id, tenantId: r.tenant_id, ownerId: r.owner_id, projectId: r.project_id,
        audioAssetId: r.audio_asset_id, startSeconds: Number(r.start_seconds),
        trimStartSeconds: Number(r.trim_start_seconds), trimEndSeconds: r.trim_end_seconds == null ? null : Number(r.trim_end_seconds),
        gain: Number(r.gain), lane: r.lane, createdAt: r.created_at, updatedAt: r.updated_at };
    },
    async listVideoStudioTimelineItems({ tenantId, ownerId, projectId }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(projectId)) || !OWNER_ID.test(String(ownerId))) return [];
      const rows = await request('GET', 'video_studio_timeline_items?tenant_id=eq.' + tenantId +
        '&owner_id=eq.' + encodeURIComponent(ownerId) + '&project_id=eq.' + projectId +
        '&order=start_seconds.asc&select=*');
      return (rows || []).map((r) => this.mapVideoStudioTimelineItem(r));
    },
    async getVideoStudioTimelineItem({ tenantId, ownerId, projectId, id }) {
      if (![tenantId, projectId, id].every(v => UUID.test(String(v))) || !OWNER_ID.test(String(ownerId))) return null;
      const rows = await request('GET', 'video_studio_timeline_items?id=eq.' + id +
        '&tenant_id=eq.' + tenantId + '&owner_id=eq.' + encodeURIComponent(ownerId) +
        '&project_id=eq.' + projectId + '&limit=1&select=*');
      return rows?.[0] ? this.mapVideoStudioTimelineItem(rows[0]) : null;
    },
    async updateVideoStudioTimelineItem({ tenantId, ownerId, projectId, id, patch }) {
      const current = await this.getVideoStudioTimelineItem({ tenantId, ownerId, projectId, id });
      if (!current) return null;
      const body = { updated_at: new Date().toISOString() };
      const map = { startSeconds: 'start_seconds', trimStartSeconds: 'trim_start_seconds', trimEndSeconds: 'trim_end_seconds', gain: 'gain', lane: 'lane' };
      for (const [key, col] of Object.entries(map)) if (key in patch) body[col] = patch[key];
      const rows = await request('PATCH', 'video_studio_timeline_items?id=eq.' + id +
        '&tenant_id=eq.' + tenantId + '&owner_id=eq.' + encodeURIComponent(ownerId) +
        '&project_id=eq.' + projectId + '&select=*', { prefer: 'return=representation', body });
      return rows?.[0] ? this.mapVideoStudioTimelineItem(rows[0]) : null;
    },
    async deleteVideoStudioTimelineItem({ tenantId, ownerId, projectId, id }) {
      const rows = await request('DELETE', 'video_studio_timeline_items?id=eq.' + id +
        '&tenant_id=eq.' + tenantId + '&owner_id=eq.' + encodeURIComponent(ownerId) +
        '&project_id=eq.' + projectId + '&select=id', { prefer: 'return=representation' });
      return Array.isArray(rows) && rows.length > 0;
    },

    async addVideo(row) {
      assertOwner(row.ownerType, row.ownerId);
      const rows = await request('POST', 'generated_videos?select=id', {
        prefer: 'return=representation',
        body: {
          tenant_id: row.tenantId, conversation_id: row.conversationId || null,
          owner_type: row.ownerType, owner_id: row.ownerId, prompt: row.prompt,
          target_seconds: row.targetSeconds, produced_seconds: row.producedSeconds || 0, cache_key: row.cacheKey || null,
          status: row.status, provider: row.provider, provider_operation: row.providerOperation || null,
          provider_video_uri: row.providerVideoUri || null, mime: row.mime || null,
          bytes: row.bytes ? '\\x' + Buffer.from(row.bytes).toString('hex') : null,
          error_code: row.errorCode || null, error_message: row.errorMessage || null
        }
      });
      return rows[0].id;
    },

    async getVideo({ tenantId, ownerType, ownerId, id }) {
      if (!UUID.test(String(id))) return null;
      const rows = await request('GET', `generated_videos?id=eq.${id}&tenant_id=eq.${tenantId}&owner_type=eq.${ownerType}&owner_id=eq.${encodeURIComponent(ownerId)}&select=*&limit=1`);
      const r = rows && rows[0];
      if (!r) return null;
      return { id:r.id, tenantId:r.tenant_id, conversationId:r.conversation_id, ownerType:r.owner_type, ownerId:r.owner_id,
        prompt:r.prompt, targetSeconds:r.target_seconds, producedSeconds:r.produced_seconds, status:r.status, cacheKey:r.cache_key || null,
        provider:r.provider, providerOperation:r.provider_operation, providerVideoUri:r.provider_video_uri,
        mime:r.mime, bytes:r.bytes ? Buffer.from(String(r.bytes).replace(/^\\x/, ''), 'hex') : null,
        errorCode:r.error_code, errorMessage:r.error_message, createdAt:r.created_at, updatedAt:r.updated_at };
    },

    async updateVideo(id, patch) {
      if (!UUID.test(String(id))) return false;
      const body = {};
      const map = { tenantId:'tenant_id', conversationId:'conversation_id', targetSeconds:'target_seconds',
        producedSeconds:'produced_seconds', status:'status', cacheKey:'cache_key', providerOperation:'provider_operation',
        providerVideoUri:'provider_video_uri', mime:'mime', bytes:'bytes', errorCode:'error_code', errorMessage:'error_message' };
      for (const [k,col] of Object.entries(map)) if (k in patch) body[col] = k === 'bytes' && patch[k] ? '\\x' + Buffer.from(patch[k]).toString('hex') : patch[k];
      body.updated_at = new Date().toISOString();
      const rows = await request('PATCH', `generated_videos?id=eq.${id}`, { prefer:'return=representation', body });
      return Array.isArray(rows) && rows.length > 0;
    },

    // Estimated spend (USD) since a moment, across everything (migration 003).
    // Knowledge (migration 009). Only the server reads these tables.
    async listKnowledgeDocs(tenantId) {
      if (!UUID.test(String(tenantId))) return [];
      const rows = await request('GET', `knowledge_docs?tenant_id=eq.${tenantId}&order=updated_at.desc&select=id,title,source_url,who,chars,updated_at`);
      return (rows || []).map((r) => ({ id: r.id, tenantId, title: r.title, sourceUrl: r.source_url, who: r.who, chars: r.chars, updatedAt: r.updated_at }));
    },
    async addKnowledgeDoc({ tenantId, title, sourceUrl = null, who, chars, chunks }) {
      const rows = await request('POST', 'knowledge_docs?select=id', { prefer: 'return=representation', body: { tenant_id: tenantId, title, source_url: sourceUrl, who, chars } });
      const id = rows[0].id;
      try {
        await request('POST', 'knowledge_chunks', { prefer: 'return=minimal', body: chunks.map((text, idx) => ({ doc_id: id, tenant_id: tenantId, idx, text })) });
      } catch (err) {
        await request('DELETE', `knowledge_docs?id=eq.${id}`, { prefer: 'return=minimal' }).catch(() => {});
        throw err;
      }
      return id;
    },
    async deleteKnowledgeDoc(tenantId, id) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return false;
      const rows = await request('DELETE', `knowledge_docs?tenant_id=eq.${tenantId}&id=eq.${id}&select=id`, { prefer: 'return=representation' });
      return Array.isArray(rows) && rows.length > 0;
    },
    async searchKnowledge({ tenantId, terms, audience, limit = 4 }) {
      if (!UUID.test(String(tenantId)) || !terms.length) return [];
      const rows = await request('POST', 'rpc/search_knowledge', { body: { p_tenant: tenantId, p_terms: terms.join(' | '), p_audience: audience, p_limit: limit } });
      return (rows || []).map((r) => ({ docId: r.doc_id, title: r.title, sourceUrl: r.source_url, idx: r.idx, text: r.text, rank: Number(r.rank) || 0 }));
    },
    // Memories (migration 009).
    async listMemories({ tenantId, userId }) {
      if (!UUID.test(String(tenantId))) return [];
      assertOwner('user', userId);
      const rows = await request('GET', `user_memories?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=100&select=id,text,created_at`);
      return (rows || []).map((r) => ({ id: r.id, tenantId, userId, text: r.text, createdAt: r.created_at }));
    },
    async addMemory({ tenantId, userId, text }) {
      assertOwner('user', userId);
      const rows = await request('POST', 'user_memories?select=id', { prefer: 'return=representation', body: { tenant_id: tenantId, user_id: userId, text } });
      return rows[0].id;
    },
    async deleteMemory({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return false;
      assertOwner('user', userId);
      const rows = await request('DELETE', `user_memories?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=id`, { prefer: 'return=representation' });
      return Array.isArray(rows) && rows.length > 0;
    },
    async deleteAllMemories({ tenantId, userId }) {
      if (!UUID.test(String(tenantId))) return;
      assertOwner('user', userId);
      await request('DELETE', `user_memories?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}`, { prefer: 'return=minimal' });
    },


    // Storage (migration 014): what a signed-in person keeps, and their keep-time.
    async addSentFile({ tenantId, userId, conversationId = null, kind, name, mime, bytes }) {
      assertOwner('user', userId);
      if (conversationId !== null && !UUID.test(String(conversationId))) throw new Error('invalid conversation');
      const rows = await request('POST', 'sent_files?select=id', {
        prefer: 'return=representation',
        body: { tenant_id: tenantId, user_id: userId, conversation_id: conversationId, kind, name, mime, size: bytes.length, bytes: '\\x' + bytes.toString('hex') }
      });
      return rows[0].id;
    },
    async listSentFiles({ tenantId, userId }) {
      if (!UUID.test(String(tenantId))) return [];
      assertOwner('user', userId);
      const rows = await request('GET', `sent_files?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=500&select=id,conversation_id,kind,name,mime,size,created_at`);
      return (rows || []).map((r) => ({ id: r.id, conversationId: r.conversation_id, kind: r.kind, name: r.name, mime: r.mime, size: r.size, createdAt: r.created_at }));
    },
    async getSentFile({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return null;
      assertOwner('user', userId);
      const rows = await request('GET', `sent_files?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=id,kind,name,mime,size,created_at,bytes&limit=1`);
      const r = rows && rows[0];
      if (!r) return null;
      return { id: r.id, kind: r.kind, name: r.name, mime: r.mime, size: r.size, createdAt: r.created_at, bytes: Buffer.from(String(r.bytes).replace(/^\\x/, ''), 'hex') };
    },
    async deleteSentFile({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return false;
      assertOwner('user', userId);
      const rows = await request('DELETE', `sent_files?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=id`, { prefer: 'return=representation' });
      return Array.isArray(rows) && rows.length > 0;
    },
    async listImages({ tenantId, ownerType, ownerId, limit = 500 }) {
      if (!UUID.test(String(tenantId))) return [];
      assertOwner(ownerType, ownerId);
      const rows = await request('GET', `generated_images?tenant_id=eq.${tenantId}&owner_type=eq.${ownerType}&owner_id=eq.${encodeURIComponent(ownerId)}&order=created_at.desc&limit=${Math.min(500, limit)}&select=id,conversation_id,mime,created_at`);
      return (rows || []).map((r) => ({ id: r.id, conversationId: r.conversation_id, mime: r.mime, size: 0, createdAt: r.created_at }));
    },
    async deleteImage({ tenantId, ownerType, ownerId, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return false;
      assertOwner(ownerType, ownerId);
      const rows = await request('DELETE', `generated_images?tenant_id=eq.${tenantId}&owner_type=eq.${ownerType}&owner_id=eq.${encodeURIComponent(ownerId)}&id=eq.${id}&select=id`, { prefer: 'return=representation' });
      return Array.isArray(rows) && rows.length > 0;
    },
    // One person's chats, files, notes, replies, sent files and pictures older than `before`.
    async purgeUserBefore({ tenantId, userId, before, imagesOnly = false }) {
      assertOwner('user', userId);
      await request('POST', 'rpc/purge_user_data_before', { body: { p_tenant: tenantId, p_user: userId, p_before: before.toISOString(), p_images_only: imagesOnly === true } });
    },

    // Library (migration 012). Every query filters by tenant AND user.
    async listLibraryFiles({ tenantId, userId }) {
      if (!UUID.test(String(tenantId))) return [];
      assertOwner('user', userId);
      const rows = await request('GET', `library_files?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=500&select=id,title,kind,format,chars,created_at`);
      return (rows || []).map(mapLibraryFile);
    },
    async getLibraryFile({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return null;
      assertOwner('user', userId);
      const rows = await request('GET', `library_files?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=id,title,kind,format,chars,created_at&limit=1`);
      if (!rows || !rows[0]) return null;
      const chunks = await request('GET', `library_chunks?file_id=eq.${id}&tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&order=idx.asc&select=text&limit=1001`);
      return { ...mapLibraryFile(rows[0]), chunks: (chunks || []).map((c) => c.text) };
    },
    async addLibraryFile({ tenantId, userId, title, kind, format, chars, chunks }) {
      assertOwner('user', userId);
      const rows = await request('POST', 'library_files?select=id', { prefer: 'return=representation', body: { tenant_id: tenantId, user_id: userId, title, kind, format, chars } });
      const id = rows[0].id;
      try {
        await request('POST', 'library_chunks', { prefer: 'return=minimal', body: chunks.map((text, idx) => ({ file_id: id, tenant_id: tenantId, user_id: userId, idx, text })) });
      } catch (err) {
        await request('DELETE', `library_files?id=eq.${id}`, { prefer: 'return=minimal' }).catch(() => {});
        throw err;
      }
      return id;
    },
    async deleteLibraryFile({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return false;
      assertOwner('user', userId);
      const rows = await request('DELETE', `library_files?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=id`, { prefer: 'return=representation' });
      return Array.isArray(rows) && rows.length > 0;
    },
    async searchLibrary({ tenantId, userId, terms, limit = 4 }) {
      if (!UUID.test(String(tenantId)) || !terms.length) return [];
      assertOwner('user', userId);
      const rows = await request('POST', 'rpc/search_library', { body: { p_tenant: tenantId, p_user: userId, p_terms: terms.join(' | '), p_limit: limit } });
      return (rows || []).map((r) => ({ fileId: r.file_id, title: r.title, idx: r.idx, text: r.text, rank: Number(r.rank) || 0 }));
    },

    // Projects (migration 013). Every query filters by tenant AND user.
    async listProjects({ tenantId, userId }) {
      if (!UUID.test(String(tenantId))) return [];
      assertOwner('user', userId);
      const rows = await request('GET', `projects?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=200&select=${PROJECT_COLUMNS}`);
      return (rows || []).map(mapProject);
    },
    async getProject({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return null;
      assertOwner('user', userId);
      const rows = await request('GET', `projects?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=${PROJECT_COLUMNS}&limit=1`);
      return rows && rows[0] ? mapProject(rows[0]) : null;
    },
    async createProject({ tenantId, userId, name, description = '', instructions = '', status = 'active' }) {
      assertOwner('user', userId);
      const rows = await request('POST', `projects?select=${PROJECT_COLUMNS}`, { prefer: 'return=representation', body: { tenant_id: tenantId, user_id: userId, name, description, instructions, status } });
      return mapProject(rows[0]);
    },
    async updateProject({ tenantId, userId, id, patch }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return null;
      assertOwner('user', userId);
      const body = { updated_at: new Date().toISOString() };
      for (const k of ['name', 'description', 'instructions', 'status']) if (k in patch) body[k] = patch[k];
      const rows = await request('PATCH', `projects?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=${PROJECT_COLUMNS}`, { prefer: 'return=representation', body });
      return rows && rows[0] ? mapProject(rows[0]) : null;
    },
    async deleteProject({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return false;
      assertOwner('user', userId);
      const rows = await request('DELETE', `projects?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=id`, { prefer: 'return=representation' });
      return Array.isArray(rows) && rows.length > 0;
    },
    async listTasks({ tenantId, userId, projectId }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(projectId))) return [];
      assertOwner('user', userId);
      const rows = await request('GET', `project_tasks?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&project_id=eq.${projectId}&order=created_at.asc&limit=200&select=id,text,done,created_at`);
      return (rows || []).map((r) => ({ id: r.id, text: r.text, done: r.done, createdAt: r.created_at }));
    },
    async addTask({ tenantId, userId, projectId, text }) {
      assertOwner('user', userId);
      const rows = await request('POST', 'project_tasks?select=id,text,done,created_at', { prefer: 'return=representation', body: { project_id: projectId, tenant_id: tenantId, user_id: userId, text } });
      const r = rows[0];
      return { id: r.id, text: r.text, done: r.done, createdAt: r.created_at };
    },
    async updateTask({ tenantId, userId, projectId, id, patch }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(projectId)) || !UUID.test(String(id))) return null;
      assertOwner('user', userId);
      const body = {};
      for (const k of ['text', 'done']) if (k in patch) body[k] = patch[k];
      const rows = await request('PATCH', `project_tasks?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&project_id=eq.${projectId}&id=eq.${id}&select=id,text,done,created_at`, { prefer: 'return=representation', body });
      const r = rows && rows[0];
      return r ? { id: r.id, text: r.text, done: r.done, createdAt: r.created_at } : null;
    },
    async deleteTask({ tenantId, userId, projectId, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(projectId)) || !UUID.test(String(id))) return false;
      assertOwner('user', userId);
      const rows = await request('DELETE', `project_tasks?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&project_id=eq.${projectId}&id=eq.${id}&select=id`, { prefer: 'return=representation' });
      return Array.isArray(rows) && rows.length > 0;
    },
    // Links: kind 'chat' (conversation id) or 'file' (Library item id).
    async linkToProject({ tenantId, userId, projectId, kind, id }) {
      assertOwner('user', userId);
      const table = kind === 'chat' ? 'project_chats' : 'project_files';
      const col = kind === 'chat' ? 'conversation_id' : 'file_id';
      // Moving between projects: the old link goes first (no UPDATE right needed).
      await request('DELETE', `${table}?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&${col}=eq.${id}`, { prefer: 'return=minimal' });
      await request('POST', table, { prefer: 'return=minimal', body: { [col]: id, project_id: projectId, tenant_id: tenantId, user_id: userId } });
    },
    async unlinkFromProject({ tenantId, userId, kind, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return;
      assertOwner('user', userId);
      const table = kind === 'chat' ? 'project_chats' : 'project_files';
      const col = kind === 'chat' ? 'conversation_id' : 'file_id';
      await request('DELETE', `${table}?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&${col}=eq.${id}`, { prefer: 'return=minimal' });
    },
    // { [item id]: project id } for the person's linked chats or files.
    async projectLinks({ tenantId, userId, kind }) {
      if (!UUID.test(String(tenantId))) return {};
      assertOwner('user', userId);
      const table = kind === 'chat' ? 'project_chats' : 'project_files';
      const col = kind === 'chat' ? 'conversation_id' : 'file_id';
      const rows = await request('GET', `${table}?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&select=${col},project_id&limit=5000`);
      return Object.fromEntries((rows || []).map((r) => [r[col], r.project_id]));
    },
    async projectOf({ tenantId, userId, kind, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return null;
      assertOwner('user', userId);
      const table = kind === 'chat' ? 'project_chats' : 'project_files';
      const col = kind === 'chat' ? 'conversation_id' : 'file_id';
      const rows = await request('GET', `${table}?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&${col}=eq.${id}&select=project_id&limit=1`);
      return rows && rows[0] ? rows[0].project_id : null;
    },
    async searchLibraryIn({ tenantId, userId, projectId = null, terms, limit = 4 }) {
      if (!UUID.test(String(tenantId)) || !terms.length || (projectId !== null && !UUID.test(String(projectId)))) return [];
      assertOwner('user', userId);
      const rows = await request('POST', 'rpc/search_library_scoped', { body: { p_tenant: tenantId, p_user: userId, p_project: projectId, p_terms: terms.join(' | '), p_limit: limit } });
      return (rows || []).map((r) => ({ fileId: r.file_id, title: r.title, idx: r.idx, text: r.text, rank: Number(r.rank) || 0 }));
    },

    // Channels (migration 007). Only the server reads this table.
    async getChannel(kind, externalId) {
      if (!/^[a-z]{2,20}$/.test(kind) || !/^[0-9]{5,30}$/.test(String(externalId))) return null;
      const rows = await request('GET', `channels?kind=eq.${kind}&external_id=eq.${externalId}&select=tenant_id,kind,external_id,secret_enc,enabled,updated_at&limit=1`);
      return rows && rows[0] ? mapChannel(rows[0]) : null;
    },
    async listChannels(tenantId) {
      if (!UUID.test(String(tenantId))) return [];
      const rows = await request('GET', `channels?tenant_id=eq.${tenantId}&select=tenant_id,kind,external_id,secret_enc,enabled,updated_at`);
      return (rows || []).map(mapChannel);
    },
    // Insert, or update only when the row already belongs to this business
    // (a Page cannot be taken over by another business).
    async putChannel({ tenantId, kind, externalId, secretEnc, enabled }) {
      const old = await this.getChannel(kind, externalId);
      if (old && old.tenantId !== tenantId) throw Object.assign(new Error('channel belongs to another business'), { code: 'taken' });
      const cols = 'select=tenant_id,kind,external_id,secret_enc,enabled,updated_at';
      const rows = old
        ? await request('PATCH', `channels?kind=eq.${kind}&external_id=eq.${externalId}&tenant_id=eq.${tenantId}&${cols}`, { prefer: 'return=representation', body: { secret_enc: secretEnc, enabled, updated_at: new Date().toISOString() } })
        : await request('POST', `channels?${cols}`, { prefer: 'return=representation', body: { tenant_id: tenantId, kind, external_id: externalId, secret_enc: secretEnc, enabled } });
      return mapChannel(rows[0]);
    },
    async deleteChannel(tenantId, kind, externalId) {
      if (!UUID.test(String(tenantId)) || !/^[a-z]{2,20}$/.test(kind) || !/^[0-9]{5,30}$/.test(String(externalId))) return false;
      const rows = await request('DELETE', `channels?tenant_id=eq.${tenantId}&kind=eq.${kind}&external_id=eq.${externalId}&select=external_id`, { prefer: 'return=representation' });
      return Array.isArray(rows) && rows.length > 0;
    },

    // Connectors (migration 006). Only the server reads this table.
    async listConnectors(tenantId) {
      if (!UUID.test(String(tenantId))) return [];
      const rows = await request('GET', `connectors?tenant_id=eq.${tenantId}&order=name.asc&select=tenant_id,name,base_url,auth_type,auth_header,secret_enc,actions,enabled,updated_at,webhook_secret_enc,events_who,oauth`);
      return (rows || []).map(mapConnector);
    },
    async putConnector({ tenantId, name, baseUrl, authType, authHeader, secretEnc, actions, enabled, eventsWho = ['service'], oauth = null }) {
      const rows = await request('POST', 'connectors?on_conflict=tenant_id,name&select=tenant_id,name,base_url,auth_type,auth_header,secret_enc,actions,enabled,updated_at,webhook_secret_enc,events_who,oauth', {
        prefer: 'return=representation,resolution=merge-duplicates',
        body: { tenant_id: tenantId, name, base_url: baseUrl, auth_type: authType, auth_header: authHeader, secret_enc: secretEnc, actions, enabled, events_who: eventsWho, oauth, updated_at: new Date().toISOString() }
      });
      return mapConnector(rows[0]);
    },
    async setConnectorWebhook(tenantId, name, secretEnc) {
      if (!UUID.test(String(tenantId)) || !/^[a-z][a-z0-9_]{1,20}$/.test(name)) return false;
      const rows = await request('PATCH', `connectors?tenant_id=eq.${tenantId}&name=eq.${name}&select=name`, { prefer: 'return=representation', body: { webhook_secret_enc: secretEnc, updated_at: new Date().toISOString() } });
      return Array.isArray(rows) && rows.length > 0;
    },
    // Connector events (migration 008). Returns false for an event already stored.
    async addConnectorEvent({ tenantId, connector, eventId, type, key, data }) {
      const rows = await request('POST', 'connector_events?on_conflict=tenant_id,connector,event_id&select=id', {
        prefer: 'return=representation,resolution=ignore-duplicates',
        body: { tenant_id: tenantId, connector, event_id: eventId, type, key, data }
      });
      return Array.isArray(rows) && rows.length > 0;
    },
    async listConnectorEvents({ tenantId, connector, type = null, key = null, limit = 10 }) {
      if (!UUID.test(String(tenantId)) || !/^[a-z][a-z0-9_]{1,20}$/.test(connector)) return [];
      const q = [`tenant_id=eq.${tenantId}`, `connector=eq.${connector}`, ...(type ? ['type=eq.' + encodeURIComponent(type)] : []),
        ...(key ? ['key=eq.' + encodeURIComponent(key)] : []), 'order=created_at.desc', `limit=${Math.min(50, limit)}`, 'select=event_id,type,key,data,created_at'].join('&');
      const rows = await request('GET', 'connector_events?' + q);
      return (rows || []).map((r) => ({ eventId: r.event_id, type: r.type, key: r.key, data: r.data, createdAt: r.created_at }));
    },
    async purgeConnectorEvents(before) {
      await request('DELETE', 'connector_events?created_at=lt.' + encodeURIComponent(before.toISOString()), { prefer: 'return=minimal' });
    },
    async deleteConnector(tenantId, name) {
      if (!UUID.test(String(tenantId)) || !/^[a-z][a-z0-9_]{1,20}$/.test(name)) return false;
      const rows = await request('DELETE', `connectors?tenant_id=eq.${tenantId}&name=eq.${name}&select=name`, { prefer: 'return=representation' });
      return Array.isArray(rows) && rows.length > 0;
    },

    // Includes legacy image events and the shared image reservation ledger.
    async imageCostSince(since) {
      const n = Number(await request('POST', 'rpc/usage_image_cost_since', { body: { p_since: since.toISOString() } }));
      if (!Number.isFinite(n)) throw new UpstreamError('usage_image_cost_since returned an unexpected shape');
      return n;
    },

    async listVideoStudioProjects({ tenantId, userId }) {
      if (!UUID.test(String(tenantId))) return [];
      assertOwner('user', userId);
      const rows = await request('GET', `video_studio_projects?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=100&select=id,name,document,version,created_at,updated_at`);
      return (rows || []).map((r) => ({ id:r.id, name:r.name, document:r.document, version:r.version, createdAt:r.created_at, updatedAt:r.updated_at }));
    },

    async getVideoStudioProject({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return null;
      assertOwner('user', userId);
      const rows = await request('GET', `video_studio_projects?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=id,name,document,version,created_at,updated_at&limit=1`);
      const r = rows && rows[0];
      return r ? { id:r.id, name:r.name, document:r.document, version:r.version, createdAt:r.created_at, updatedAt:r.updated_at } : null;
    },

    async createVideoStudioProject({ tenantId, userId, name, document }) {
      if (!UUID.test(String(tenantId))) throw new Error('invalid Video Studio tenant');
      assertOwner('user', userId);
      const rows = await request('POST', 'video_studio_projects?select=id,name,document,version,created_at,updated_at', {
        prefer: 'return=representation',
        body: { tenant_id:tenantId, user_id:userId, name, document, version:1 }
      });
      const r = rows && rows[0];
      if (!r) throw new UpstreamError('Video Studio project insert returned no row');
      return { id:r.id, name:r.name, document:r.document, version:r.version, createdAt:r.created_at, updatedAt:r.updated_at };
    },

    async updateVideoStudioProject({ tenantId, userId, id, name, document, expectedVersion }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return null;
      assertOwner('user', userId);
      const filters = `tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}`;
      const versionFilter = Number.isInteger(expectedVersion) && expectedVersion > 0 ? `&version=eq.${expectedVersion}` : '';
      const rows = await request('PATCH', `video_studio_projects?${filters}${versionFilter}&select=id,name,document,version,created_at,updated_at`, {
        prefer: 'return=representation',
        body: { name, document, version: Number.isInteger(expectedVersion) && expectedVersion > 0 ? expectedVersion + 1 : undefined, updated_at:new Date().toISOString() }
      });
      const r = rows && rows[0];
      return r ? { id:r.id, name:r.name, document:r.document, version:r.version, createdAt:r.created_at, updatedAt:r.updated_at } : null;
    },

    async deleteVideoStudioProject({ tenantId, userId, id }) {
      if (!UUID.test(String(tenantId)) || !UUID.test(String(id))) return false;
      assertOwner('user', userId);
      const rows = await request('DELETE', `video_studio_projects?tenant_id=eq.${tenantId}&user_id=eq.${encodeURIComponent(userId)}&id=eq.${id}&select=id`, { prefer:'return=representation' });
      return Array.isArray(rows) && rows.length > 0;
    },

    async costSince(since) {
      const n = Number(await request('POST', 'rpc/usage_cost_since', { body: { p_since: since.toISOString() } }));
      if (!Number.isFinite(n)) throw new UpstreamError('usage_cost_since returned an unexpected shape');
      return n;
    }
  };
}
