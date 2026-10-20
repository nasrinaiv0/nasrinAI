import { randomUUID } from 'node:crypto';
import { PLATFORM_TENANT_ID } from '../tenants.js';
import { mapKey, mapTenant, mapConversation, mapMessage, mapConnector, mapChannel } from './shape.js';

// The same interface as the Supabase store, kept in memory. Used by tests and
// local development only; the server refuses it in production.
const projectOut = ({ tasks, at, tenantId, userId, ...p }) => p;
const nccContactOut = ({ at, tenantId, userId, tags, ...c }) => ({ ...c, tags: [...tags] });
const nccDealOut = ({ at, tenantId, userId, ...d }) => ({ ...d });
const nccOut = ({ at, tenantId, userId, ...x }) => ({ ...x });

export function createMemoryStore({ now = () => Date.now() } = {}) {
  const tenants = new Map();
  const providerCredentials = new Map();
  const keys = new Map();
  const counters = new Map();
  const usage = [];
  const reservations = new Map();
  const spendReservations = new Map();
  const realtimeVoiceReservations = new Map();
  const conversations = new Map();
  const messages = [];
  const planPeriods = [];
  const images = new Map();
  const videos = new Map();
  const videoStudioAudioAssets = new Map();
  const videoStudioTimelineItems = new Map();
  const marketingCache = new Map();
  const sentFiles = new Map();   // photos and files sent in chat (migration 014)
  const acceptances = [];
  const improvementConsentEvents = [];
  const improvementExamples = [];
  const improvementExampleDeletions = [];
  let improvementConsentSequence = 0;
  const connectors = new Map();   // tenantId:name -> row
  const channels = new Map();     // kind:externalId -> row
  const events = [];              // connector events
  const docs = new Map();         // knowledge documents (with their chunks)
  const memories = [];            // user memories
  const library = new Map();      // Library files (with their chunks)
  const projects = new Map();     // projects (with their tasks)
  const nccContacts = new Map();  // NCC contacts (migration 040)
  const nccDeals = new Map();     // NCC deals
  const nccTasks = new Map();     // NCC tasks
  const nccActivities = [];       // NCC timelines
  const nccAutomations = new Map(); // NCC automations
  const nccChannels = new Map();  // NCC Meta channels (sealed tokens)
  const nccOutbox = new Map();    // NCC posts and messages
  const links = { chat: new Map(), file: new Map() };   // item id -> { projectId, tenantId, userId }
  const researchScans = new Map();   // research agent: one person's scans (migration 036)
  const researchFacts = new Map();   // shared facts by fact_hash; no owner, no question
  const webAnswers = [];
  const githubConnections = new Map();   // permanent web answers (migration 037): no owner
  const iso = () => new Date(now()).toISOString();

  tenants.set(PLATFORM_TENANT_ID, { id: PLATFORM_TENANT_ID, kind: 'platform', status: 'active', daily_token_limit: 0 });

  return {
    kind: 'memory',
    usage,

    // test helpers
    planPeriods,
    addTenant(row) { tenants.set(row.id, { kind: 'business', status: 'active', daily_token_limit: 1_000_000, ...row }); },
    addApiKey(row) { keys.set(row.id, { scopes: ['chat'], allowed_origins: [], revoked_at: null, secret_hash: null, ...row }); },

    // Same rules as the database function add_plan_period: one row per payment
    // reference, and a new period starts when the current one of that plan ends.
    async addPlanPeriod({ tenantId, userId, plan, days, provider, ref = null, amount = null, currency = null }) {
      if (ref && planPeriods.some((p) => p.provider === provider && p.ref === ref)) return null;
      const t = now();
      const current = planPeriods.filter((p) => p.tenantId === tenantId && p.userId === userId && p.plan === plan && p.endsAt > t);
      const start = Math.max(t, ...current.map((p) => p.endsAt));
      const row = { id: randomUUID(), tenantId, userId, plan, provider, ref, amount, currency, startsAt: start, endsAt: start + days * 86400_000 };
      planPeriods.push(row);
      return row.id;
    },

    async activePlans({ tenantId, userId }) {
      const t = now();
      return planPeriods.filter((p) => p.tenantId === tenantId && p.userId === userId && p.endsAt > t && p.startsAt <= t)
        .map((p) => ({ plan: p.plan, endsAt: new Date(p.endsAt).toISOString() }));
    },

    async getApiKey(id) {
      const r = keys.get(id);
      return r ? mapKey(r) : null;
    },

    async getTenant(id) {
      const r = tenants.get(id);
      return r ? mapTenant(r) : null;
    },

    async rateHit(bucket, windowSeconds, limit) {
      const t = now();
      const start = Math.floor(t / 1000 / windowSeconds) * windowSeconds;
      const k = bucket + '@' + start;
      const used = (counters.get(k) || 0) + 1;
      counters.set(k, used);
      return { allowed: used <= limit, used, retryAfter: Math.max(1, Math.ceil(start + windowSeconds - t / 1000)) };
    },

    async tokensSince({ since, tenantId = null, actorType = null, actorId = null }) {
      const events = usage
        .filter((e) => !e.reservationId && e.at >= since.getTime()
          && (tenantId === null || e.tenantId === tenantId)
          && (actorType === null || e.actorType === actorType)
          && (actorId === null || e.actorId === actorId))
        .reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
      const reserved = [...reservations.values()]
        .filter((r) => r.createdAt >= since.getTime() && ['reserved', 'settled'].includes(r.status)
          && (tenantId === null || r.tenantId === tenantId)
          && (actorType === null || r.actorType === actorType)
          && (actorId === null || r.actorId === actorId))
        .reduce((sum, r) => sum + (r.status === 'reserved' ? r.reservedTokens : r.actualTokens), 0);
      return events + reserved;
    },

    async reserveDailyTokens({ reservationId, tenantId, actorType, actorId, reservedTokens, actorLimit, guestLimit, tenantLimit }) {
      if (!reservationId || reservations.has(reservationId) || !Number.isSafeInteger(reservedTokens) || reservedTokens < 1) {
        return { allowed: false, reason: 'invalid_reservation', reservationId: null, actorUsed: 0, tenantUsed: 0 };
      }
      const day = 24 * 60 * 60 * 1000;
      const offset = 8 * 60 * 60 * 1000;
      const dayStart = Math.floor((now() + offset) / day) * day - offset;
      const legacy = (filter) => usage.filter((e) => !e.reservationId && e.at >= dayStart && filter(e))
        .reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0);
      const held = (filter) => [...reservations.values()].filter((r) => r.dayStart === dayStart
        && ['reserved', 'settled'].includes(r.status) && filter(r))
        .reduce((sum, r) => sum + (r.status === 'reserved' ? r.reservedTokens : r.actualTokens), 0);
      const tenantUsed = legacy((e) => e.tenantId === tenantId) + held((r) => r.tenantId === tenantId);
      let actorUsed = 0;
      let limit = null;
      if (actorType === 'user') {
        limit = actorLimit;
        const weekStart = dayStart - ((new Date(now() + offset).getUTCDay() + 6) % 7) * day;
        actorUsed = usage.filter((e) => !e.reservationId && e.at >= weekStart && e.tenantId === tenantId && e.actorType === 'user' && e.actorId === actorId)
          .reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0)
          + [...reservations.values()].filter((r) => r.dayStart >= weekStart && ['reserved', 'settled'].includes(r.status) && r.tenantId === tenantId && r.actorType === 'user' && r.actorId === actorId)
            .reduce((sum, r) => sum + (r.status === 'reserved' ? r.reservedTokens : r.actualTokens), 0);
      } else if (actorType === 'guest' && tenantId === PLATFORM_TENANT_ID) {
        limit = guestLimit;
        actorUsed = legacy((e) => e.tenantId === tenantId && e.actorType === 'guest')
          + held((r) => r.tenantId === tenantId && r.actorType === 'guest');
      }
      if (limit !== null && limit > 0 && actorUsed + reservedTokens > limit) {
        return { allowed: false, reason: actorType === 'guest' ? 'guest_limit' : 'weekly_limit', reservationId: null, actorUsed, tenantUsed };
      }
      if (tenantLimit > 0 && tenantUsed + reservedTokens > tenantLimit) {
        return { allowed: false, reason: 'tenant_limit', reservationId: null, actorUsed, tenantUsed };
      }
      reservations.set(reservationId, { reservationId, tenantId, actorType, actorId, reservedTokens, actualTokens: null,
        status: 'reserved', dayStart, createdAt: now() });
      return { allowed: true, reason: null, reservationId, actorUsed, tenantUsed };
    },

    async settleDailyTokenReservation({ reservationId, actualTokens }) {
      const r = reservations.get(reservationId);
      if (!r) return false;
      if (r.status === 'settled') return true;
      if (r.status !== 'reserved' || !Number.isSafeInteger(actualTokens) || actualTokens < 0) return false;
      r.status = 'settled';
      r.actualTokens = actualTokens;
      r.settledAt = now();
      return true;
    },

    async releaseDailyTokenReservation({ reservationId }) {
      const r = reservations.get(reservationId);
      if (!r) return false;
      if (r.status === 'released') return true;
      if (r.status !== 'reserved') return false;
      r.status = 'released';
      r.settledAt = now();
      return true;
    },

    async createConversation({ tenantId, ownerType, ownerId, title = '', expiresAt = null }) {
      const row = { id: randomUUID(), tenant_id: tenantId, owner_type: ownerType, owner_id: ownerId, title,
        created_at: iso(), updated_at: iso(), expires_at: expiresAt };
      conversations.set(row.id, row);
      return mapConversation(row);
    },

    async getConversation(id) {
      const r = conversations.get(id);
      return r ? mapConversation(r) : null;
    },

    async listConversations({ tenantId, ownerType, ownerId, limit = 20 }) {
      return [...conversations.values()]
        .filter((c) => c.tenant_id === tenantId && c.owner_type === ownerType && c.owner_id === ownerId)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, limit)
        .map(mapConversation);
    },

    async setConversationTitle(id, title) {
      const r = conversations.get(id);
      if (r) r.title = title;
    },

    async deleteConversation(id) {
      conversations.delete(id);
      links.chat.delete(id);
      for (const [fid, f] of sentFiles) if (f.conversationId === id) sentFiles.delete(fid);
      for (const [iid, im] of images) if (im.conversationId === id) images.delete(iid);
      for (let i = messages.length - 1; i >= 0; i--) if (messages[i].conversation_id === id) messages.splice(i, 1);
    },

    async addMessage({ conversationId, tenantId, role, content }) {
      const c = conversations.get(conversationId);
      if (!c || c.tenant_id !== tenantId) throw new Error('foreign key violation');
      const row = { id: randomUUID(), conversation_id: conversationId, tenant_id: tenantId, role, content, created_at: iso(), seq: messages.length };
      messages.push(row);
      c.updated_at = row.created_at;
      return mapMessage(row);
    },

    async listMessages(conversationId, limit = 50) {
      return messages.filter((m) => m.conversation_id === conversationId).slice(-limit).map(mapMessage);
    },

    async deleteMessage(conversationId, id) {
      const i = messages.findIndex((m) => m.id === id && m.conversation_id === conversationId);
      if (i >= 0) messages.splice(i, 1);
    },

    async getMessage(id) {
      const r = messages.find((m) => m.id === id);
      return r ? { ...mapMessage(r), conversationId: r.conversation_id } : null;
    },

    async purgeExpired() {
      for (const c of [...conversations.values()]) {
        if (c.expires_at && Date.parse(c.expires_at) < now()) await this.deleteConversation(c.id);
      }
    },

    async recordUsage(e) {
      usage.push({ ...e, at: now() });
    },

    async reserveDailyRealtimeVoice({ reservationId, tenantId, actorType, actorId, reservedSeconds, dailyLimitSeconds }) {
      if (!reservationId || realtimeVoiceReservations.has(reservationId) || !tenantId
          || !['user', 'guest', 'service'].includes(actorType)
          || typeof actorId !== 'string' || !actorId || actorId.length > 80
          || !Number.isInteger(reservedSeconds) || reservedSeconds < 1
          || !Number.isInteger(dailyLimitSeconds) || dailyLimitSeconds < 1) {
        return { allowed: false, reason: 'invalid_reservation', reservationId: null, usedSeconds: 0 };
      }
      const t = now();
      const day = 86400_000;
      const offset = 8 * 3600_000;
      const dayStart = Math.floor((t + offset) / day) * day - offset;
      for (const row of realtimeVoiceReservations.values()) {
        if (row.status === 'reserved' && row.createdAt < t - 15 * 60_000) {
          row.status = 'consumed';
          row.settledAt = t;
        }
      }
      const usedSeconds = [...realtimeVoiceReservations.values()]
        .filter((row) => row.tenantId === tenantId && row.actorType === actorType && row.actorId === actorId
          && row.dayStart === dayStart && ['reserved', 'consumed'].includes(row.status))
        .reduce((sum, row) => sum + row.reservedSeconds, 0);
      const allowedSeconds = Math.min(reservedSeconds, dailyLimitSeconds - usedSeconds);
      if (allowedSeconds < 1) {
        return { allowed: false, reason: 'daily_voice_limit', reservationId: null, usedSeconds, reservedSeconds: 0 };
      }
      realtimeVoiceReservations.set(reservationId, {
        reservationId, tenantId, actorType, actorId, reservedSeconds: allowedSeconds, dayStart, createdAt: t, status: 'reserved', settledAt: null
      });
      return { allowed: true, reason: null, reservationId, usedSeconds, reservedSeconds: allowedSeconds };
    },

    async settleDailyRealtimeVoiceReservation({ reservationId }) {
      const row = realtimeVoiceReservations.get(reservationId);
      if (!row) return false;
      if (row.status === 'consumed') return true;
      if (row.status !== 'reserved') return false;
      row.status = 'consumed';
      row.settledAt = now();
      return true;
    },

    async releaseDailyRealtimeVoiceReservation({ reservationId }) {
      const row = realtimeVoiceReservations.get(reservationId);
      if (!row) return false;
      if (row.status === 'released') return true;
      if (row.status !== 'reserved') return false;
      row.status = 'released';
      row.settledAt = now();
      return true;
    },

    async reserveGlobalSpend({ reservationId, kind, tenantId, actorType, actorId, reservedUsd, dailyLimit, weeklyLimit, monthlyLimit, maxRequestUsd = null }) {
      if (!reservationId || spendReservations.has(reservationId)
          || !['reasoning', 'image'].includes(kind)
          || !tenantId || !['user', 'guest', 'service'].includes(actorType)
          || typeof actorId !== 'string' || !actorId || actorId.length > 80
          || !Number.isFinite(reservedUsd) || reservedUsd < 0.000001
          || [dailyLimit, weeklyLimit, monthlyLimit, maxRequestUsd].some((v) => v !== null && v !== undefined && (!Number.isFinite(v) || v < 0))) {
        return { allowed: false, reason: 'invalid_reservation', reservationId: null };
      }
      if (maxRequestUsd !== null && maxRequestUsd !== undefined && reservedUsd > maxRequestUsd) {
        return { allowed: false, reason: 'request_limit', reservationId: null };
      }
      const t = now();
      for (const row of spendReservations.values()) {
        if (row.kind === kind && row.status === 'reserved' && row.createdAt < t - 15 * 60_000) {
          row.actualUsd = row.reservedUsd;
          row.status = 'settled';
          row.settledAt = t;
        }
      }
      const day = 86400_000;
      const offset = 8 * 3600_000;
      const dayStart = Math.floor((t + offset) / day) * day - offset;
      const periods = [
        ['daily_budget', dailyLimit, dayStart],
        ['weekly_budget', weeklyLimit, t - 7 * day],
        ['monthly_budget', monthlyLimit, t - 30 * day]
      ];
      const usedSince = (since) => {
        const legacy = usage.filter((e) => e.at >= since && e.spendReservationId == null
          && (kind === 'image' ? e.task === 'image' : e.task !== 'image'))
          .reduce((sum, e) => sum + (Number(e.costUsd) || 0), 0);
        const held = [...spendReservations.values()].filter((r) => r.kind === kind && r.createdAt >= since && ['reserved', 'settled'].includes(r.status))
          .reduce((sum, r) => sum + (r.status === 'reserved' ? r.reservedUsd : r.actualUsd), 0);
        return legacy + held;
      };
      const used = periods.map(([, , since]) => usedSince(since));
      for (let i = 0; i < periods.length; i++) {
        const [reason, limit] = periods[i];
        if (limit !== null && limit !== undefined && used[i] + reservedUsd > limit) {
          return { allowed: false, reason, reservationId: null, dailyUsed: used[0], weeklyUsed: used[1], monthlyUsed: used[2] };
        }
      }
      spendReservations.set(reservationId, { id: reservationId, kind, tenantId, actorType, actorId, reservedUsd,
        actualUsd: null, status: 'reserved', createdAt: t, settledAt: null });
      return { allowed: true, reason: null, reservationId, dailyUsed: used[0], weeklyUsed: used[1], monthlyUsed: used[2] };
    },

    async settleGlobalSpendReservation({ reservationId, actualUsd }) {
      const row = spendReservations.get(reservationId);
      if (!row || !Number.isFinite(actualUsd) || actualUsd < 0 || actualUsd > 100000) return false;
      if (row.status === 'settled') return row.actualUsd === Math.round(actualUsd * 1e6) / 1e6;
      if (row.status !== 'reserved') return false;
      row.actualUsd = Math.round(actualUsd * 1e6) / 1e6;
      row.status = 'settled';
      row.settledAt = now();
      return true;
    },

    async releaseGlobalSpendReservation({ reservationId }) {
      const row = spendReservations.get(reservationId);
      if (!row) return false;
      if (row.status === 'released') return true;
      if (row.status !== 'reserved') return false;
      row.status = 'released';
      row.settledAt = now();
      return true;
    },

    improvementConsentEvents,
    improvementExamples,
    improvementExampleDeletions,
    async deleteImprovementExamplesForSubject({ tenantId, subjectType, subjectId, reasonCode }) {
      if (!['user', 'guest'].includes(subjectType) || typeof subjectId !== 'string' || !subjectId || subjectId.length > 80 ||
          !['consent_withdrawal', 'account_deletion', 'privacy_request'].includes(reasonCode)) {
        throw new Error('invalid improvement-example deletion request');
      }
      const matches = improvementExamples.filter((e) => e.tenantId === tenantId && e.subjectType === subjectType && e.subjectId === subjectId);
      const ids = matches.map((e) => e.id);
      for (let i = improvementExamples.length - 1; i >= 0; i--) {
        const e = improvementExamples[i];
        if (e.tenantId === tenantId && e.subjectType === subjectType && e.subjectId === subjectId) improvementExamples.splice(i, 1);
      }
      improvementExampleDeletions.push({ request_id: randomUUID(), tenant_id: tenantId, reason_code: reasonCode, deleted_example_ids: ids, deleted_count: ids.length, created_at: iso() });
      return ids.length;
    },
    async purgeImprovementExamples() {
      const cutoffGuest = now() - 24 * 60 * 60 * 1000;
      for (let i = improvementExamples.length - 1; i >= 0; i--) {
        const e = improvementExamples[i];
        const latest = improvementConsentEvents.filter((c) => c.tenantId === e.tenantId && c.subjectType === e.subjectType && c.subjectId === e.subjectId).sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at) || (y.sequence ?? 0) - (x.sequence ?? 0))[0];
        if (Date.parse(e.expiresAt) <= now() || (e.subjectType === 'guest' && Date.parse(e.createdAt) < cutoffGuest) || !latest || latest.decision !== 'granted' || latest.version !== e.consentVersion || e.consentVersion === '2026-10-10-preference-only') improvementExamples.splice(i, 1);
      }
    },
    async purgeImprovementConsent() {
      const cutoffGuest = now() - 24 * 60 * 60 * 1000;
      const cutoffUser = now() - 10 * 365.25 * 24 * 60 * 60 * 1000;
      for (let i = improvementConsentEvents.length - 1; i >= 0; i--) {
        const e = improvementConsentEvents[i];
        const cutoff = e.subjectType === 'guest' ? cutoffGuest : cutoffUser;
        if (Date.parse(e.created_at) < cutoff) improvementConsentEvents.splice(i, 1);
      }
    },
    async getImprovementConsent({ tenantId, subjectType, subjectId }) {
      if (!['user', 'guest'].includes(subjectType) || typeof subjectId !== 'string' || !subjectId || subjectId.length > 80) return null;
      const row = improvementConsentEvents
        .filter((e) => e.tenantId === tenantId && e.subjectType === subjectType && e.subjectId === subjectId)
        .sort((a, b) => b.sequence - a.sequence)[0];
      return row ? { version: row.version, decision: row.decision, createdAt: row.created_at } : null;
    },
    async recordImprovementConsent({ tenantId, subjectType, subjectId, version, decision }) {
      if (!['user', 'guest'].includes(subjectType) || typeof subjectId !== 'string' || !subjectId || subjectId.length > 80 ||
          !/^[A-Za-z0-9._-]{1,40}$/.test(String(version)) || !['granted', 'declined', 'withdrawn'].includes(decision)) {
        throw new Error('invalid improvement consent event');
      }
      improvementConsentEvents.push({ tenantId, subjectType, subjectId, version, decision, created_at: iso(), sequence: ++improvementConsentSequence });
    },
    acceptances,
    async recordAcceptance(r) { acceptances.push({ ...r, created_at: new Date(now()).toISOString() }); },
    async hasAccepted({ tenantId, userId, document, version }) {
      return acceptances.some((a) => a.tenantId === tenantId && a.userId === userId && a.document === document && a.version === version);
    },
    async listAcceptances({ tenantId, userId }) {
      return acceptances.filter((a) => a.tenantId === tenantId && a.userId === userId)
        .map((a) => ({ document: a.document, version: a.version, action: a.action, method: a.method, created_at: a.created_at }));
    },
    async listPlanPeriods({ tenantId, userId }) {
      return planPeriods.filter((p) => p.tenantId === tenantId && p.userId === userId)
        .map((p) => ({ id: p.id, plan: p.plan, starts_at: new Date(p.startsAt).toISOString(), ends_at: new Date(p.endsAt).toISOString(), provider: p.provider, provider_ref: p.ref, amount: p.amount, currency: p.currency, created_at: new Date(p.startsAt).toISOString() }));
    },
    async deleteConversationsOf({ tenantId, ownerType, ownerId }) {
      for (const [id, c] of conversations) {
        if (c.tenant_id === tenantId && c.owner_type === ownerType && c.owner_id === ownerId) {
          conversations.delete(id);
          links.chat.delete(id);
          for (let i = messages.length - 1; i >= 0; i--) if (messages[i].conversation_id === id) messages.splice(i, 1);
        }
      }
    },
    async deleteUserData({ tenantId, userId }) {
      await this.deleteConversationsOf({ tenantId, ownerType: 'user', ownerId: userId });
      await this.deleteAllMemories({ tenantId, userId });
      for (const [id, f] of library) if (f.tenantId === tenantId && f.userId === userId) library.delete(id);
      for (const [id, f] of sentFiles) if (f.tenantId === tenantId && f.userId === userId) sentFiles.delete(id);
      await this.deleteResearchScansOf({ tenantId, ownerType: 'user', ownerId: userId });
      await this.deleteGithubConnection({ tenantId, userId });
      for (const [id, p] of projects) if (p.tenantId === tenantId && p.userId === userId) await this.deleteProject({ tenantId, userId, id });
      await this.deleteNccData({ tenantId, userId });
      for (const m of Object.values(links)) for (const [k, l] of m) if (l.tenantId === tenantId && l.userId === userId) m.delete(k);
      for (const e of usage) if (e.tenantId === tenantId && e.actorType === 'user' && e.actorId === userId) e.actorId = 'deleted-user';
    },

    // Research agent (migration 036).
    async addResearchScan({ tenantId, ownerType, ownerId, query, sources, facts, expiresAt }) {
      const row = { id: randomUUID(), tenantId, ownerType, ownerId, query, sources, facts, createdAt: iso(), expiresAt: expiresAt.toISOString() };
      researchScans.set(row.id, row);
      return { id: row.id, createdAt: row.createdAt, expiresAt: row.expiresAt };
    },
    async getResearchScan({ tenantId, ownerType, ownerId, id }) {
      const r = researchScans.get(id);
      if (!r || r.tenantId !== tenantId || r.ownerType !== ownerType || r.ownerId !== ownerId || Date.parse(r.expiresAt) <= now()) return null;
      return { id: r.id, query: r.query, sources: r.sources, facts: r.facts, createdAt: r.createdAt, expiresAt: r.expiresAt };
    },
    async listResearchScans({ tenantId, ownerType, ownerId, limit = 50 }) {
      return [...researchScans.values()]
        .filter((r) => r.tenantId === tenantId && r.ownerType === ownerType && r.ownerId === ownerId && Date.parse(r.expiresAt) > now())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit)
        .map((r) => ({ id: r.id, query: r.query, sources: r.sources, facts: r.facts, createdAt: r.createdAt, expiresAt: r.expiresAt }));
    },
    async deleteResearchScansOf({ tenantId, ownerType, ownerId }) {
      for (const [id, r] of researchScans) if (r.tenantId === tenantId && r.ownerType === ownerType && r.ownerId === ownerId) researchScans.delete(id);
    },
    async addResearchFacts(rows) {
      let added = 0;
      for (const f of rows) {
        if (researchFacts.has(f.factHash)) continue;
        researchFacts.set(f.factHash, { id: randomUUID(), fact: f.fact, sourceUrl: f.sourceUrl, sourceTitle: f.sourceTitle || '', factHash: f.factHash, status: 'pending', createdAt: iso() });
        added += 1;
      }
      return added;
    },
    async listResearchFacts({ status = 'pending', limit = 100 } = {}) {
      return [...researchFacts.values()].filter((f) => f.status === status).slice(0, limit).map(({ factHash, ...f }) => f);
    },
    async purgeResearch() {
      for (const [id, r] of researchScans) if (Date.parse(r.expiresAt) <= now()) researchScans.delete(id);
    },
    async addWebAnswer({ question, answer, sources }) {
      webAnswers.push({ id: randomUUID(), question, answer, sources, createdAt: iso() });
    },
    listWebAnswers() { return webAnswers.map((a) => ({ ...a })); },

    // GitHub connections (migrations 038, 039): up to 10 accounts, one main.
    async listGithubConnections({ tenantId, userId }) {
      return [...githubConnections.values()].filter((r) => r.tenantId === tenantId && r.userId === userId)
        .sort((x, y) => (y.isMain - x.isMain) || x.createdAt.localeCompare(y.createdAt)).map((r) => ({ ...r }));
    },
    async getGithubConnection({ tenantId, userId, login = null }) {
      const all = await this.listGithubConnections({ tenantId, userId });
      return (login ? all.find((r) => r.login === login) : all.find((r) => r.isMain) || all[0]) || null;
    },
    async saveGithubConnection(row) {
      const key = `${row.tenantId}:${row.userId}:${row.login}`;
      const old = githubConnections.get(key);
      if (!old && (await this.listGithubConnections(row)).length >= 10) throw new Error('github_accounts_limit');
      if (row.isMain && (await this.listGithubConnections(row)).some((r) => r.isMain && r.login !== row.login)) throw new Error('two main accounts');
      githubConnections.set(key, { ...row, isMain: row.isMain === true, createdAt: old?.createdAt || iso(), updatedAt: iso() });
    },
    async setGithubMain({ tenantId, userId, login }) {
      for (const r of githubConnections.values()) if (r.tenantId === tenantId && r.userId === userId) r.isMain = r.login === login;
    },
    async deleteGithubConnection({ tenantId, userId, login = null }) {
      for (const [k, r] of githubConnections) if (r.tenantId === tenantId && r.userId === userId && (!login || r.login === login)) githubConnections.delete(k);
    },

    async purgeImagesBefore(before) {
      for (const [id, r] of images) if (r.ownerType === 'service' && Date.parse(r.createdAt) < before.getTime()) images.delete(id);
    },

    async getMarketingCache({ tenantId, ownerType, ownerId, kind, key }) {
      const cacheKey = [tenantId, ownerType, ownerId, kind, key].join(':');
      const row = marketingCache.get(cacheKey);
      if (!row || Date.parse(row.expiresAt) <= now()) { marketingCache.delete(cacheKey); return null; }
      return JSON.parse(JSON.stringify(row.value));
    },
    async setMarketingCache({ tenantId, ownerType, ownerId, kind, key, value, ttlMs = 7 * 86400_000 }) {
      if (JSON.stringify(value).length > 100_000) return false;
      for (const [k, row] of marketingCache) if (Date.parse(row.expiresAt) <= now()) marketingCache.delete(k);
      const cacheKey = [tenantId, ownerType, ownerId, kind, key].join(':');
      marketingCache.set(cacheKey, { value: JSON.parse(JSON.stringify(value)), expiresAt: new Date(now() + ttlMs).toISOString() });
      return true;
    },

    async addImage(row) {
      const id = randomUUID();
      images.set(id, { ...row, id, createdAt: iso() });
      return id;
    },

    async saveProviderCredential(row) {
      if (!row || !row.tenantId || !row.ownerId || row.provider !== 'elevenlabs') throw new Error('invalid provider credential owner');
      providerCredentials.set(row.tenantId + ':' + row.ownerId + ':' + row.provider, { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag });
      return true;
    },
    async getProviderCredential({ tenantId, ownerId, provider }) { return providerCredentials.get(tenantId + ':' + ownerId + ':' + provider) || null; },
    async deleteProviderCredential({ tenantId, ownerId, provider }) { return providerCredentials.delete(tenantId + ':' + ownerId + ':' + provider); },
    async createVideoStudioAudioAsset(row) {
      if (!Buffer.isBuffer(row.bytes) || row.bytes.length < 1 || row.bytes.length > 12 * 1024 * 1024 ||
          row.ownerType !== 'user' || !['voiceover', 'sound_effect'].includes(row.kind)) throw new Error('invalid Video Studio audio asset');
      const id = randomUUID();
      const asset = { id, tenantId: row.tenantId, ownerType: 'user', ownerId: row.ownerId,
        projectId: row.projectId || null, kind: row.kind, mime: 'audio/mpeg', sizeBytes: row.bytes.length,
        bytes: Buffer.from(row.bytes), voiceId: row.voiceId || null, modelId: row.modelId || null,
        durationSeconds: row.durationSeconds ?? null, label: String(row.label || (row.kind === 'voiceover' ? 'AI voiceover' : 'Sound effect')).slice(0, 120),
        createdAt: iso(), updatedAt: iso() };
      videoStudioAudioAssets.set(id, asset);
      return this.publicVideoStudioAudioAsset(asset);
    },
    publicVideoStudioAudioAsset(row) {
      const { bytes, ...publicRow } = row;
      return { ...publicRow };
    },
    async listVideoStudioAudioAssets({ tenantId, ownerId, projectId = null }) {
      return [...videoStudioAudioAssets.values()]
        .filter(a => a.tenantId === tenantId && a.ownerId === ownerId && (!projectId || a.projectId === projectId))
        .sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(a => this.publicVideoStudioAudioAsset(a));
    },
    async getVideoStudioAudioAsset({ tenantId, ownerId, id }) {
      const a = videoStudioAudioAssets.get(id);
      return a && a.tenantId === tenantId && a.ownerId === ownerId ? this.publicVideoStudioAudioAsset(a) : null;
    },
    async readVideoStudioAudioAsset({ tenantId, ownerId, id }) {
      const a = videoStudioAudioAssets.get(id);
      return a && a.tenantId === tenantId && a.ownerId === ownerId
        ? { ...this.publicVideoStudioAudioAsset(a), bytes: Buffer.from(a.bytes) } : null;
    },
    async deleteVideoStudioAudioAsset({ tenantId, ownerId, id }) {
      const a = videoStudioAudioAssets.get(id);
      if (!a || a.tenantId !== tenantId || a.ownerId !== ownerId) return false;
      for (const [key, item] of videoStudioTimelineItems) if (item.audioAssetId === id) videoStudioTimelineItems.delete(key);
      return videoStudioAudioAssets.delete(id);
    },
    async addVideoStudioTimelineItem(row) {
      const asset = videoStudioAudioAssets.get(row.audioAssetId);
      const project = projects.get(row.projectId);
      if (!asset || asset.tenantId !== row.tenantId || asset.ownerId !== row.ownerId ||
          !project || project.tenantId !== row.tenantId || project.userId !== row.ownerId) throw new Error('Video Studio asset or project not owned');
      if ([...videoStudioTimelineItems.values()].some(i => i.projectId === row.projectId && i.audioAssetId === row.audioAssetId)) {
        throw new Error('audio asset already on this timeline');
      }
      const item = { id: randomUUID(), tenantId: row.tenantId, ownerId: row.ownerId, projectId: row.projectId,
        audioAssetId: row.audioAssetId, startSeconds: row.startSeconds, trimStartSeconds: row.trimStartSeconds || 0,
        trimEndSeconds: row.trimEndSeconds ?? null, gain: row.gain ?? 1, lane: row.lane ?? 1, createdAt: iso(), updatedAt: iso() };
      videoStudioTimelineItems.set(item.id, item);
      return { ...item };
    },
    mapVideoStudioTimelineItem(row) { return { ...row }; },
    async listVideoStudioTimelineItems({ tenantId, ownerId, projectId }) {
      return [...videoStudioTimelineItems.values()].filter(i => i.tenantId === tenantId && i.ownerId === ownerId && i.projectId === projectId)
        .sort((a,b) => a.startSeconds - b.startSeconds).map(i => ({ ...i }));
    },
    async getVideoStudioTimelineItem({ tenantId, ownerId, projectId, id }) {
      const i = videoStudioTimelineItems.get(id);
      return i && i.tenantId === tenantId && i.ownerId === ownerId && i.projectId === projectId ? { ...i } : null;
    },
    async updateVideoStudioTimelineItem({ tenantId, ownerId, projectId, id, patch }) {
      const i = videoStudioTimelineItems.get(id);
      if (!i || i.tenantId !== tenantId || i.ownerId !== ownerId || i.projectId !== projectId) return null;
      for (const k of ['startSeconds','trimStartSeconds','trimEndSeconds','gain','lane']) if (k in patch) i[k] = patch[k];
      i.updatedAt = iso();
      return { ...i };
    },
    async deleteVideoStudioTimelineItem({ tenantId, ownerId, projectId, id }) {
      const i = videoStudioTimelineItems.get(id);
      if (!i || i.tenantId !== tenantId || i.ownerId !== ownerId || i.projectId !== projectId) return false;
      return videoStudioTimelineItems.delete(id);
    },

    async addVideo(row) {
      const id = randomUUID();
      videos.set(id, { ...row, id, createdAt: iso(), updatedAt: iso() });
      return id;
    },

    async getVideo({ tenantId, ownerType, ownerId, id }) {
      const r = videos.get(id);
      if (!r || r.tenantId !== tenantId || r.ownerType !== ownerType || r.ownerId !== ownerId) return null;
      return { ...r };
    },

    async updateVideo(id, patch) {
      const r = videos.get(id);
      if (!r) return false;
      Object.assign(r, patch, { updatedAt: iso() });
      return true;
    },

    async getImage(id) {
      const r = images.get(id);
      if (!r) return null;
      // Gone with its conversation, like the database's cascade.
      if (!conversations.has(r.conversationId)) { images.delete(id); return null; }
      return r;
    },

    // Pictures actually made (usage records), for allowances. actorId null: all
    // actors of that type in the tenant.
    async imagesMadeSince({ since, tenantId, actorType, actorId = null, limit = 1000 }) {
      return Math.min(limit, usage.filter((e) => e.at >= since.getTime() && e.task === 'image' && e.outcome === 'ok' &&
        e.tenantId === tenantId && e.actorType === actorType && (actorId === null || e.actorId === actorId)).length);
    },

    async imageCostSince(since) {
      const t = since.getTime();
      const legacy = usage.filter((e) => e.at >= t && e.task === 'image' && e.spendReservationId == null)
        .reduce((sum, e) => sum + (Number(e.costUsd) || 0), 0);
      const held = [...spendReservations.values()].filter((r) => r.kind === 'image' && r.createdAt >= t && ['reserved', 'settled'].includes(r.status))
        .reduce((sum, r) => sum + (r.status === 'reserved' ? r.reservedUsd : r.actualUsd), 0);
      return legacy + held;
    },

    // Knowledge (migration 009). Search: chunks sharing the most words.
    async listKnowledgeDocs(tenantId) {
      return [...docs.values()].filter((d) => d.tenantId === tenantId).map(({ chunks, ...d }) => ({ ...d, chunks: chunks.length }));
    },
    async addKnowledgeDoc({ tenantId, title, sourceUrl = null, who, chars, chunks }) {
      const id = randomUUID();
      docs.set(id, { id, tenantId, title, sourceUrl, who: [...who], chars, chunks: [...chunks], updatedAt: iso() });
      return id;
    },
    async deleteKnowledgeDoc(tenantId, id) {
      if (docs.get(id)?.tenantId !== tenantId) return false;
      return docs.delete(id);
    },
    async searchKnowledge({ tenantId, terms, audience, limit = 4 }) {
      const out = [];
      for (const d of docs.values()) {
        if (d.tenantId !== tenantId || !d.who.includes(audience)) continue;
        d.chunks.forEach((text, idx) => {
          const words = new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
          const hits = terms.filter((t) => words.has(t)).length;
          if (hits) out.push({ docId: d.id, title: d.title, sourceUrl: d.sourceUrl, idx, text, rank: hits / (hits + 1) });
        });
      }
      return out.sort((a, b) => b.rank - a.rank).slice(0, limit);
    },
    // Memories (migration 009).
    async listMemories({ tenantId, userId }) {
      return memories.filter((m) => m.tenantId === tenantId && m.userId === userId).sort((a, b) => b.at - a.at).map(({ at, ...m }) => m);
    },
    async addMemory({ tenantId, userId, text }) {
      const m = { id: randomUUID(), tenantId, userId, text, createdAt: iso(), at: now() + memories.length / 1000 };
      memories.push(m);
      return m.id;
    },
    async deleteMemory({ tenantId, userId, id }) {
      const i = memories.findIndex((m) => m.id === id && m.tenantId === tenantId && m.userId === userId);
      if (i < 0) return false;
      memories.splice(i, 1);
      return true;
    },
    async deleteAllMemories({ tenantId, userId }) {
      for (let i = memories.length - 1; i >= 0; i--) if (memories[i].tenantId === tenantId && memories[i].userId === userId) memories.splice(i, 1);
    },


    // Storage (migration 014): what a signed-in person keeps, and their keep-time.
    async addSentFile({ tenantId, userId, conversationId = null, kind, name, mime, bytes }) {
      const id = randomUUID();
      sentFiles.set(id, { id, tenantId, userId, conversationId, kind, name, mime, size: bytes.length, bytes, createdAt: iso() });
      return id;
    },
    async listSentFiles({ tenantId, userId }) {
      return [...sentFiles.values()].filter((f) => f.tenantId === tenantId && f.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ bytes, tenantId: t, userId: u, ...f }) => f);
    },
    async getSentFile({ tenantId, userId, id }) {
      const f = sentFiles.get(id);
      return f && f.tenantId === tenantId && f.userId === userId ? { ...f } : null;
    },
    async deleteSentFile({ tenantId, userId, id }) {
      const f = sentFiles.get(id);
      if (!f || f.tenantId !== tenantId || f.userId !== userId) return false;
      return sentFiles.delete(id);
    },
    async listImages({ tenantId, ownerType, ownerId, limit = 500 }) {
      return [...images.values()].filter((r) => r.tenantId === tenantId && r.ownerType === ownerType && r.ownerId === ownerId && conversations.has(r.conversationId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit)
        .map((r) => ({ id: r.id, conversationId: r.conversationId, mime: r.mime, size: r.bytes ? r.bytes.length : 0, createdAt: r.createdAt }));
    },
    async deleteImage({ tenantId, ownerType, ownerId, id }) {
      const r = images.get(id);
      if (!r || r.tenantId !== tenantId || r.ownerType !== ownerType || r.ownerId !== ownerId) return false;
      return images.delete(id);
    },
    // One person's chats, files, notes, replies, sent files and pictures older than `before`.
    async purgeUserBefore({ tenantId, userId, before, imagesOnly = false }) {
      const cut = before.getTime();
      if (!imagesOnly) for (const c of [...conversations.values()]) {
        if (c.tenant_id === tenantId && c.owner_type === 'user' && c.owner_id === userId && Date.parse(c.updated_at) < cut) await this.deleteConversation(c.id);
      }
      if (!imagesOnly) for (const [id, f] of library) if (f.tenantId === tenantId && f.userId === userId && Date.parse(f.createdAt) < cut) { links.file.delete(id); library.delete(id); }
      if (!imagesOnly) for (const [id, f] of sentFiles) if (f.tenantId === tenantId && f.userId === userId && Date.parse(f.createdAt) < cut) sentFiles.delete(id);
      for (const [id, r] of images) if (r.tenantId === tenantId && r.ownerType === 'user' && r.ownerId === userId && Date.parse(r.createdAt) < cut) images.delete(id);
    },

    // Library (migration 012).
    async listLibraryFiles({ tenantId, userId }) {
      return [...library.values()].filter((f) => f.tenantId === tenantId && f.userId === userId)
        .sort((a, b) => b.at - a.at).map(({ chunks, at, tenantId: t, userId: u, ...f }) => f);
    },
    async getLibraryFile({ tenantId, userId, id }) {
      const f = library.get(id);
      if (!f || f.tenantId !== tenantId || f.userId !== userId) return null;
      const { at, tenantId: t, userId: u, ...rest } = f;
      return { ...rest, chunks: [...f.chunks] };
    },
    async addLibraryFile({ tenantId, userId, title, kind, format, chars, chunks }) {
      const id = randomUUID();
      library.set(id, { id, tenantId, userId, title, kind, format, chars, chunks: [...chunks], createdAt: iso(), at: now() + library.size / 1000 });
      return id;
    },
    async deleteLibraryFile({ tenantId, userId, id }) {
      const f = library.get(id);
      if (!f || f.tenantId !== tenantId || f.userId !== userId) return false;
      links.file.delete(id);
      return library.delete(id);
    },
    async searchLibrary({ tenantId, userId, terms, limit = 4 }) {
      const out = [];
      for (const f of library.values()) {
        if (f.tenantId !== tenantId || f.userId !== userId) continue;
        f.chunks.forEach((text, idx) => {
          const words = new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
          const hits = terms.filter((t) => words.has(t)).length;
          if (hits) out.push({ fileId: f.id, title: f.title, idx, text, rank: hits / (hits + 1) });
        });
      }
      return out.sort((a, b) => b.rank - a.rank).slice(0, limit);
    },

    // NCC contacts and deals (migration 040).
    async listNccContacts({ tenantId, userId }) {
      return [...nccContacts.values()].filter((c) => c.tenantId === tenantId && c.userId === userId)
        .sort((a, b) => b.at - a.at).map(nccContactOut);
    },
    async getNccContact({ tenantId, userId, id }) {
      const c = nccContacts.get(id);
      return c && c.tenantId === tenantId && c.userId === userId ? nccContactOut(c) : null;
    },
    async createNccContact({ tenantId, userId, name, email = '', phone = '', company = '', tags = [], notes = '', source = 'manual' }) {
      if (email && [...nccContacts.values()].some((c) => c.tenantId === tenantId && c.userId === userId && c.email.toLowerCase() === email.toLowerCase())) {
        const e = new Error('duplicate contact'); e.code = 'duplicate'; throw e;
      }
      const c = { id: randomUUID(), tenantId, userId, name, email, phone, company, tags: [...tags], notes, source, createdAt: iso(), updatedAt: iso(), at: now() + nccContacts.size / 1000 };
      nccContacts.set(c.id, c);
      return nccContactOut(c);
    },
    async createNccContacts({ tenantId, userId, contacts }) {
      const seen = new Set([...nccContacts.values()].filter((c) => c.tenantId === tenantId && c.userId === userId && c.email).map((c) => c.email.toLowerCase()));
      for (const c of contacts) {
        if (c.email && seen.has(c.email.toLowerCase())) { const e = new Error('duplicate contact'); e.code = 'duplicate'; throw e; }
        if (c.email) seen.add(c.email.toLowerCase());
      }
      for (const c of contacts) await this.createNccContact({ tenantId, userId, ...c });
    },
    async updateNccContact({ tenantId, userId, id, patch }) {
      const c = nccContacts.get(id);
      if (!c || c.tenantId !== tenantId || c.userId !== userId) return null;
      if (patch.email && [...nccContacts.values()].some((o) => o.id !== id && o.tenantId === tenantId && o.userId === userId && o.email.toLowerCase() === patch.email.toLowerCase())) {
        const e = new Error('duplicate contact'); e.code = 'duplicate'; throw e;
      }
      for (const k of ['name', 'email', 'phone', 'company', 'tags', 'notes']) if (k in patch) c[k] = k === 'tags' ? [...patch.tags] : patch[k];
      c.updatedAt = iso();
      c.at = now() + nccContacts.size / 1000 + 1;
      return nccContactOut(c);
    },
    async deleteNccContact({ tenantId, userId, id }) {
      const c = nccContacts.get(id);
      if (!c || c.tenantId !== tenantId || c.userId !== userId) return false;
      for (const [k, o] of nccOutbox) if (o.contactId === id) nccOutbox.delete(k);
      for (const [k, d] of nccDeals) if (d.contactId === id) { nccDeals.delete(k); for (const [tk, t] of nccTasks) if (t.dealId === k) nccTasks.delete(tk); }
      for (const [k, t] of nccTasks) if (t.contactId === id) nccTasks.delete(k);
      for (let i = nccActivities.length - 1; i >= 0; i--) if (nccActivities[i].contactId === id) nccActivities.splice(i, 1);
      return nccContacts.delete(id);
    },
    async listNccDeals({ tenantId, userId }) {
      return [...nccDeals.values()].filter((d) => d.tenantId === tenantId && d.userId === userId)
        .sort((a, b) => b.at - a.at).map(nccDealOut);
    },
    async createNccDeal({ tenantId, userId, contactId, title, stage = 'lead', value = 0, currency = 'PHP' }) {
      const c = nccContacts.get(contactId);
      if (!c || c.tenantId !== tenantId || c.userId !== userId) throw new Error('no such contact');
      const d = { id: randomUUID(), tenantId, userId, contactId, title, stage, value, currency, createdAt: iso(), updatedAt: iso(), at: now() + nccDeals.size / 1000 };
      nccDeals.set(d.id, d);
      return nccDealOut(d);
    },
    async updateNccDeal({ tenantId, userId, id, patch }) {
      const d = nccDeals.get(id);
      if (!d || d.tenantId !== tenantId || d.userId !== userId) return null;
      for (const k of ['title', 'stage', 'value', 'currency']) if (k in patch) d[k] = patch[k];
      d.updatedAt = iso();
      d.at = now() + nccDeals.size / 1000 + 1;
      return nccDealOut(d);
    },
    async deleteNccDeal({ tenantId, userId, id }) {
      const d = nccDeals.get(id);
      if (!d || d.tenantId !== tenantId || d.userId !== userId) return false;
      for (const [k, t] of nccTasks) if (t.dealId === id) nccTasks.delete(k);
      return nccDeals.delete(id);
    },
    async listNccTasks({ tenantId, userId }) {
      return [...nccTasks.values()].filter((t) => t.tenantId === tenantId && t.userId === userId)
        .sort((a, b) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999') || a.at - b.at).map(nccOut);
    },
    async createNccTask({ tenantId, userId, title, dueAt = null, contactId = null, dealId = null, origin = 'person' }) {
      const t = { id: randomUUID(), tenantId, userId, title, dueAt, done: false, contactId, dealId, origin, createdAt: iso(), updatedAt: iso(), at: now() + nccTasks.size / 1000 };
      nccTasks.set(t.id, t);
      return nccOut(t);
    },
    async updateNccTask({ tenantId, userId, id, patch }) {
      const t = nccTasks.get(id);
      if (!t || t.tenantId !== tenantId || t.userId !== userId) return null;
      for (const k of ['title', 'dueAt', 'done']) if (k in patch) t[k] = patch[k];
      t.updatedAt = iso();
      return nccOut(t);
    },
    async deleteNccTask({ tenantId, userId, id }) {
      const t = nccTasks.get(id);
      if (!t || t.tenantId !== tenantId || t.userId !== userId) return false;
      return nccTasks.delete(id);
    },
    async listNccActivities({ tenantId, userId, contactId, limit = 100 }) {
      return nccActivities.filter((a) => a.tenantId === tenantId && a.userId === userId && a.contactId === contactId)
        .slice().reverse().slice(0, limit).map(nccOut);
    },
    async addNccActivity({ tenantId, userId, contactId, kind, text }) {
      const c = nccContacts.get(contactId);
      if (!c || c.tenantId !== tenantId || c.userId !== userId) throw new Error('no such contact');
      const a = { id: randomUUID(), tenantId, userId, contactId, kind, text, createdAt: iso() };
      nccActivities.push(a);
      return nccOut(a);
    },
    async listNccAutomations({ tenantId, userId }) {
      return [...nccAutomations.values()].filter((a) => a.tenantId === tenantId && a.userId === userId)
        .sort((a, b) => a.at - b.at).map((a) => structuredClone(nccOut(a)));
    },
    async createNccAutomation({ tenantId, userId, name, enabled = false, trigger, conditions = [], actions }) {
      const a = { id: randomUUID(), tenantId, userId, name, enabled, trigger: structuredClone(trigger), conditions: structuredClone(conditions), actions: structuredClone(actions), runs: 0, lastRunAt: null, lastResult: '', createdAt: iso(), updatedAt: iso(), at: now() + nccAutomations.size / 1000 };
      nccAutomations.set(a.id, a);
      return structuredClone(nccOut(a));
    },
    async updateNccAutomation({ tenantId, userId, id, patch }) {
      const a = nccAutomations.get(id);
      if (!a || a.tenantId !== tenantId || a.userId !== userId) return null;
      for (const k of ['name', 'enabled', 'trigger', 'conditions', 'actions']) if (k in patch) a[k] = structuredClone(patch[k]);
      a.updatedAt = iso();
      return structuredClone(nccOut(a));
    },
    async deleteNccAutomation({ tenantId, userId, id }) {
      const a = nccAutomations.get(id);
      if (!a || a.tenantId !== tenantId || a.userId !== userId) return false;
      for (const o of nccOutbox.values()) if (o.automationId === id) o.automationId = null;
      return nccAutomations.delete(id);
    },
    async recordNccAutomationRun({ tenantId, userId, id, result, at }) {
      const a = nccAutomations.get(id);
      if (!a || a.tenantId !== tenantId || a.userId !== userId) return;
      a.runs += 1;
      a.lastRunAt = at;
      a.lastResult = result;
    },
    async listNccChannels({ tenantId, userId }) {
      return [...nccChannels.values()].filter((c) => c.tenantId === tenantId && c.userId === userId)
        .sort((a, b) => a.at - b.at).map(({ tokenEnc, ...c }) => nccOut(c));
    },
    async getNccChannel({ tenantId, userId, id }) {
      const c = nccChannels.get(id);
      return c && c.tenantId === tenantId && c.userId === userId ? nccOut(c) : null;
    },
    async upsertNccChannel({ tenantId, userId, kind, externalId, name, tokenEnc }) {
      let c = [...nccChannels.values()].find((x) => x.tenantId === tenantId && x.userId === userId && x.kind === kind && x.externalId === externalId);
      if (c) Object.assign(c, { name, tokenEnc });
      else { c = { id: randomUUID(), tenantId, userId, kind, externalId, name, tokenEnc, createdAt: iso(), at: now() + nccChannels.size / 1000 }; nccChannels.set(c.id, c); }
      const { tokenEnc: _t, ...out } = nccOut(c);
      return out;
    },
    async deleteNccChannel({ tenantId, userId, id }) {
      const c = nccChannels.get(id);
      if (!c || c.tenantId !== tenantId || c.userId !== userId) return false;
      for (const [k, o] of nccOutbox) if (o.channelId === id) nccOutbox.delete(k);
      return nccChannels.delete(id);
    },
    async listNccOutbox({ tenantId, userId, limit = 100 }) {
      return [...nccOutbox.values()].filter((o) => o.tenantId === tenantId && o.userId === userId)
        .sort((a, b) => b.at - a.at).slice(0, limit).map((o) => structuredClone(nccOut(o)));
    },
    async createNccOutbox({ tenantId, userId, channelId, automationId = null, contactId = null, action, payload }) {
      const o = { id: randomUUID(), tenantId, userId, channelId, automationId, contactId, action, payload: structuredClone(payload), status: 'pending', result: '', externalRef: '', createdAt: iso(), updatedAt: iso(), at: now() + nccOutbox.size / 1000 };
      nccOutbox.set(o.id, o);
      return structuredClone(nccOut(o));
    },
    async claimNccOutbox({ tenantId, userId, id }) {
      const o = nccOutbox.get(id);
      if (!o || o.tenantId !== tenantId || o.userId !== userId || o.status !== 'pending') return null;
      o.status = 'sending';
      o.updatedAt = iso();
      return structuredClone(nccOut(o));
    },
    async finishNccOutbox({ tenantId, userId, id, status, result, externalRef }) {
      const o = nccOutbox.get(id);
      if (!o || o.tenantId !== tenantId || o.userId !== userId || o.status !== 'sending') return null;
      Object.assign(o, { status, result, externalRef, updatedAt: iso() });
      return structuredClone(nccOut(o));
    },
    async discardNccOutbox({ tenantId, userId, id }) {
      const o = nccOutbox.get(id);
      if (!o || o.tenantId !== tenantId || o.userId !== userId || o.status !== 'pending') return null;
      Object.assign(o, { status: 'discarded', updatedAt: iso() });
      return structuredClone(nccOut(o));
    },
    async deleteNccData({ tenantId, userId }) {
      for (const [k, c] of nccChannels) if (c.tenantId === tenantId && c.userId === userId) await this.deleteNccChannel({ tenantId, userId, id: k });
      for (const [k, c] of nccContacts) if (c.tenantId === tenantId && c.userId === userId) await this.deleteNccContact({ tenantId, userId, id: k });
      for (const [k, t] of nccTasks) if (t.tenantId === tenantId && t.userId === userId) nccTasks.delete(k);
      for (const [k, a] of nccAutomations) if (a.tenantId === tenantId && a.userId === userId) nccAutomations.delete(k);
    },

    // Projects (migration 013).
    async listProjects({ tenantId, userId }) {
      return [...projects.values()].filter((p) => p.tenantId === tenantId && p.userId === userId)
        .sort((a, b) => b.at - a.at).map(projectOut);
    },
    async getProject({ tenantId, userId, id }) {
      const p = projects.get(id);
      return p && p.tenantId === tenantId && p.userId === userId ? projectOut(p) : null;
    },
    async createProject({ tenantId, userId, name, description = '', instructions = '', status = 'active' }) {
      const p = { id: randomUUID(), tenantId, userId, name, description, instructions, status, createdAt: iso(), updatedAt: iso(), at: now() + projects.size / 1000, tasks: [] };
      projects.set(p.id, p);
      return projectOut(p);
    },
    async updateProject({ tenantId, userId, id, patch }) {
      const p = projects.get(id);
      if (!p || p.tenantId !== tenantId || p.userId !== userId) return null;
      for (const k of ['name', 'description', 'instructions', 'status']) if (k in patch) p[k] = patch[k];
      p.updatedAt = iso();
      p.at = now() + projects.size / 1000 + 1;
      return projectOut(p);
    },
    async deleteProject({ tenantId, userId, id }) {
      const p = projects.get(id);
      if (!p || p.tenantId !== tenantId || p.userId !== userId) return false;
      for (const m of Object.values(links)) for (const [k, l] of m) if (l.projectId === id) m.delete(k);
      return projects.delete(id);
    },
    async listTasks({ tenantId, userId, projectId }) {
      const p = projects.get(projectId);
      return p && p.tenantId === tenantId && p.userId === userId ? p.tasks.map((t) => ({ ...t })) : [];
    },
    async addTask({ tenantId, userId, projectId, text }) {
      const p = projects.get(projectId);
      if (!p || p.tenantId !== tenantId || p.userId !== userId) throw new Error('no such project');
      const t = { id: randomUUID(), text, done: false, createdAt: iso() };
      p.tasks.push(t);
      return { ...t };
    },
    async updateTask({ tenantId, userId, projectId, id, patch }) {
      const p = projects.get(projectId);
      const t = p && p.tenantId === tenantId && p.userId === userId ? p.tasks.find((x) => x.id === id) : null;
      if (!t) return null;
      for (const k of ['text', 'done']) if (k in patch) t[k] = patch[k];
      return { ...t };
    },
    async deleteTask({ tenantId, userId, projectId, id }) {
      const p = projects.get(projectId);
      if (!p || p.tenantId !== tenantId || p.userId !== userId) return false;
      const i = p.tasks.findIndex((x) => x.id === id);
      if (i < 0) return false;
      p.tasks.splice(i, 1);
      return true;
    },
    async linkToProject({ tenantId, userId, projectId, kind, id }) {
      links[kind].set(id, { projectId, tenantId, userId });
    },
    async unlinkFromProject({ tenantId, userId, kind, id }) {
      const l = links[kind].get(id);
      if (l && l.tenantId === tenantId && l.userId === userId) links[kind].delete(id);
    },
    async projectLinks({ tenantId, userId, kind }) {
      return Object.fromEntries([...links[kind]].filter(([, l]) => l.tenantId === tenantId && l.userId === userId).map(([k, l]) => [k, l.projectId]));
    },
    async projectOf({ tenantId, userId, kind, id }) {
      const l = links[kind].get(id);
      return l && l.tenantId === tenantId && l.userId === userId ? l.projectId : null;
    },
    async searchLibraryIn({ tenantId, userId, projectId = null, terms, limit = 4 }) {
      const all = await this.searchLibrary({ tenantId, userId, terms, limit: 1000 });
      return all.filter((h) => {
        const l = links.file.get(h.fileId);
        return projectId === null ? !l : Boolean(l) && l.projectId === projectId && l.userId === userId;
      }).slice(0, limit);
    },

    // Channels (migration 007).
    async getChannel(kind, externalId) {
      const r = channels.get(kind + ':' + externalId);
      return r ? mapChannel(r) : null;
    },
    async listChannels(tenantId) {
      return [...channels.values()].filter((c) => c.tenant_id === tenantId).map(mapChannel);
    },
    async putChannel({ tenantId, kind, externalId, secretEnc, enabled }) {
      const k = kind + ':' + externalId;
      const old = channels.get(k);
      if (old && old.tenant_id !== tenantId) throw Object.assign(new Error('channel belongs to another business'), { code: 'taken' });
      const row = { tenant_id: tenantId, kind, external_id: externalId, secret_enc: secretEnc, enabled, updated_at: iso() };
      channels.set(k, row);
      return mapChannel(row);
    },
    async deleteChannel(tenantId, kind, externalId) {
      const k = kind + ':' + externalId;
      if (channels.get(k)?.tenant_id !== tenantId) return false;
      return channels.delete(k);
    },

    // Connectors (migration 006).
    async listConnectors(tenantId) {
      return [...connectors.values()].filter((c) => c.tenant_id === tenantId).sort((a, b) => a.name.localeCompare(b.name)).map(mapConnector);
    },
    async putConnector({ tenantId, name, baseUrl, authType, authHeader, secretEnc, actions, enabled, eventsWho = ['service'], oauth = null }) {
      const k = tenantId + ':' + name;
      const row = { ...(connectors.get(k) || { created_at: iso() }), tenant_id: tenantId, name, base_url: baseUrl, auth_type: authType,
        auth_header: authHeader, secret_enc: secretEnc, actions: JSON.parse(JSON.stringify(actions)), enabled, events_who: eventsWho, oauth, updated_at: iso() };
      connectors.set(k, row);
      return mapConnector(row);
    },
    async deleteConnector(tenantId, name) {
      return connectors.delete(tenantId + ':' + name);
    },
    async setConnectorWebhook(tenantId, name, secretEnc) {
      const row = connectors.get(tenantId + ':' + name);
      if (!row) return false;
      row.webhook_secret_enc = secretEnc;
      return true;
    },
    events,
    async addConnectorEvent({ tenantId, connector, eventId, type, key, data }) {
      if (events.some((e) => e.tenantId === tenantId && e.connector === connector && e.eventId === eventId)) return false;
      events.push({ tenantId, connector, eventId, type, key, data: JSON.parse(JSON.stringify(data)), createdAt: iso(), at: now() });
      return true;
    },
    async listConnectorEvents({ tenantId, connector, type = null, key = null, limit = 10 }) {
      return events.filter((e) => e.tenantId === tenantId && e.connector === connector && (!type || e.type === type) && (!key || e.key === key))
        .sort((a, b) => b.at - a.at).slice(0, limit).map(({ eventId, type: t, key: k, data, createdAt }) => ({ eventId, type: t, key: k, data, createdAt }));
    },
    async purgeConnectorEvents(before) {
      for (let i = events.length - 1; i >= 0; i--) if (events[i].at < before.getTime()) events.splice(i, 1);
    },

    async costSince(since) {
      const t = since.getTime();
      const legacy = usage.filter((e) => e.at >= t && e.spendReservationId == null)
        .reduce((sum, e) => sum + (Number(e.costUsd) || 0), 0);
      const held = [...spendReservations.values()].filter((r) => r.createdAt >= t && ['reserved', 'settled'].includes(r.status))
        .reduce((sum, r) => sum + (r.status === 'reserved' ? r.reservedUsd : r.actualUsd), 0);
      return legacy + held;
    }
  };
}
