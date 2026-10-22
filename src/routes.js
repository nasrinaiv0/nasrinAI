import { randomUUID, timingSafeEqual } from 'node:crypto';
import { REALTIME_VOICES_LIST } from './realtime.js';
import { buildProfessionalSearch, buildProfessionalResearchInput, presentProfessionalSearch } from './professional-intelligence.js';
import { createLinkedInIntegration } from './linkedin/index.js';
import { GEMINI_REALTIME_VOICES } from './gemini-realtime.js';
import { issueGuestToken, newGuestId } from './auth/guest.js';
import { publicConversation, publicMessage } from './conversations.js';
import { HttpError } from './http/errors.js';
import { createElevenLabs } from './elevenlabs.js';
import { encryptElevenLabsCredential, decryptElevenLabsCredential } from './elevenlabs-credentials.js';
import { authRoutes } from './auth/routes.js';
import { paymentRoutes } from './payments/routes.js';
import { manilaDayStart, manilaWeekStart, userWeeklyTokenLimit } from './limits.js';
import { publicCatalog } from './ai/professions.js';
import { realtimeCostPerMinute } from './ai/pricing.js';
import { createNotices, WHENS } from './notices.js';

const IMPROVEMENT_CONSENT_VERSION = '2026-10-10-preference-only';

// The public API. Each route is either explicitly public or requires a caller.
// The address of this NasrinAI app as the browser sees it (used to build the install code).
function appOriginOf(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim().toLowerCase();
  return /^[a-z0-9.-]+(:\d{1,5})?$/.test(host) && (proto === 'https' || proto === 'http') ? proto + '://' + host : null;
}

// Words the chat stream may send to say what Nasrin is doing (no free text).
const STAGES = new Set(['files', 'links', 'library', 'memory', 'web']);
// Keep the Studio cloud document provider-neutral and prevent arbitrary URLs or
// local blob URLs from being persisted as shared assets.
function cleanVideoStudioDocument(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'invalid_video_project', 'The video project is not valid.');
  const text = (v, max, fallback = '') => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : fallback;
  const arr = (v) => Array.isArray(v) ? v.slice(0, 200) : [];
  const clips = arr(raw.clips).filter((c) => c && typeof c === 'object' && !Array.isArray(c)).map((c) => {
    const id = text(c.id, 100);
    const kind = ['generated', 'upload', 'template', 'text'].includes(c.kind) ? c.kind : 'template';
    const videoId = typeof c.videoId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(c.videoId) ? c.videoId : null;
    const assetId = typeof c.assetId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(c.assetId) ? c.assetId : null;
    if (kind === 'upload' && !assetId) throw new HttpError(400, 'video_asset_required', 'Re-add this uploaded media and save again so its file is included in the cloud project.');
    const mediaType = kind === 'upload' && typeof c.mediaType === 'string' && /^(video|image|audio)\//i.test(c.mediaType) ? c.mediaType.slice(0, 100) : null;
    const track = ['video','overlay','text','audio'].includes(c.track) ? c.track : kind === 'text' ? 'text' : c.title ? 'overlay' : mediaType?.startsWith('audio/') ? 'audio' : 'video';
    const filter = ['none','cinematic','warm','cool','mono','vivid'].includes(c.filter) ? c.filter : 'none';
    const transition = ['cut','fade','dissolve','wipe'].includes(c.transition) ? c.transition : 'cut';
    const keyframes = Array.isArray(c.keyframes) ? c.keyframes.slice(0,30).filter(k => k && Number.isFinite(Number(k.time))).map(k => ({
      time:Math.max(0,Math.min(3600,Number(k.time))),opacity:Math.max(0,Math.min(100,Number(k.opacity ?? 100))),scale:Math.max(.5,Math.min(2,Number(k.scale ?? 1)))
    })) : [];
    return { id, name:text(c.name, 120, 'Clip'), title:text(c.title, 200), kind, track,
      duration:Math.max(0, Math.min(60, Number(c.duration) || 0)),
      start:Math.max(0, Math.min(3600, Number(c.start) || 0)),
      position:Math.max(0, Math.min(3600, Number(c.position) || 0)),
      transition, filter, opacity:Math.max(0,Math.min(100,Number(c.opacity ?? 100))),
      gain:Math.max(0,Math.min(200,Number(c.gain ?? 100))), keyframes,
      videoId, download:videoId && kind === 'generated' ? '/v1/videos/' + videoId + '/content' : null,
      assetId:kind === 'upload' ? assetId : null, mediaType,
      createdAt:text(c.createdAt, 40) };
  }).filter((c) => c.id);
  const generated = arr(raw.generated).filter((g) => g && typeof g === 'object' && !Array.isArray(g)).map((g) => ({
    id:text(g.id, 100), name:text(g.name, 120), videoId:typeof g.videoId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(g.videoId) ? g.videoId : null,
    status:['queued','in_progress','completed','failed'].includes(g.status) ? g.status : 'unknown'
  })).filter((g) => g.id);
  const document = { template:text(raw.template, 40, 'cinematic'), aspect:raw.aspect === '9:16' ? '9:16' : '16:9', prompt:text(raw.prompt, 1800), clips, generated };
  if (Buffer.byteLength(JSON.stringify(document), 'utf8') > 900000) throw new HttpError(413, 'video_project_too_large', 'This project is too large to save. Remove some clip metadata and try again.');
  return document;
}

export function buildRoutes({ config, gateway, store = null, limiter, usageLog = null, conversations, chat, provider = null, models, voice = null, realtime = null, geminiRealtime = null, auth = null, plans = null, payments = null, images = null, videos = null, legal = null, connectors = null, confirmations = null, facebook = null, hooks = [], knowledge = null, memory = null, settings = null, notices = null, library = null, projects = null, ncc = null, storage = null, uploads = null, videoStudioAssets = null, research = null, crawler = null, cite = null, siteIcons = null, pagePreviews = null, youtubeSearch = null, imageSearch = null, connect = null, transcription = null, pdfOcr = null, elevenlabs = null, videoStudioExporter = null, videoStudioRenderWorker = null, budget = null, logger = null, now = () => Date.now() }) {
  // Is anything able to answer? The router checks an own model at most every
  // 30 seconds, however often the page asks.
  async function modelReady() {
    if (!provider) return false;
    try { return await provider.healthCheck(); } catch { return false; }
  }

  notices = notices || createNotices({ plans, store, config, now });
  const linkedin = createLinkedInIntegration({ config, logger });
  // Files sent inside a request (base64) stay within this; larger ones are direct uploads.
  const inlineBytes = config.ai.attachments.maxInlineBytes ?? config.ai.attachments.maxTotalBytes;
  // Which moment the page asks about: ?when=open (default) or ?when=new_chat.
  const retentionAuthorized = (req) => {
    const expected = String(config.retentionCronSecret || '');
    const auth = String(req.headers.authorization || '');
    const expectedHeader = 'Bearer ' + expected;
    if (!expected || auth.length !== expectedHeader.length || auth.length > 512) return false;
    return timingSafeEqual(Buffer.from(auth), Buffer.from(expectedHeader));
  };

  const noticeWhen = (req) => {
    const w = new URL(req.url, 'http://local').searchParams.get('when') || 'open';
    if (!WHENS.includes(w) || w === 'both') throw new HttpError(400, 'invalid_notice', 'Ask for open or new_chat.');
    return w;
  };

  async function requireConnectAccess(caller) {
    if (caller.actor?.type === 'service') return;
    if (caller.actor?.type !== 'user') {
      throw new HttpError(403, 'sign_in_required', 'NasrinAI Connect requires a signed-in account.');
    }
    if (!plans || !config.plans.enabled) {
      throw new HttpError(403, 'connect_plan_required', 'NasrinAI Connect is available only on Max and Ultra plans.');
    }
    const current = await plans.current(caller);
    if (!['max', 'ultra'].includes(current.plan)) {
      throw new HttpError(403, 'connect_plan_required', 'NasrinAI Connect is available only on Max and Ultra plans.');
    }
  }

  async function requireVideoStudioAccess(caller) {
    if (caller.actor?.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to use Video Studio.');
    if (!plans) throw new HttpError(503, 'plans_unavailable', 'Video Studio access cannot be verified right now.');
    const current = await plans.current(caller);
    if (!['max', 'ultra'].includes(current.plan)) throw new HttpError(403, 'video_plan_required', 'Video Studio is available on Max and Ultra plans.');
  }

  async function requireVideoStudioAudio(caller) {
    await requireVideoStudioAccess(caller);
  }

  async function requirePersonalElevenLabs(caller) {
    await requireVideoStudioAccess(caller);
    if (caller.actor?.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to connect your ElevenLabs account.');
    if (!store?.getProviderCredential) throw new HttpError(503, 'provider_credentials_unavailable', 'Personal provider connections are not available yet.');
    let saved;
    try { saved = await store.getProviderCredential({ tenantId: caller.tenantId, ownerId: caller.actor.id, provider: 'elevenlabs' }); }
    catch { throw new HttpError(503, 'provider_credentials_unavailable', 'Could not load your provider connection. Please try again.'); }
    if (!saved) throw new HttpError(403, 'elevenlabs_connection_required', 'Connect your own ElevenLabs account to use audio generation.');
    let apiKey;
    try { apiKey = decryptElevenLabsCredential(saved); }
    catch { throw new HttpError(503, 'provider_credentials_unavailable', 'Your provider connection cannot be decrypted. Reconnect your ElevenLabs account.'); }
    const personal = elevenlabs?.forApiKey ? elevenlabs.forApiKey(apiKey) : createElevenLabs({ apiKey });
    if (!personal.available) throw new HttpError(503, 'elevenlabs_unavailable', 'Your ElevenLabs connection is not available.');
    return personal;
  }

  async function requireVideoStudioProject(caller, projectId) {
    if (typeof projectId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new HttpError(400, 'invalid_project_id', 'Choose a valid Video Studio project.');
    }
    if (!projects) throw new HttpError(503, 'projects_unavailable', 'Video Studio projects are not available right now.');
    return projects.get(caller, projectId);
  }

  function publicAudioAsset(asset) {
    return {
      id: asset.id, project_id: asset.projectId || null, kind: asset.kind,
      mime: asset.mime, size_bytes: asset.sizeBytes, voice_id: asset.voiceId || null,
      model_id: asset.modelId || null, duration_seconds: asset.durationSeconds ?? null,
      label: asset.label, created_at: asset.createdAt,
      content_url: '/v1/video-studio/audio-assets/' + asset.id + '/content'
    };
  }

  function timelineInput(body, creating = true) {
    const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const out = {};
    const ranges = {
      start_seconds: [0, 3600], trim_start_seconds: [0, 3600],
      trim_end_seconds: [0.001, 3600], gain: [0, 2], lane: [1, 8]
    };
    for (const [field, [min, max]] of Object.entries(ranges)) {
      if (!(field in b) && !creating) continue;
      if (field === 'trim_end_seconds' && (!(field in b) || b[field] == null)) { if (!creating) out.trimEndSeconds = null; continue; }
      const defaultValue = field === 'start_seconds' || field === 'trim_start_seconds' ? 0 : field === 'gain' ? 1 : 1;
      const value = field in b ? Number(b[field]) : defaultValue;
      if (!Number.isFinite(value) || value < min || value > max || (field === 'lane' && !Number.isInteger(value))) {
        throw new HttpError(400, 'invalid_timeline_value', 'Timeline position, trim, gain, or lane is outside the allowed range.');
      }
      const key = ({ start_seconds: 'startSeconds', trim_start_seconds: 'trimStartSeconds', trim_end_seconds: 'trimEndSeconds', gain: 'gain', lane: 'lane' })[field];
      out[key] = value;
    }
    if (creating && !('trimEndSeconds' in out)) out.trimEndSeconds = null;
    return out;
  }

  const connectRoutes = connect ? [
    {
      method: 'GET',
      path: '/v1/connect/sites',
      scope: 'chat',
      handler: async ({ caller }) => {        await requireConnectAccess(caller);
return { body: { sites: await connect.list(caller) } }; }
    },
    {
      method: 'POST',
      path: '/v1/connect/sites/analyze',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        await requireConnectAccess(caller);
        const siteUrl = body && typeof body.url === 'string' ? body.url : '';
        if (!siteUrl) throw new HttpError(400, 'invalid_url', 'Enter your website address.');
        return { status: 201, body: { site: await connect.analyzeAndCreate(caller, siteUrl) } };
      }
    },
    {
      method: 'POST',
      path: '/v1/connect/sites/:id/verify',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        await requireConnectAccess(caller);
        const token = body && typeof body.token === 'string' ? body.token : '';
        const site = await connect.verify(caller, params.id, token);
        if (!site) throw new HttpError(409, 'verification_failed', 'NasrinAI could not verify control of this website. The challenge may be wrong or expired.');
        return { body: { site } };
      }
    },
    {
      method: 'GET',
      path: '/v1/connect/sites/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        await requireConnectAccess(caller);
        const site = await connect.get(caller, params.id);
        if (!site) throw new HttpError(404, 'not_found', 'Connect site not found.');
        return { body: { site } };
      }
    },
    {
      method: 'GET',
      path: '/v1/connect/sites/:id/config',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        await requireConnectAccess(caller);
        const config = await connect.getConfig(caller, params.id);
        if (!config) throw new HttpError(404, 'not_found', 'Connect site not found.');
        return { body: { config } };
      }
    },
    {
      method: 'PUT',
      path: '/v1/connect/sites/:id/config',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        await requireConnectAccess(caller);
        const config = await connect.saveConfig(caller, params.id, body);
        return { body: { config } };
      }
    },
    {
      method: 'GET',
      path: '/v1/connect/sites/:id/preview',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        await requireConnectAccess(caller);
        return { body: { preview: await connect.previewConfig(caller, params.id) } };
      }
    },
    {
      method: 'POST',
      path: '/v1/connect/sites/:id/install',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        await requireConnectAccess(caller);
        const method = body && typeof body.method === 'string' ? body.method : '';
        if (!method) throw new HttpError(400, 'invalid_method', 'Choose an installation method.');
        return { body: { installation: await connect.install(caller, params.id, method) } };
      }
    },
    {
      method: 'POST',
      path: '/v1/connect/sites/:id/snippet',
      scope: 'chat',
      body: true,
      handler: async ({ req, caller, params }) => {
        await requireConnectAccess(caller);
        return { body: { install: await connect.installSnippet(caller, params.id, appOriginOf(req)) } };
      }
    },
    {
      method: 'POST',
      path: '/v1/connect/sites/:id/activate',
      scope: 'chat',
      body: true,
      handler: async ({ req, caller, params }) => {
        await requireConnectAccess(caller);
        return { body: { installation: await connect.activate(caller, params.id, appOriginOf(req)) } };
      }
    },
    {
      method: 'POST',
      path: '/v1/connect/sites/:id/link',
      scope: 'chat',
      body: true,
      handler: async ({ req, caller, params }) => {
        await requireConnectAccess(caller);
        return { body: { link: await connect.hostedLink(caller, params.id, appOriginOf(req)) } };
      }
    },
    {
      method: 'GET',
      path: '/v1/connect/sites/:id/knowledge',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        await requireConnectAccess(caller);
        const knowledgeState = await connect.getKnowledge(caller, params.id);
        if (!knowledgeState) throw new HttpError(404, 'not_found', 'Connect site not found.');
        return { body: { knowledge: knowledgeState } };
      }
    },
    {
      // Reads the verified site's public pages into the business's knowledge. Replaces any earlier crawl.
      method: 'POST',
      path: '/v1/connect/sites/:id/knowledge/crawl',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params }) => {
        await requireConnectAccess(caller);
        const knowledgeState = await connect.crawlKnowledge(caller, params.id);
        if (!knowledgeState) throw new HttpError(404, 'not_found', 'Connect site not found.');
        return { status: 202, body: { knowledge: knowledgeState } };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/connect/sites/:id/knowledge',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        await requireConnectAccess(caller);
        if (!(await connect.removeKnowledge(caller, params.id))) throw new HttpError(404, 'not_found', 'Connect site not found.');
        return { body: { removed: true } };
      }
    },
    {
      // Public: what a visitor's hosted chat page shows. Unknown, paused or unapproved links are all "not found".
      method: 'GET',
      path: '/v1/connect/hosted/:code',
      public: true,
      handler: async ({ params }) => {
        const site = await connect.hostedSite(params.code);
        if (!site) throw new HttpError(404, 'not_found', 'This chat link is not available.');
        return { body: { name: site.name, welcome: site.welcome } };
      }
    },
    {
      // Public: starts a chat-only guest session for the business behind a hosted link.
      method: 'POST',
      path: '/v1/connect/hosted/:code/session',
      public: true,
      body: true,
      handler: async ({ req, ip, params }) => {
        await limiter.guestSession(ip);
        const site = await connect.hostedSite(params.code);
        if (!site) throw new HttpError(404, 'not_found', 'This chat link is not available.');
        const { token, expiresAt } = issueGuestToken({
          secret: config.guestSecret, tenantId: site.tenantId, guestId: newGuestId(), ttlSeconds: config.guestTtlSeconds,
          origin: String(req.headers.origin || '').toLowerCase().replace(/\/+$/, '') || null
        });
        return { status: 201, body: { token, expires_at: expiresAt, name: site.name, welcome: site.welcome } };
      }
    },
    {
      method: 'POST',
      path: '/v1/connect/sites/:id/approve',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        await requireConnectAccess(caller);
        return { body: { approval: await connect.approveConfig(caller, params.id) } };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/connect/sites/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        await requireConnectAccess(caller);
        const ok = await connect.remove(caller, params.id);
        if (!ok) throw new HttpError(404, 'not_found', 'Connect site not found.');
        return { body: { removed: true } };
      }
    }
  ] : [];

  return [...connectRoutes,
    {
      // Hourly core NasrinAI public-web crawl. Not part of Connect site knowledge.
      method: 'GET',
      path: '/v1/internal/web-crawl',
      public: true,
      handler: async ({ req }) => {
        if (!retentionAuthorized(req)) throw new HttpError(401, 'unauthorized', 'Unauthorized.');
        if (!crawler) throw new HttpError(503, 'crawler_unavailable', 'The core web crawler is not configured.');
        const result = await crawler.processBatch({ limit: 5 });
        return { body: { ok: true, ...result } };
      }
    },
    {
      // Vercel Cron: launch queued Video Studio renders and collect finished MP4s.
      method: 'GET',
      path: '/v1/internal/video-studio-render',
      public: true,
      handler: async ({ req }) => {
        if (!retentionAuthorized(req)) throw new HttpError(401, 'unauthorized', 'Unauthorized.');
        if (!videoStudioRenderWorker?.enabled) throw new HttpError(503, 'video_render_unavailable', 'Video Studio render worker is not configured.');
        try { return { body: { ok: true, ...await videoStudioRenderWorker.processBatch({ limit: 1 }) } }; }
        catch (err) {
          logger?.warn?.('Video Studio render worker tick failed', { error: err?.message });
          throw new HttpError(503, 'video_render_worker_failed', 'The render worker could not process its queue. It will retry on the next scheduled run.');
        }
      }
    },
    {
      // Vercel Cron: automatic retention enforcement for inactive users.
      // This route is public at the HTTP layer but protected by CRON_SECRET.
      method: 'GET',
      path: '/v1/internal/retention',
      public: true,
      handler: async ({ req }) => {
        if (!retentionAuthorized(req)) throw new HttpError(401, 'unauthorized', 'Unauthorized.');
        if (!store?.purgeRetention) throw new HttpError(503, 'retention_unavailable', 'Retention cleanup is not configured.');
        await store.purgeRetention(config.images?.retentionDays ?? 30);
        if (!store.purgeImprovementConsent) throw new HttpError(503, 'retention_unavailable', 'Improvement consent cleanup is not configured.');
        await store.purgeImprovementConsent();
        if (!store.purgeImprovementExamples) throw new HttpError(503, 'retention_unavailable', 'Improvement example cleanup is not configured.');
        await store.purgeImprovementExamples();
        // Research scans past their keep-time (docs/research.md).
        if (research && store.purgeResearch) {
          try { await store.purgeResearch(); } catch (err) { logger?.warn?.('could not purge research', { error: err?.message }); }
        }
        // Direct uploads that were never used (docs/uploads.md). A storage
        // problem is logged; it must not hide the clean-ups above.
        if (uploads) {
          try { await uploads.purge(); } catch (err) { logger?.warn?.('could not purge uploads', { error: err?.message }); }
        }
        return { body: { ok: true } };
      }
    },
    {
      // Reads one of Nasrin's replies aloud, or previews a voice.
      // Body: { voice, message_id } or { voice, preview: true }. Answers audio (MP3 for OpenAI, WAV for Gemini).
      method: 'POST',
      path: '/v1/speech',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body, ip, res }) => {
        if (!voice) throw new HttpError(503, 'speech_unavailable', 'Voice replies are not available right now.');
        const { audio, parts } = await voice.speak(caller, body, ip);
        res.writeHead(200, { 'Content-Type': voice.mime || 'audio/mpeg', 'Content-Length': audio.length, 'Cache-Control': 'private, max-age=3600', 'X-Speech-Parts': String(parts) });
        res.end(audio);
      }
    },
    {
      // Mint a short-lived realtime client credential. The caller's tier is
      // resolved first; the browser never supplies a provider or raw model.
      method: 'POST',
      path: '/v1/realtime/session',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body, ip }) => {
        if (config.ai.realtime?.enabled === false || (!realtime && !geminiRealtime)) {
          throw new HttpError(503, 'realtime_unavailable', 'Gemini Live voice is not available right now. Check the server-side Gemini configuration.');
        }
        const requested = body && typeof body.model === 'string' ? body.model : undefined;
        const plan = plans ? await plans.planFor(caller) : 'ultra';
        const choice = await models.resolve(caller, requested, { plan });
        const tier = config.ai.realtime.tiers[choice.tier];
        if (!tier) throw new HttpError(400, 'realtime_tier_unavailable', 'Realtime voice is not available for this tier.');
        const requestedVoice = body && typeof body.voice === 'string' ? body.voice : 'coral';
        if (!REALTIME_VOICES_LIST.includes(requestedVoice)) throw new HttpError(400, 'invalid_voice', 'Choose a supported realtime voice.');
        await limiter.message(caller, ip);
        await limiter.budget(caller);
        const started = now();
        const instructions = 'You are NasrinAI in a realtime voice conversation. Keep replies very short by default: usually one sentence and under 20 words. Answer directly; avoid greetings, repetition, long explanations, and unsolicited details. Ask only essential clarifying questions. Expand only when the user asks or when needed for accuracy, safety, or a clear next step. Be natural and interruptible. Never claim to have performed actions you did not perform. If a request needs fresh information or an external action, direct the user to normal NasrinAI chat.';
        const perMinute = realtimeCostPerMinute(tier.provider, tier.model);
        if (!budget || perMinute === null) {
          throw new HttpError(503, 'realtime_budget_unavailable', 'Realtime voice is paused because a safe spending estimate is not configured for this model.');
        }
        // Browser-direct sessions cannot report every turn to the server. Reserve
        // and charge a conservative maximum-duration estimate before returning a token.
        // The model-price table includes headroom and unknown models fail closed.
        // OpenAI sessions can be capped to the largest whole-minute duration that
        // fits the smallest configured global budget ceiling. The atomic ledger
        // still checks actual remaining daily/weekly/monthly headroom at reservation
        // time, so concurrent spend or earlier usage can still reject the session.
        // Gemini's ephemeral token expiry does not prove an established browser
        // session ends at that moment; preserve the full 30-minute exposure reserve.
        let sessionMaxSeconds = Math.min(tier.maxSeconds, tier.dailySeconds);
        const globalBudgetCaps = [
          config.ai.routing.budget.dailyUsd,
          config.ai.routing.budget.weeklyUsd,
          config.ai.routing.budget.monthlyUsd
        ].filter(Number.isFinite);
        if (tier.provider !== 'gemini' && globalBudgetCaps.length) {
          const configuredCeilingUsd = Math.min(...globalBudgetCaps);
          const affordableWholeMinutes = Math.floor(configuredCeilingUsd / perMinute);
          sessionMaxSeconds = Math.min(sessionMaxSeconds, affordableWholeMinutes * 60);
          if (sessionMaxSeconds < 60) {
            throw new HttpError(503, 'realtime_budget_unavailable', 'Realtime voice is paused because the configured global budget cannot cover one safe minute for this model.');
          }
        }
        if (!store?.reserveDailyRealtimeVoice || !store?.settleDailyRealtimeVoiceReservation || !store?.releaseDailyRealtimeVoiceReservation) {
          throw new HttpError(503, 'realtime_quota_unavailable', 'Realtime voice is paused because the daily allowance cannot be verified safely.');
        }
        const voiceReservationId = randomUUID();
        let voiceReservation;
        try {
          const result = await store.reserveDailyRealtimeVoice({
            reservationId: voiceReservationId, tenantId: caller.tenantId,
            actorType: caller.actor.type, actorId: caller.actor.id,
            reservedSeconds: sessionMaxSeconds, dailyLimitSeconds: tier.dailySeconds
          });
          if (!result?.allowed || result.reservationId !== voiceReservationId || !Number.isInteger(result.reservedSeconds) || result.reservedSeconds < 1) {
            throw new HttpError(429, 'daily_voice_limit', 'You have used today’s realtime voice allowance for this plan. It resets at midnight Manila time.');
          }
          voiceReservation = { id: voiceReservationId, reservedSeconds: result.reservedSeconds };
          sessionMaxSeconds = Math.min(sessionMaxSeconds, result.reservedSeconds);
        } catch (err) {
          if (err instanceof HttpError) throw err;
          logger?.warn?.('daily realtime voice reservation failed', { error: err?.message });
          throw new HttpError(503, 'realtime_quota_unavailable', 'Realtime voice is paused because the daily allowance cannot be verified safely.');
        }
        // Browser-direct audio does not expose trustworthy per-turn token usage.
        // Reserve a conservative token allowance per started minute so voice and
        // text draws from the same paid-plan actor allowance. Platform shared token
        // ceilings are disabled; business tenants retain their own ceiling.
        let tokenReservation;
        try {
          if (!store?.reserveDailyTokens || !store?.settleDailyTokenReservation || !store?.releaseDailyTokenReservation) {
            throw new HttpError(503, 'realtime_quota_unavailable', 'Realtime voice is paused because token capacity cannot be verified safely.');
          }
          const reservedTokens = Math.ceil(sessionMaxSeconds / 60) * config.ai.realtime.tokensPerMinute;
          const actorLimit = caller.actor.type === 'user'
            ? await userWeeklyTokenLimit(caller, { limits: config.limits, plans, store, now })
            : 0;
          const tokenReservationId = randomUUID();
          const tokenResult = await store.reserveDailyTokens({
            reservationId: tokenReservationId, tenantId: caller.tenantId,
            actorType: caller.actor.type, actorId: caller.actor.id, reservedTokens,
            actorLimit,
            guestLimit: caller.tenant.kind === 'platform' ? 0 : caller.tenant.dailyTokenLimit,
            tenantLimit: caller.tenant.kind === 'platform' ? 0 : caller.tenant.dailyTokenLimit
          });
          if (!tokenResult?.allowed || tokenResult.reservationId !== tokenReservationId) {
            const reason = tokenResult?.reason;
            const code = reason === 'tenant_limit' ? 'tenant_limit'
              : reason === 'weekly_limit' ? 'weekly_limit'
              : reason === 'guest_limit' ? 'guest_limit' : 'daily_limit';
            throw new HttpError(429, code, 'Realtime voice cannot start because the shared daily or plan token allowance is exhausted.');
          }
          tokenReservation = { id: tokenReservationId, reservedTokens };
        } catch (err) {
          await store.releaseDailyRealtimeVoiceReservation({ reservationId: voiceReservation.id }).catch(() => {});
          if (err instanceof HttpError) throw err;
          logger?.warn?.('realtime token reservation failed', { error: err?.message });
          throw new HttpError(503, 'realtime_quota_unavailable', 'Realtime voice is paused because token capacity cannot be verified safely.');
        }
        // Gemini's credential expiry does not prove an established browser session ends
        // at expiry, so retain the conservative 30-minute USD exposure reservation.
        const reservationSeconds = tier.provider === 'gemini' ? Math.max(tier.maxSeconds, 1800) : sessionMaxSeconds;
        const sessionCost = Math.round((perMinute * reservationSeconds / 60) * 1e6) / 1e6;
        let spendReservation;
        try {
          spendReservation = await budget.reserveSpend({ caller, amountUsd: sessionCost, maxRequestUsd: null });
        } catch (err) {
          await store.releaseDailyTokenReservation({ reservationId: tokenReservation.id }).catch(() => {});
          await store.releaseDailyRealtimeVoiceReservation({ reservationId: voiceReservation.id }).catch(() => {});
          throw err;
        }
        try {
          let session;
          let provider = tier.provider;
          if (provider === 'gemini') {
            const voiceMap = { coral: 'Kore', nova: 'Aoede', shimmer: 'Leda', sage: 'Charon', ash: 'Puck', echo: 'Orus', alloy: 'Zephyr', ballad: 'Fenrir', verse: 'Puck', marin: 'Kore', cedar: 'Charon' };
            session = await geminiRealtime?.session({
              model: tier.model,
              voice: voiceMap[requestedVoice] || 'Kore',
              maxSeconds: sessionMaxSeconds,
              maxOutputTokens: choice.tier === 'ultra' ? 512 : choice.tier === 'max' ? 384 : 256,
              instructions
            });
            if (!session) throw new Error('Gemini realtime is unavailable.');
            session.voice = requestedVoice;
            session.gemini_voice = voiceMap[requestedVoice] || 'Kore';
          } else {
            session = await realtime?.session({
              model: tier.model,
              voice: requestedVoice,
              reasoningEffort: tier.effort,
              maxSeconds: sessionMaxSeconds,
              maxOutputTokens: choice.tier === 'ultra' ? 512 : choice.tier === 'max' ? 384 : 256,
              instructions
            });
            if (!session) throw new Error('OpenAI realtime is unavailable.');
          }
          const tokensSettled = await store.settleDailyTokenReservation({ reservationId: tokenReservation.id, actualTokens: tokenReservation.reservedTokens });
          if (!tokensSettled) throw new HttpError(503, 'realtime_quota_unavailable', 'Realtime voice token usage could not be reconciled safely.');
          const voiceSettled = await store.settleDailyRealtimeVoiceReservation({ reservationId: voiceReservation.id });
          if (!voiceSettled) throw new HttpError(503, 'realtime_quota_unavailable', 'Realtime voice usage could not be reconciled safely.');
          await budget.settleSpend(spendReservation, sessionCost);
          await usageLog?.record?.(caller, { provider, model: tier.model, outcome: 'ok', task: 'realtime', latencyMs: now() - started,
            costUsd: sessionCost, spendReservationId: spendReservation.id });
          return { body: { ...session, provider, tier: choice.tier, effort: tier.effort, voices: provider === 'gemini' ? GEMINI_REALTIME_VOICES : REALTIME_VOICES_LIST, max_seconds: tier.provider === 'gemini' ? tier.maxSeconds : sessionMaxSeconds } };
        } catch (err) {
          await store.releaseDailyTokenReservation({ reservationId: tokenReservation.id }).catch(() => {});
          await store.releaseDailyRealtimeVoiceReservation({ reservationId: voiceReservation.id }).catch(() => {});
          await budget.releaseSpend(spendReservation).catch(() => {});
          if (err instanceof HttpError && err.code === 'budget_reached') throw err;
          logger?.warn?.('realtime session failed', { kind: err?.kind, provider: tier.provider, model: tier.model });
          throw new HttpError(503, 'realtime_unavailable', 'Realtime voice could not be started. Please try again.');
        }
      }
    },
    {
      // Improvement consent is independent of Terms and personal Memory.
      // This endpoint records the choice only; it never captures chat content.
      method: 'GET',
      path: '/v1/improvement-consent',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (!['user', 'guest'].includes(caller.actor.type)) throw new HttpError(403, 'forbidden', 'This choice is for people using NasrinAI.');
        if (!store?.getImprovementConsent) throw new HttpError(503, 'consent_unavailable', 'Improvement privacy settings are not available right now.');
        const current = await store.getImprovementConsent({ tenantId: caller.tenantId, subjectType: caller.actor.type, subjectId: caller.actor.id });
        const enabled = Boolean(current && current.version === IMPROVEMENT_CONSENT_VERSION && current.decision === 'granted');
        return { body: { version: IMPROVEMENT_CONSENT_VERSION, enabled, decision: current?.decision || 'not_set' } };
      }
    },
    {
      method: 'PUT',
      path: '/v1/improvement-consent',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        if (!['user', 'guest'].includes(caller.actor.type)) throw new HttpError(403, 'forbidden', 'This choice is for people using NasrinAI.');
        if (!store?.getImprovementConsent || !store?.recordImprovementConsent) throw new HttpError(503, 'consent_unavailable', 'Improvement privacy settings are not available right now.');
        if (!body || typeof body.enabled !== 'boolean' || body.version !== IMPROVEMENT_CONSENT_VERSION) {
          throw new HttpError(400, 'invalid_consent', 'Refresh the privacy settings and choose again.');
        }
        const identity = { tenantId: caller.tenantId, subjectType: caller.actor.type, subjectId: caller.actor.id };
        const current = await store.getImprovementConsent(identity);
        const decision = body.enabled ? 'granted'
          : current && current.version === IMPROVEMENT_CONSENT_VERSION && current.decision === 'granted' ? 'withdrawn' : 'declined';
        await store.recordImprovementConsent({ ...identity, version: IMPROVEMENT_CONSENT_VERSION, decision });
        if (decision === 'withdrawn') {
          if (!store?.deleteImprovementExamplesForSubject) throw new HttpError(503, 'improvement_deletion_unavailable', 'Your choice was saved, but removing previously contributed examples could not be confirmed. Please retry or contact support.');
          await store.deleteImprovementExamplesForSubject({ ...identity, reasonCode: 'consent_withdrawal' });
        }
        return { body: { version: IMPROVEMENT_CONSENT_VERSION, enabled: decision === 'granted', decision } };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/improvement-consent',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (!['user', 'guest'].includes(caller.actor.type)) throw new HttpError(403, 'forbidden', 'This choice is for people using NasrinAI.');
        if (!store?.recordImprovementConsent) throw new HttpError(503, 'consent_unavailable', 'Improvement privacy settings are not available right now.');
        const identity = { tenantId: caller.tenantId, subjectType: caller.actor.type, subjectId: caller.actor.id };
        await store.recordImprovementConsent({ ...identity, version: IMPROVEMENT_CONSENT_VERSION, decision: 'withdrawn' });
        if (!store?.deleteImprovementExamplesForSubject) throw new HttpError(503, 'improvement_deletion_unavailable', 'Your choice was saved, but removing previously contributed examples could not be confirmed. Please retry or contact support.');
        await store.deleteImprovementExamplesForSubject({ ...identity, reasonCode: 'consent_withdrawal' });
        return { body: { version: IMPROVEMENT_CONSENT_VERSION, enabled: false, decision: 'withdrawn' } };
      }
    },
    {
      // Which Terms / Privacy Notice versions are current, and whether this
      // signed-in person has accepted them.
      method: 'GET',
      path: '/v1/legal',
      scope: 'chat',
      handler: async ({ caller }) => ({ body: legal ? await legal.status(caller) : { accepted: true } })
    },
    {
      // Records acceptance of the current Terms (and that the Privacy Notice was shown).
      method: 'POST',
      path: '/v1/legal/accept',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => ({ body: await legal.accept(caller, body) })
    },
    {
      // Everything kept about the signed-in person, as a JSON file.
      method: 'GET',
      path: '/v1/account/export',
      scope: 'chat',
      handler: async ({ caller, res }) => {
        const data = await legal.export(caller, conversations);
        const json = JSON.stringify(data, null, 2);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="nasrinai-my-data.json"', 'Cache-Control': 'no-store' });
        res.end(json);
      }
    },
    {
      // Deletes the account and its chats. Body: { confirm: "DELETE" }.
      method: 'POST',
      path: '/v1/account/delete',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body, res }) => {
        const out = await legal.deleteAccount(caller, body);
        res.appendHeader('Set-Cookie', 'nasrin_rt=; Path=/v1/auth; Max-Age=0; HttpOnly; Secure; SameSite=Strict');
        return { body: out };
      }
    },
    {
      // Professional AI: the professions and groups the page can offer
      // (names and short descriptions only; the instructions stay on the server).
      method: 'GET',
      path: '/v1/professionals',
      public: true,
      handler: async () => ({ body: config.professional?.enabled === false ? { enabled: false, groups: [], professions: [] } : { enabled: true, ...publicCatalog() } })
    },
    {
      // NCC (src/ncc.js, docs/ncc.md): the enterprise CRM, only for accounts
      // the NasrinAI team turned on.
      method: 'GET',
      path: '/v1/ncc/status',
      scope: 'chat',
      handler: async ({ caller }) => ({ body: ncc ? ncc.status(caller) : { enabled: false } })
    },
    {
      method: 'GET',
      path: '/v1/ncc',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.list(caller) };
      }
    },
    {
      method: 'GET',
      path: '/v1/ncc/export',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.exportAll(caller) };
      }
    },
    {
      method: 'POST',
      path: '/v1/ncc/delete-all',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.removeAll(caller, body) };
      }
    },
    {
      method: 'POST',
      path: '/v1/ncc/contacts',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { status: 201, body: await ncc.createContact(caller, body) };
      }
    },
    {
      method: 'POST',
      path: '/v1/ncc/contacts/import',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.importContacts(caller, body) };
      }
    },
    {
      method: 'PUT',
      path: '/v1/ncc/contacts/:id',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.updateContact(caller, params.id, body) };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/ncc/contacts/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.removeContact(caller, params.id) };
      }
    },
    {
      method: 'GET',
      path: '/v1/ncc/contacts/:id/timeline',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.timeline(caller, params.id) };
      }
    },
    {
      method: 'POST',
      path: '/v1/ncc/contacts/:id/notes',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { status: 201, body: await ncc.addNote(caller, params.id, body) };
      }
    },
    {
      method: 'POST',
      path: '/v1/ncc/tasks',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { status: 201, body: await ncc.createTask(caller, body) };
      }
    },
    {
      method: 'PUT',
      path: '/v1/ncc/tasks/:id',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.updateTask(caller, params.id, body) };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/ncc/tasks/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.removeTask(caller, params.id) };
      }
    },
    {
      method: 'POST',
      path: '/v1/ncc/automations',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { status: 201, body: await ncc.createAutomation(caller, body) };
      }
    },
    {
      method: 'PUT',
      path: '/v1/ncc/automations/:id',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.updateAutomation(caller, params.id, body) };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/ncc/automations/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.removeAutomation(caller, params.id) };
      }
    },
    {
      method: 'POST',
      path: '/v1/ncc/channels',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { status: 201, body: await ncc.connectChannel(caller, body) };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/ncc/channels/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.removeChannel(caller, params.id) };
      }
    },
    {
      method: 'POST',
      path: '/v1/ncc/posts',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.post(caller, body) };
      }
    },
    {
      method: 'POST',
      path: '/v1/ncc/contacts/:id/whatsapp',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.message(caller, params.id, body) };
      }
    },
    {
      method: 'POST',
      path: '/v1/ncc/outbox/:id/send',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.approve(caller, params.id) };
      }
    },
    {
      method: 'POST',
      path: '/v1/ncc/outbox/:id/discard',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.discard(caller, params.id) };
      }
    },
    {
      method: 'POST',
      path: '/v1/ncc/deals',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { status: 201, body: await ncc.createDeal(caller, body) };
      }
    },
    {
      method: 'PUT',
      path: '/v1/ncc/deals/:id',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.updateDeal(caller, params.id, body) };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/ncc/deals/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!ncc) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await ncc.removeDeal(caller, params.id) };
      }
    },
    {
      // Video Studio projects are server-owned, tenant/user-scoped documents.
      method: 'GET',
      path: '/v1/video-studio/projects',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (caller.actor.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to use cloud Video Studio projects.');
        if (!store?.listVideoStudioProjects) throw new HttpError(503, 'video_projects_unavailable', 'Cloud projects are not available yet.');
        return { body: { projects: await store.listVideoStudioProjects({ tenantId: caller.tenantId, userId: caller.actor.id }) } };
      }
    },
    {
      method: 'POST',
      path: '/v1/video-studio/projects',
      scope: 'chat',
      body: true,
      maxBody: 1100000,
      handler: async ({ caller, body }) => {
        if (caller.actor.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to save cloud Video Studio projects.');
        if (!store?.createVideoStudioProject) throw new HttpError(503, 'video_projects_unavailable', 'Cloud projects are not available yet.');
        const name = typeof body?.name === 'string' ? body.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80) : '';
        if (!name) throw new HttpError(400, 'invalid_video_project', 'Enter a project name before saving.');
        const project = await store.createVideoStudioProject({ tenantId: caller.tenantId, userId: caller.actor.id, name, document: cleanVideoStudioDocument(body.document) });
        return { status: 201, body: { project } };
      }
    },
    {
      method: 'GET',
      path: '/v1/video-studio/projects/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (caller.actor.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to open cloud Video Studio projects.');
        if (!store?.getVideoStudioProject) throw new HttpError(503, 'video_projects_unavailable', 'Cloud projects are not available yet.');
        const project = await store.getVideoStudioProject({ tenantId: caller.tenantId, userId: caller.actor.id, id: params.id });
        if (!project) throw new HttpError(404, 'not_found', 'That video project was not found.');
        return { body: { project } };
      }
    },
    {
      method: 'PUT',
      path: '/v1/video-studio/projects/:id',
      scope: 'chat',
      body: true,
      maxBody: 1100000,
      handler: async ({ caller, params, body }) => {
        if (caller.actor.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to save cloud Video Studio projects.');
        if (!store?.updateVideoStudioProject) throw new HttpError(503, 'video_projects_unavailable', 'Cloud projects are not available yet.');
        const name = typeof body?.name === 'string' ? body.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80) : '';
        if (!name) throw new HttpError(400, 'invalid_video_project', 'Enter a project name before saving.');
        if (!Number.isInteger(body?.expected_version) || body.expected_version < 1) {
          throw new HttpError(400, 'expected_version_required', 'Reload this project before saving so changes are not overwritten.');
        }
        const expectedVersion = body.expected_version;
        const previous = await store.getVideoStudioProject({ tenantId: caller.tenantId, userId: caller.actor.id, id: params.id });
        const document = cleanVideoStudioDocument(body.document);
        const project = await store.updateVideoStudioProject({ tenantId: caller.tenantId, userId: caller.actor.id, id: params.id, name, document, expectedVersion });
        if (!project) throw new HttpError(409, 'video_project_conflict', 'This project changed or is no longer available. Reload it before saving again.');
        if (videoStudioAssets && previous) {
          const retained = new Set(document.clips.map((clip) => clip.assetId).filter(Boolean));
          const obsolete = [...new Set((previous.document?.clips || []).map((clip) => clip?.assetId).filter((id) => typeof id === 'string'))].filter((id) => !retained.has(id));
          for (const id of obsolete) await videoStudioAssets.remove(caller, id).catch(() => {});
        }
        return { body: { project } };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/video-studio/projects/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (caller.actor.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to delete cloud Video Studio projects.');
        if (!store?.deleteVideoStudioProject) throw new HttpError(503, 'video_projects_unavailable', 'Cloud projects are not available yet.');
        const project = await store.getVideoStudioProject({ tenantId: caller.tenantId, userId: caller.actor.id, id: params.id });
        if (!project) throw new HttpError(404, 'not_found', 'That video project was not found.');
        const deleted = await store.deleteVideoStudioProject({ tenantId: caller.tenantId, userId: caller.actor.id, id: params.id });
        if (!deleted) throw new HttpError(404, 'not_found', 'That video project was not found.');
        if (videoStudioAssets) {
          const ids = [...new Set((project.document?.clips || []).map((clip) => clip?.assetId).filter((id) => typeof id === 'string'))];
          for (const id of ids) await videoStudioAssets.remove(caller, id).catch(() => {});
        }
        return { body: { deleted: true } };
      }
    },
    {
      method: 'POST',
      path: '/v1/video-studio/assets',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body, ip }) => {
        if (!videoStudioAssets) throw new HttpError(503, 'video_assets_unavailable', 'Cloud media storage is not configured yet.');
        return { status: 201, body: await videoStudioAssets.sign(caller, body, ip) };
      }
    },
    {
      method: 'GET',
      path: '/v1/video-studio/assets/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!videoStudioAssets) throw new HttpError(503, 'video_assets_unavailable', 'Cloud media storage is not configured yet.');
        return { body: await videoStudioAssets.readUrl(caller, params.id) };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/video-studio/assets/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!videoStudioAssets) throw new HttpError(503, 'video_assets_unavailable', 'Cloud media storage is not configured yet.');
        return { body: await videoStudioAssets.remove(caller, params.id) };
      }
    },
    {
      // Projects (src/projects.js): the signed-in person's own workspaces.
      method: 'GET',
      path: '/v1/projects',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (!projects) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await projects.list(caller) };
      }
    },
    {
      // Body: { name, description?, instructions?, status? }.
      method: 'POST',
      path: '/v1/projects',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        if (!projects) throw new HttpError(404, 'not_found', 'Not found.');
        return { status: 201, body: await projects.create(caller, body) };
      }
    },
    {
      // Puts a chat or Library item into a project, or takes it out.
      // Body: { kind: chat|file, id, project_id (null: out) }.
      method: 'POST',
      path: '/v1/project-links',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        if (!projects) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await projects.move(caller, body) };
      }
    },
    {
      method: 'GET',
      path: '/v1/projects/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!projects) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await projects.get(caller, params.id) };
      }
    },
    {
      method: 'PUT',
      path: '/v1/projects/:id',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        if (!projects) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await projects.update(caller, params.id, body) };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/projects/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!projects) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await projects.remove(caller, params.id) };
      }
    },
    {
      method: 'POST',
      path: '/v1/projects/:id/tasks',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        if (!projects) throw new HttpError(404, 'not_found', 'Not found.');
        return { status: 201, body: await projects.addTask(caller, params.id, body) };
      }
    },
    {
      method: 'PUT',
      path: '/v1/projects/:id/tasks/:taskId',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        if (!projects) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await projects.updateTask(caller, params.id, params.taskId, body) };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/projects/:id/tasks/:taskId',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!projects) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await projects.deleteTask(caller, params.id, params.taskId) };
      }
    },
    {
      // The Library: the signed-in person's own documents (src/library.js).
      method: 'GET',
      path: '/v1/library',
      scope: 'chat',
      handler: async ({ caller, req }) => {
        if (!library) throw new HttpError(404, 'not_found', 'Not found.');
        const out = await library.list(caller, new URL(req.url, 'http://local').searchParams.get('q'));
        const links = projects ? await projects.links(caller, 'file') : {};
        return { body: { ...out, files: out.files.map((f) => ({ ...f, project_id: links[f.id] || null })) } };
      }
    },
    {
      method: 'GET',
      path: '/v1/library/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!library) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await library.get(caller, params.id) };
      }
    },
    {
      // Body: { title, text, kind?, format? }. Text only (the page reads the file).
      method: 'POST',
      path: '/v1/library',
      scope: 'chat',
      body: true,
      maxBody: 1_000_000,
      handler: async ({ caller, body }) => {
        if (!library) throw new HttpError(404, 'not_found', 'Not found.');
        // Added straight into one of the person's projects (checked first).
        const pid = body && body.project_id !== undefined && body.project_id !== null ? body.project_id : null;
        if (pid !== null && !projects) throw new HttpError(404, 'not_found', 'That project was not found.');
        if (pid !== null) await projects.require(caller, pid);
        const added = await library.add(caller, body);
        if (pid !== null) await projects.linkFile(caller, pid, added.id);
        return { status: 201, body: { ...added, project_id: pid } };
      }
    },
    {
      method: 'PUT',
      path: '/v1/library/:id',
      scope: 'chat',
      body: true,
      maxBody: 1_000_000,
      handler: async ({ caller, params, body }) => {
        if (!library) throw new HttpError(404, 'not_found', 'Not found.');
        const projectLinks = projects ? await projects.links(caller, 'file').catch(() => ({})) : {};
        const projectId = projectLinks[params.id] || null;
        const updated = await library.update(caller, params.id, body);
        if (projectId && projects) await projects.linkFile(caller, projectId, updated.id);
        return { body: { ...updated, project_id: projectId } };
      }
    },
    {
      // Storage (the Library tab): everything the signed-in person keeps, how much, and for how long.
      method: 'GET',
      path: '/v1/storage',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (!storage) throw new HttpError(404, 'not_found', 'Not found.');
        const out = await storage.list(caller);
        const chatLinks = projects ? await projects.links(caller, 'chat').catch(() => ({})) : {};
        const fileLinks = projects ? await projects.links(caller, 'file').catch(() => ({})) : {};
        const link = (i) => (i.kind === 'chat' ? chatLinks[i.id] : i.kind === 'file' ? fileLinks[i.id] : undefined);
        return { body: { ...out, items: out.items.map((i) => (link(i) !== undefined || i.kind === 'chat' || i.kind === 'file' ? { ...i, project_id: link(i) || null } : i)) } };
      }
    },
    {
      // A photo or file the person sent, only for that person. Photos show inline; anything else only downloads.
      method: 'GET',
      path: '/v1/storage/sent/:id',
      scope: 'chat',
      handler: async ({ caller, params, res }) => {
        if (!storage) throw new HttpError(404, 'not_found', 'Not found.');
        const f = await storage.readSent(caller, params.id);
        const name = String(f.name).replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 100) || 'file';
        res.writeHead(200, {
          'Content-Type': f.inline ? f.mime : 'application/octet-stream',
          'Content-Length': f.bytes.length,
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Content-Disposition': `${f.inline ? 'inline' : 'attachment'}; filename="${name}"`
        });
        res.end(f.bytes);
      }
    },
    {
      // Deletes one stored item. kind: chat, file, note, reply, photo_sent, file_sent, photo_generated.
      method: 'DELETE',
      path: '/v1/storage/:kind/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!storage) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await storage.remove(caller, params.kind, params.id) };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/library/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!library) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await library.remove(caller, params.id) };
      }
    },
    {
      // In-app notices for everyone (config/notices.json). Guests hide the
      // ones they closed on their device.
      method: 'GET',
      path: '/v1/notices',
      public: true,
      handler: async ({ req }) => ({ body: { notices: notices.general(noticeWhen(req)) } })
    },
    {
      // A signed-in person's notices: their choices and closed ones applied,
      // plus their own (plan ending soon).
      method: 'GET',
      path: '/v1/notices/mine',
      scope: 'chat',
      handler: async ({ caller, req }) => {
        const when = noticeWhen(req);
        if (caller.actor.type === 'service') throw new HttpError(403, 'forbidden', 'Notices are shown to people in the app.');
        return { body: { notices: caller.actor.type === 'user' ? await notices.forUser(caller, when) : notices.general(when) } };
      }
    },
    {
      // The person closed a notice: it is not shown to them again.
      method: 'POST',
      path: '/v1/notices/:id/dismiss',
      scope: 'chat',
      handler: async ({ caller, params, req }) => {
        if (caller.actor.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to keep this choice.');
        if (!settings) throw new HttpError(503, 'settings_unavailable', 'These settings are not available right now.');
        const token = String(req.headers.authorization || '').slice(7).trim();
        await settings.dismiss(caller, token, params.id);
        return { body: { dismissed: params.id } };
      }
    },
    {
      // Settings > Usage: the caller's own numbers, read from the same counters
      // the limits are enforced with (the server stays the source of truth).
      method: 'GET',
      path: '/v1/usage',
      scope: 'chat',
      handler: async ({ caller }) => {
        const { type, id } = caller.actor;
        if (type === 'service') throw new HttpError(403, 'forbidden', 'Usage is shown to people in the app.');
        const dayStart = manilaDayStart(now()).getTime();
        const weekStart = manilaWeekStart(now()).getTime();
        const weeklyReset = new Date(weekStart + 7 * 24 * 3600 * 1000).toISOString();
        const limits = config.limits;
        const out = { plan: null, resets_at: weeklyReset, chat: null, pictures: null, hourly: null };
        if (type === 'user') {
          let activePlan = { plan: 'free', endsAt: null };
          out.hourly = { messages: limits.userMessagesHour, read_aloud: limits.userSpeechHour };
          if (plans) {
            const p = await plans.current(caller);
            activePlan = p;
            out.plan = p.open ? null : { id: p.plan, ends_at: p.endsAt };
          }
          const paidLimits = { pro: limits.proWeeklyTokens, max: limits.maxWeeklyTokens, ultra: limits.ultraWeeklyTokens };
          const paidLimit = paidLimits[activePlan.plan];
          if (Number.isSafeInteger(paidLimit)) {
            const used = await store.tokensSince({ since: new Date(weekStart), tenantId: caller.tenantId, actorType: 'user', actorId: id });
            out.chat = { used: Math.min(used, paidLimit), limit: paidLimit, unit: 'tokens', period: 'week', reset_at: weeklyReset, exhausted: used >= paidLimit };
          } else {
            const used = await store.tokensSince({ since: new Date(weekStart), tenantId: caller.tenantId, actorType: 'user', actorId: id });
            out.chat = { used, limit: 0, unit: 'tokens', period: 'unlimited', reset_at: null, exhausted: false };
          }
        } else {
          out.hourly = { messages: limits.guestMessagesHour, read_aloud: limits.guestSpeechHour };
          // Guests share a pool, so do not imply a personal usage allowance.
          out.chat = null;
          out.resets_at = new Date(dayStart + 24 * 3600 * 1000).toISOString();
        }
        if (images && images.available) out.pictures = await images.usage(caller);
        return { body: out };
      }
    },
    {
      // Settings > Billing: the caller's plan and their own plan payments.
      // Only what PayMongo told us is stored: plan, dates, amount. No card data.
      method: 'GET',
      path: '/v1/billing',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (caller.actor.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to see billing.');
        if (!plans || !config.plans.enabled) return { body: { enabled: false, plan: null, payments: [] } };
        const p = await plans.current(caller);
        const rows = await store.listPlanPeriods({ tenantId: caller.tenantId, userId: caller.actor.id });
        const payments = rows.map((r) => ({
          id: r.id,
          plan: r.plan, starts_at: r.starts_at, ends_at: r.ends_at,
          term: Date.parse(r.ends_at) - Date.parse(r.starts_at) >= 360 * 86_400_000 ? 'annual' : 'period',
          amount: Number.isInteger(r.amount) ? r.amount / 100 : null, currency: r.currency || null,
          paid_at: r.created_at || r.starts_at, via: r.provider === 'paymongo' ? 'PayMongo' : null,
          receipt_available: r.provider === 'paymongo' && Boolean(r.id)
        })).reverse();
        return { body: { enabled: true, plan: { id: p.plan, ends_at: p.endsAt }, payments } };
      }
    },
    {
      // Settings > Billing: one payment receipt, owned by the signed-in account.
      method: 'GET',
      path: '/v1/billing/receipts/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (caller.actor.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to view a receipt.');
        if (!plans || !config.plans.enabled) throw new HttpError(404, 'not_found', 'Receipt not found.');
        const id = String(params.id || '');
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
          throw new HttpError(404, 'not_found', 'Receipt not found.');
        }
        const rows = await store.listPlanPeriods({ tenantId: caller.tenantId, userId: caller.actor.id });
        const r = rows.find((x) => x.id === id);
        if (!r || r.provider !== 'paymongo' || !r.amount || !r.currency) throw new HttpError(404, 'not_found', 'Receipt not found.');
        return { body: {
          id: r.id,
          receipt_number: r.provider_ref ? 'NSR-' + String(r.provider_ref).replace(/^cs_/, '').slice(0, 24).toUpperCase() : 'NSR-' + r.id.slice(0, 8).toUpperCase(),
          provider_reference: r.provider_ref || null,
          plan: r.plan,
          starts_at: r.starts_at,
          ends_at: r.ends_at,
          paid_at: r.created_at || r.starts_at,
          amount: r.amount / 100,
          currency: r.currency,
          via: 'PayMongo'
        } };
      }
    },
    {
      // Settings > Privacy: the signed-in person's own preferences.
      method: 'GET',
      path: '/v1/settings',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (!settings) throw new HttpError(503, 'settings_unavailable', 'These settings are not available right now.');
        return { body: { prefs: settings.get(caller) } };
      }
    },
    {
      method: 'PUT',
      path: '/v1/settings',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body, req }) => {
        if (!settings) throw new HttpError(503, 'settings_unavailable', 'These settings are not available right now.');
        const token = String(req.headers.authorization || '').slice(7).trim();
        const prefs = await settings.update(caller, token, body);
        // A new keep-time takes effect straight away.
        if (storage && body && typeof body === 'object' && 'retention' in body) await storage.sweep({ ...caller, prefs }, { force: true });
        return { body: { prefs } };
      }
    },
    {
      // Deletes all of the caller's conversations (and their pictures).
      method: 'DELETE',
      path: '/v1/conversations',
      scope: 'chat',
      handler: async ({ caller }) => ({ body: await legal.deleteAllChats(caller) })
    },
    {
      // A business's knowledge documents (Phase 7): its secret key with the 'knowledge' scope.
      method: 'GET',
      path: '/v1/knowledge',
      scope: 'knowledge',
      handler: async ({ caller }) => {
        if (!knowledge) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: { documents: await knowledge.manage.list(caller) } };
      }
    },
    {
      method: 'POST',
      path: '/v1/knowledge',
      scope: 'knowledge',
      body: true,
      maxBody: 512 * 1024,
      handler: async ({ caller, body }) => {
        if (!knowledge) throw new HttpError(404, 'not_found', 'Not found.');
        return { status: 201, body: { document: await knowledge.manage.add(caller, body) } };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/knowledge/:id',
      scope: 'knowledge',
      handler: async ({ caller, params }) => {
        if (!knowledge) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await knowledge.manage.remove(caller, params.id) };
      }
    },
    {
      // What Nasrin remembers about the signed-in person.
      method: 'GET',
      path: '/v1/memories',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (!memory) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: { memories: await memory.list(caller) } };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/memories',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (!memory) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await memory.removeAll(caller) };
      }
    },
    {
      // Edit a note. Body: { text }.
      method: 'PUT',
      path: '/v1/memories/:id',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        if (!memory) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await memory.update(caller, params.id, body.text) };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/memories/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!memory) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await memory.remove(caller, params.id) };
      }
    },
    {
      // The person confirms or cancels an action the model proposed. Body: { token }.
      method: 'POST',
      path: '/v1/actions/confirm',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body, ip }) => {
        if (!confirmations) throw new HttpError(404, 'not_found', 'Not found.');
        await limiter.message(caller, ip);
        return { body: await confirmations.confirm(caller, body.token) };
      }
    },
    {
      method: 'POST',
      path: '/v1/actions/cancel',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        if (!confirmations) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await confirmations.cancel(caller, body.token) };
      }
    },
    {
      // A business's Facebook Pages (Messenger): its secret key with the 'connectors' scope.
      method: 'GET',
      path: '/v1/channels/facebook',
      scope: 'connectors',
      handler: async ({ caller }) => {
        if (!facebook) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: { pages: await facebook.manage.list(caller) } };
      }
    },
    {
      method: 'PUT',
      path: '/v1/channels/facebook',
      scope: 'connectors',
      body: true,
      handler: async ({ caller, body }) => {
        if (!facebook) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: { page: await facebook.manage.put(caller, body) } };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/channels/facebook/:page_id',
      scope: 'connectors',
      handler: async ({ caller, params }) => {
        if (!facebook) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await facebook.manage.remove(caller, params.page_id) };
      }
    },
    {
      // A business's connectors (Phase 6): its secret key with the 'connectors' scope.
      method: 'GET',
      path: '/v1/connectors',
      scope: 'connectors',
      handler: async ({ caller }) => {
        if (!connectors) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: { connectors: await connectors.list(caller) } };
      }
    },
    {
      method: 'PUT',
      path: '/v1/connectors/:name',
      scope: 'connectors',
      body: true,
      handler: async ({ caller, params, body }) => {
        if (!connectors) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: { connector: await connectors.put(caller, params.name, body) } };
      }
    },
    {
      // A connector's webhook: POST turns it on (new secret, shown once), DELETE off.
      method: 'POST',
      path: '/v1/connectors/:name/webhook',
      scope: 'connectors',
      handler: async ({ caller, params }) => {
        if (!connectors) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await connectors.webhook(caller, params.name, true) };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/connectors/:name/webhook',
      scope: 'connectors',
      handler: async ({ caller, params }) => {
        if (!connectors) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await connectors.webhook(caller, params.name, false) };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/connectors/:name',
      scope: 'connectors',
      handler: async ({ caller, params }) => {
        if (!connectors) throw new HttpError(404, 'not_found', 'Not found.');
        return { body: await connectors.remove(caller, params.name) };
      }
    },
    {
      // Plans a picture: adaptive questions, then the creative brief.
      // Body: { prompt, photo?, answers? }.
      method: 'POST',
      path: '/v1/images/brief',
      scope: 'chat',
      body: true,
      maxBody: Math.ceil(inlineBytes * 1.37) + 64 * 1024,
      handler: async ({ caller, body, ip }) => {
        if (!images) throw new HttpError(503, 'images_unavailable', 'Picture creation is not available yet.');
        return { body: await images.brief(caller, body, ip) };
      }
    },
    {
      // Makes one picture. Body: { prompt, photo?, brief?, conversation_id? }.
      method: 'POST',
      path: '/v1/images',
      scope: 'chat',
      body: true,
      maxBody: Math.ceil(inlineBytes * 1.37) + 64 * 1024,
      handler: async ({ caller, body, ip }) => {
        if (!images) throw new HttpError(503, 'images_unavailable', 'Picture creation is not available yet.');
        return { body: await images.create(caller, body, ip) };
      }
    },
    {
      // A picture, only for the person who made it.
      method: 'GET',
      path: '/v1/images/:id',
      scope: 'chat',
      handler: async ({ caller, params, res }) => {
        if (!images) throw new HttpError(404, 'not_found', 'Not found.');
        const img = await images.read(caller, params.id);
        res.writeHead(200, { 'Content-Type': img.mime, 'Content-Length': img.bytes.length, 'Cache-Control': 'private, max-age=86400', 'Content-Disposition': `inline; filename="nasrin-${params.id.slice(0, 8)}.${img.mime.split('/')[1]}"` });
        res.end(img.bytes);
      }
    },
    {
      // A browser recording made by render-and-test (src/github/browser-runner.js),
      // only for the person it belongs to. Not tied to a video plan.
      method: 'GET',
      path: '/v1/recordings/:id',
      scope: 'chat',
      handler: async ({ caller, params, res }) => {
        if (caller.actor.type !== 'user' || !store?.getVideo) throw new HttpError(404, 'not_found', 'Not found.');
        const v = await store.getVideo({ tenantId: caller.tenantId, ownerType: caller.actor.type, ownerId: caller.actor.id, id: params.id });
        if (!v || v.provider !== 'browser' || v.status !== 'completed' || !v.bytes) throw new HttpError(404, 'not_found', 'Not found.');
        const mime = v.mime === 'video/mp4' ? 'video/mp4' : 'video/webm';
        res.writeHead(200, { 'Content-Type': mime, 'Content-Length': v.bytes.length, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `inline; filename="nasrin-recording-${v.id.slice(0, 8)}.${mime.split('/')[1]}"` });
        res.end(v.bytes);
      }
    },
    {
      method: 'GET',
      path: '/v1/video-studio/elevenlabs/status',
      scope: 'chat',
      handler: async ({ caller }) => {
        let connected = false;
        if (caller.actor?.type === 'user' && store?.getProviderCredential) {
          try { connected = Boolean(await store.getProviderCredential({ tenantId: caller.tenantId, ownerId: caller.actor.id, provider: 'elevenlabs' })); } catch {}
        }
        return { body: { configured: connected, connected, provider: 'elevenlabs', capabilities: connected ? ['voices', 'voiceover', 'sound_effects'] : [], video_export_available: Boolean(videoStudioExporter?.available) } };
      }
    },
    {
      method: 'PUT', path: '/v1/video-studio/elevenlabs/connection', scope: 'chat', body: true, maxBody: 8 * 1024,
      handler: async ({ caller, body }) => {
        await requireVideoStudioAccess(caller);
        if (caller.actor?.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to connect your ElevenLabs account.');
        if (!store?.saveProviderCredential || !store?.getProviderCredential) throw new HttpError(503, 'provider_credentials_unavailable', 'Personal provider connections are not available yet.');
        let encrypted; try { encrypted = encryptElevenLabsCredential(body?.api_key); } catch { throw new HttpError(400, 'invalid_elevenlabs_key', 'Enter a valid ElevenLabs API key.'); }
        const candidate = elevenlabs?.forApiKey ? elevenlabs.forApiKey(body.api_key) : createElevenLabs({ apiKey: body.api_key });
        try { await candidate.voices(); } catch { throw new HttpError(400, 'elevenlabs_key_validation_failed', 'ElevenLabs could not validate this key. Check the key and its permissions.'); }
        try { await store.saveProviderCredential({ tenantId: caller.tenantId, ownerId: caller.actor.id, provider: 'elevenlabs', ...encrypted }); }
        catch { throw new HttpError(503, 'provider_credentials_unavailable', 'Could not save your encrypted provider connection.'); }
        return { body: { connected: true, provider: 'elevenlabs' } };
      }
    },
    {
      method: 'DELETE', path: '/v1/video-studio/elevenlabs/connection', scope: 'chat',
      handler: async ({ caller }) => {
        await requireVideoStudioAccess(caller);
        if (caller.actor?.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to manage your ElevenLabs connection.');
        if (!store?.deleteProviderCredential) throw new HttpError(503, 'provider_credentials_unavailable', 'Personal provider connections are not available yet.');
        await store.deleteProviderCredential({ tenantId: caller.tenantId, ownerId: caller.actor.id, provider: 'elevenlabs' });
        return { body: { connected: false } };
      }
    },
    {
      method: 'GET',
      path: '/v1/video-studio/elevenlabs/voices',
      scope: 'chat',
      handler: async ({ caller }) => {
        const audio = await requirePersonalElevenLabs(caller);
        return { body: { voices: await audio.voices() } };
      }
    },
    {
      method: 'POST',
      path: '/v1/video-studio/elevenlabs/voiceover',
      scope: 'chat',
      body: true,
      maxBody: 32 * 1024,
      handler: async ({ caller, body }) => {
        const audio = await requirePersonalElevenLabs(caller);
        if (!store?.createVideoStudioAudioAsset) throw new HttpError(503, 'audio_storage_unavailable', 'Persistent audio storage is not available yet. Apply the Video Studio audio migration and verify private media storage.');
        const projectId = body?.project_id || null;
        if (projectId) await requireVideoStudioProject(caller, projectId);
        await limiter.signIn('elevenlabs-audio:' + caller.actor.id, config.video?.perHour || 10);
        const started = now();
        const bytes = await audio.voiceover({ text: body?.text, voiceId: body?.voice_id, modelId: body?.model_id });
        const asset = await store.createVideoStudioAudioAsset({
          tenantId: caller.tenantId, ownerType: 'user', ownerId: caller.actor.id, projectId,
          kind: 'voiceover', bytes, voiceId: body?.voice_id, modelId: body?.model_id || 'eleven_multilingual_v2',
          label: typeof body?.label === 'string' ? body.label : 'AI voiceover'
        });
        await usageLog?.record?.(caller, { provider: 'elevenlabs', model: body?.model_id || 'eleven_multilingual_v2', outcome: 'ok', task: 'video_voiceover', latencyMs: now() - started });
        return { status: 201, body: { asset: publicAudioAsset(asset) } };
      }
    },
    {
      method: 'POST',
      path: '/v1/video-studio/elevenlabs/sound-effects',
      scope: 'chat',
      body: true,
      maxBody: 8 * 1024,
      handler: async ({ caller, body }) => {
        const audio = await requirePersonalElevenLabs(caller);
        if (!store?.createVideoStudioAudioAsset) throw new HttpError(503, 'audio_storage_unavailable', 'Persistent audio storage is not available yet. Apply the Video Studio audio migration and verify private media storage.');
        const projectId = body?.project_id || null;
        if (projectId) await requireVideoStudioProject(caller, projectId);
        await limiter.signIn('elevenlabs-audio:' + caller.actor.id, config.video?.perHour || 10);
        const started = now();
        const bytes = await audio.soundEffect({ prompt: body?.prompt, durationSeconds: body?.duration_seconds });
        const asset = await store.createVideoStudioAudioAsset({
          tenantId: caller.tenantId, ownerType: 'user', ownerId: caller.actor.id, projectId,
          kind: 'sound_effect', bytes, label: typeof body?.label === 'string' ? body.label : 'Sound effect'
        });
        await usageLog?.record?.(caller, { provider: 'elevenlabs', model: 'sound-generation', outcome: 'ok', task: 'video_sound_effect', latencyMs: now() - started });
        return { status: 201, body: { asset: publicAudioAsset(asset) } };
      }
    },
    {
      method: 'GET',
      path: '/v1/video-studio/audio-assets',
      scope: 'chat',
      handler: async ({ caller }) => {
        await requireVideoStudioAccess(caller);
        if (!store?.listVideoStudioAudioAssets) throw new HttpError(503, 'audio_storage_unavailable', 'Video Studio audio storage is not available yet.');
        const assets = await store.listVideoStudioAudioAssets({ tenantId: caller.tenantId, ownerId: caller.actor.id });
        return { body: { assets: assets.map(publicAudioAsset) } };
      }
    },
    {
      method: 'GET',
      path: '/v1/video-studio/audio-assets/:id/content',
      scope: 'chat',
      handler: async ({ caller, params, res }) => {
        await requireVideoStudioAccess(caller);
        const asset = await store?.readVideoStudioAudioAsset?.({ tenantId: caller.tenantId, ownerId: caller.actor.id, id: params.id });
        if (!asset) throw new HttpError(404, 'not_found', 'Audio asset not found.');
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': asset.bytes.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="nasrinai-audio.mp3"' });
        res.end(asset.bytes);
      }
    },
    {
      method: 'DELETE',
      path: '/v1/video-studio/audio-assets/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        await requireVideoStudioAccess(caller);
        const removed = await store?.deleteVideoStudioAudioAsset?.({ tenantId: caller.tenantId, ownerId: caller.actor.id, id: params.id });
        if (!removed) throw new HttpError(404, 'not_found', 'Audio asset not found.');
        return { body: { deleted: true, id: params.id } };
      }
    },
    {
      method: 'GET',
      path: '/v1/video-studio/timeline',
      scope: 'chat',
      handler: async ({ caller, req }) => {
        await requireVideoStudioAccess(caller);
        const projectId = new URL(req.url, 'http://local').searchParams.get('project_id');
        await requireVideoStudioProject(caller, projectId);
        if (!store?.listVideoStudioTimelineItems || !store?.getVideoStudioAudioAsset) throw new HttpError(503, 'audio_storage_unavailable', 'Video Studio timeline storage is not available yet.');
        const items = await store.listVideoStudioTimelineItems({ tenantId: caller.tenantId, ownerId: caller.actor.id, projectId });
        const enriched = await Promise.all(items.map(async item => {
          const asset = await store.getVideoStudioAudioAsset({ tenantId: caller.tenantId, ownerId: caller.actor.id, id: item.audioAssetId });
          return { ...item, asset: asset ? publicAudioAsset(asset) : null };
        }));
        return { body: { project_id: projectId, items: enriched } };
      }
    },
    {
      method: 'POST',
      path: '/v1/video-studio/timeline',
      scope: 'chat',
      body: true,
      maxBody: 8 * 1024,
      handler: async ({ caller, body }) => {
        await requireVideoStudioAccess(caller);
        const projectId = body?.project_id;
        await requireVideoStudioProject(caller, projectId);
        const asset = await store?.getVideoStudioAudioAsset?.({ tenantId: caller.tenantId, ownerId: caller.actor.id, id: body?.audio_asset_id });
        if (!asset) throw new HttpError(404, 'not_found', 'Audio asset not found.');
        const values = timelineInput(body, true);
        try {
          const item = await store.addVideoStudioTimelineItem({ tenantId: caller.tenantId, ownerId: caller.actor.id, projectId,
            audioAssetId: asset.id, ...values });
          return { status: 201, body: { item: { ...item, asset: publicAudioAsset(asset) } } };
        } catch (err) {
          if (err instanceof HttpError) throw err;
          if (/already on this timeline|duplicate key/i.test(String(err?.message))) throw new HttpError(409, 'audio_already_on_timeline', 'This audio asset is already on the selected timeline.');
          throw err;
        }
      }
    },
    {
      method: 'PATCH',
      path: '/v1/video-studio/timeline/:id',
      scope: 'chat',
      body: true,
      maxBody: 8 * 1024,
      handler: async ({ caller, params, body }) => {
        await requireVideoStudioAccess(caller);
        const projectId = body?.project_id;
        await requireVideoStudioProject(caller, projectId);
        const patch = timelineInput(body, false);
        if (!Object.keys(patch).length) throw new HttpError(400, 'invalid_timeline_patch', 'Provide at least one timeline field to update.');
        const item = await store?.updateVideoStudioTimelineItem?.({ tenantId: caller.tenantId, ownerId: caller.actor.id, projectId, id: params.id, patch });
        if (!item) throw new HttpError(404, 'not_found', 'Timeline item not found.');
        const asset = await store.getVideoStudioAudioAsset({ tenantId: caller.tenantId, ownerId: caller.actor.id, id: item.audioAssetId });
        return { body: { item: { ...item, asset: publicAudioAsset(asset) } } };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/video-studio/timeline/:id',
      scope: 'chat',
      handler: async ({ caller, params, req }) => {
        await requireVideoStudioAccess(caller);
        const projectId = new URL(req.url, 'http://local').searchParams.get('project_id');
        await requireVideoStudioProject(caller, projectId);
        const removed = await store?.deleteVideoStudioTimelineItem?.({ tenantId: caller.tenantId, ownerId: caller.actor.id, projectId, id: params.id });
        if (!removed) throw new HttpError(404, 'not_found', 'Timeline item not found.');
        return { body: { deleted: true, id: params.id } };
      }
    },
    {
      // Server-side composition render for the full visual timeline. Only owner-scoped
      // video IDs and private media asset IDs are resolved; arbitrary URLs are never fetched.
      method: 'POST',
      path: '/v1/video-studio/render-timeline',
      scope: 'chat',
      body: true,
      maxBody: 64 * 1024,
      handler: async ({ caller, body }) => {
        await requireVideoStudioAccess(caller);
        if (!videoStudioRenderWorker?.enabled || !videoStudioRenderWorker.enqueueTimeline) throw new HttpError(503, 'video_render_unavailable', 'The server-side timeline renderer is not configured.');
        if (!store?.getVideoStudioProject || !videoStudioAssets?.read || !videos?.read) throw new HttpError(503, 'video_render_unavailable', 'Video Studio media storage is not ready.');
        const projectId = body?.project_id;
        const project = await store.getVideoStudioProject({ tenantId: caller.tenantId, userId: caller.actor.id, id: projectId });
        if (!project) throw new HttpError(404, 'not_found', 'Video Studio project not found.');
        await limiter.signIn('video-studio-render:' + caller.actor.id, config.video?.perHour || 10);
        const rawClips = body?.clips;
        if (!Array.isArray(rawClips) || rawClips.length < 1 || rawClips.length > 30) throw new HttpError(400, 'video_timeline_limit', 'Add between one and 30 timeline clips before rendering.');
        const mediaAssets = [];
        let totalMediaBytes = 0;
        const pushMedia = (asset) => {
          if (!asset?.bytes?.length || totalMediaBytes + asset.bytes.length > 100 * 1024 * 1024) throw new HttpError(413, 'video_render_input_total_size', 'The combined timeline media exceeds the 100 MB server-render limit.');
          totalMediaBytes += asset.bytes.length;
          mediaAssets.push(asset);
          return mediaAssets.length - 1;
        };
        const clips = [];
        for (const raw of rawClips) {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpError(400, 'video_timeline_invalid', 'A timeline clip is invalid.');
          const track = ['video','overlay','text','audio'].includes(raw.track) ? raw.track : 'video';
          let mediaIndex = null, mediaType = typeof raw.mediaType === 'string' ? raw.mediaType.slice(0,100) : '';
          if (raw.videoId) {
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.videoId)) throw new HttpError(400, 'invalid_video_id', 'A generated video clip identifier is invalid.');
            const asset = await videos.read(caller, raw.videoId);
            mediaIndex = pushMedia({ bytes: asset.bytes, mime: 'video/mp4' }); mediaType = 'video/mp4';
          } else if (raw.assetId) {
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.assetId)) throw new HttpError(400, 'invalid_asset_id', 'A timeline media identifier is invalid.');
            const asset = await videoStudioAssets.read(caller, raw.assetId);
            mediaIndex = pushMedia({ bytes: asset.bytes, mime: asset.mime }); mediaType = asset.mime;
          } else if (track !== 'text' && !(track === 'overlay' && String(raw.title || '').trim())) {
            throw new HttpError(400, 'video_asset_required', 'Save your project and upload or generate every video, image, and audio clip before server rendering.');
          }
          clips.push({
            name: raw.name, title: raw.title, kind: raw.kind, track, mediaIndex, mediaType,
            position: raw.position, duration: raw.duration, start: raw.start,
            transition: raw.transition, filter: raw.filter, opacity: raw.opacity, gain: raw.gain, keyframes: raw.keyframes
          });
        }
        // Include the separately saved AI voiceover/sound-effect timeline, if selected.
        const audioProjectId = body?.audio_project_id;
        if (audioProjectId) {
          if (!store?.listVideoStudioTimelineItems || !store?.readVideoStudioAudioAsset) throw new HttpError(503, 'video_audio_unavailable', 'Saved audio timeline storage is not ready.');
          const audioItems = await store.listVideoStudioTimelineItems({ tenantId: caller.tenantId, ownerId: caller.actor.id, projectId: audioProjectId });
          if (audioItems.length > 8) throw new HttpError(400, 'video_timeline_limit', 'The saved audio timeline supports up to eight clips.');
          for (const item of audioItems) {
            const asset = await store.readVideoStudioAudioAsset({ tenantId: caller.tenantId, ownerId: caller.actor.id, id: item.audioAssetId });
            if (!asset) throw new HttpError(404, 'audio_asset_missing', 'A saved audio clip could not be found.');
            const mediaIndex = pushMedia({ bytes: asset.bytes, mime: 'audio/mpeg' });
            clips.push({
              name: asset.label || 'Audio clip', title: '', track: 'audio', mediaIndex, mediaType: 'audio/mpeg',
              position: Number(item.startSeconds) || 0,
              duration: Math.max(.1, Number(item.trimEndSeconds) > Number(item.trimStartSeconds) ? Number(item.trimEndSeconds) - Number(item.trimStartSeconds) : Number(asset.durationSeconds) || 8),
              start: Number(item.trimStartSeconds) || 0, gain: (Number(item.gain) || 0) * 100, transition: 'cut', filter: 'none', opacity: 100
            });
          }
        }
        try {
          return { status: 202, body: await videoStudioRenderWorker.enqueueTimeline(caller, {
            projectId, aspect: body?.aspect, clips, mediaAssets, idempotencyKey: body?.idempotency_key || null
          }) };
        } catch (err) {
          if (err instanceof HttpError) throw err;
          if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 600) throw new HttpError(err.status, err.code || 'video_render_rejected', err.message || 'The render request could not be accepted.');
          throw err;
        }
      }
    },
    {
      // Enqueue a durable MP4 render. Inputs are snapshotted to private storage
      // before returning, so browser disconnects cannot cancel the render.
      method: 'POST',
      path: '/v1/video-studio/render-jobs',
      scope: 'chat',
      body: true,
      maxBody: 8 * 1024,
      handler: async ({ caller, body }) => {
        await requireVideoStudioAccess(caller);
        if (!videoStudioRenderWorker?.enabled) throw new HttpError(503, 'video_render_unavailable', 'The server-side Video Studio renderer is not configured yet.');
        if (!videos?.read || !store?.listVideoStudioTimelineItems || !store?.readVideoStudioAudioAsset) {
          throw new HttpError(503, 'video_render_unavailable', 'Video Studio render storage is not ready yet.');
        }
        const projectId = body?.project_id;
        await requireVideoStudioProject(caller, projectId);
        await limiter.signIn('video-studio-render:' + caller.actor.id, config.video?.perHour || 10);
        const video = await videos.read(caller, body?.video_id);
        const items = await store.listVideoStudioTimelineItems({ tenantId: caller.tenantId, ownerId: caller.actor.id, projectId });
        if (!items.length) throw new HttpError(400, 'video_timeline_empty', 'Add at least one audio clip to the project timeline before rendering.');
        if (items.length > 8) throw new HttpError(400, 'video_timeline_limit', 'Render supports up to eight audio clips at a time.');
        const audioAssets = await Promise.all(items.map(item => store.readVideoStudioAudioAsset({
          tenantId: caller.tenantId, ownerId: caller.actor.id, id: item.audioAssetId
        })));
        if (audioAssets.some(asset => !asset)) throw new HttpError(404, 'audio_asset_missing', 'A timeline audio asset could not be found. Remove the missing clip and try again.');
        try {
          return { status: 202, body: await videoStudioRenderWorker.enqueue(caller, {
            projectId, videoId: video.id, videoBytes: video.bytes,
            durationSeconds: video.producedSeconds || video.targetSeconds,
            timelineItems: items, audioAssets, idempotencyKey: body?.idempotency_key || null
          }) };
        } catch (err) {
          if (err instanceof HttpError) throw err;
          if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 600) {
            throw new HttpError(err.status, err.code || 'video_render_rejected', err.message || 'The render request could not be accepted.');
          }
          throw err;
        }
      }
    },
    {
      method: 'GET',
      path: '/v1/video-studio/render-jobs/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        await requireVideoStudioAccess(caller);
        if (!videoStudioRenderWorker?.enabled) throw new HttpError(503, 'video_render_unavailable', 'The server-side Video Studio renderer is not configured yet.');
        try { return { body: await videoStudioRenderWorker.status(caller, params.id) }; }
        catch (err) {
          if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 600) throw new HttpError(err.status, err.code || 'render_status_failed', err.message);
          throw err;
        }
      }
    },
    {
      method: 'GET',
      path: '/v1/video-studio/render-jobs/:id/content',
      scope: 'chat',
      handler: async ({ caller, params, res }) => {
        await requireVideoStudioAccess(caller);
        if (!videoStudioRenderWorker?.enabled) throw new HttpError(503, 'video_render_unavailable', 'The server-side Video Studio renderer is not configured yet.');
        let output;
        try { output = await videoStudioRenderWorker.readOutput(caller, params.id); }
        catch (err) {
          if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 600) throw new HttpError(err.status, err.code || 'render_download_failed', err.message);
          throw err;
        }
        res.writeHead(200, {
          'Content-Type': 'video/mp4', 'Content-Length': output.bytes.length,
          'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': 'attachment; filename="nasrinai-video-studio-' + output.id.slice(0, 8) + '.mp4"'
        });
        res.end(output.bytes);
      }
    },
    {
      method: 'POST',
      path: '/v1/video-studio/export',
      scope: 'chat',
      body: true,
      maxBody: 8 * 1024,
      handler: async ({ caller, body, res }) => {
        await requireVideoStudioAccess(caller);
        if (!videoStudioExporter?.available) throw new HttpError(503, 'video_export_unavailable', 'Video export is not available on this server yet.');
        if (!videos?.read || !store?.listVideoStudioTimelineItems || !store?.readVideoStudioAudioAsset) {
          throw new HttpError(503, 'video_export_unavailable', 'Video Studio export storage is not ready yet.');
        }
        const projectId = body?.project_id;
        await requireVideoStudioProject(caller, projectId);
        await limiter.signIn('video-studio-export:' + caller.actor.id, config.video?.perHour || 10);
        const video = await videos.read(caller, body?.video_id);
        const items = await store.listVideoStudioTimelineItems({
          tenantId: caller.tenantId, ownerId: caller.actor.id, projectId
        });
        if (!items.length) throw new HttpError(400, 'video_timeline_empty', 'Add at least one audio clip to this project timeline before exporting.');
        if (items.length > 8) throw new HttpError(400, 'video_timeline_limit', 'Export supports up to eight audio clips at a time.');
        const audioAssets = await Promise.all(items.map(item => store.readVideoStudioAudioAsset({
          tenantId: caller.tenantId, ownerId: caller.actor.id, id: item.audioAssetId
        })));
        if (audioAssets.some(asset => !asset)) throw new HttpError(404, 'audio_asset_missing', 'A timeline audio asset could not be found. Remove the missing clip and try again.');
        const started = now();
        try {
          const output = await videoStudioExporter.exportWithAudio({
            videoBytes: video.bytes,
            durationSeconds: video.producedSeconds || video.targetSeconds,
            timelineItems: items,
            audioAssets
          });
          await usageLog?.record?.(caller, { provider: 'ffmpeg', model: 'video-studio-mix', outcome: 'ok', task: 'video_studio_export', latencyMs: now() - started });
          res.writeHead(200, {
            'Content-Type': 'video/mp4', 'Content-Length': output.length,
            'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
            'Content-Disposition': 'attachment; filename="nasrinai-video-with-audio.mp4"'
          });
          res.end(output);
        } catch (err) {
          try { await usageLog?.record?.(caller, { provider: 'ffmpeg', model: 'video-studio-mix', outcome: 'error', task: 'video_studio_export', latencyMs: now() - started }); } catch {}
          throw err;
        }
      }
    },
    {
      // Starts an Ultra-only asynchronous MP4 video job.
      method: 'POST',
      path: '/v1/videos',
      scope: 'chat',
      body: true,
      maxBody: 512 * 1024,
      handler: async ({ caller, body }) => {
        if (!videos) throw new HttpError(503, 'videos_unavailable', 'Video creation is not available yet.');
        if (body?.conversation_id) await conversations.get(caller, body.conversation_id);
        return { status: 202, body: await videos.create(caller, body) };
      }
    },
    {
      // Polls an Ultra video job. Polling advances chained Veo extensions server-side.
      method: 'GET',
      path: '/v1/videos/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!videos) throw new HttpError(503, 'videos_unavailable', 'Video creation is not available yet.');
        return { body: await videos.status(caller, params.id) };
      }
    },
    {
      // Final MP4, only for its owner.
      method: 'GET',
      path: '/v1/videos/:id/content',
      scope: 'chat',
      handler: async ({ caller, params, res }) => {
        if (!videos) throw new HttpError(503, 'videos_unavailable', 'Video creation is not available yet.');
        const v = await videos.read(caller, params.id);
        res.writeHead(200, { 'Content-Type': v.mime || 'video/mp4', 'Content-Length': v.bytes.length, 'Cache-Control': 'private, max-age=86400', 'Content-Disposition': `attachment; filename="nasrin-video-${v.id.slice(0, 8)}.mp4"` });
        res.end(v.bytes);
      }
    },
    {
      // Owner-only quota diagnostic. The token is a separate, high-entropy
      // secret stored in Vercel; never return it or any other secret.
      method: 'GET',
      path: '/v1/owner/quota-config',
      scope: 'chat',
      handler: async ({ caller, req }) => {
        const expected = String(config.ownerDiagnosticsToken || '');
        const supplied = String(req.headers['x-owner-diagnostics-token'] || '');
        if (!expected || caller.actor.type !== 'user' || supplied.length !== expected.length ||
            supplied.length > 512 || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
          throw new HttpError(404, 'not_found', 'Not found.');
        }
        return { body: {
          deployment_environment: config.deploymentEnvironment,
          plans_enabled: config.plans.enabled,
          effective_limits: {
            pro_weekly_tokens: config.limits.proWeeklyTokens,
            max_weekly_tokens: config.limits.maxWeeklyTokens,
            ultra_weekly_tokens: config.limits.ultraWeeklyTokens,
            max_daily_tokens_legacy: config.limits.maxDailyTokens,
            ultra_daily_tokens_legacy: config.limits.ultraDailyTokens
          },
          source: 'server-startup environment configuration',
          note: 'Paid-plan fallback uses weekly token limits. The daily fields are legacy configuration and do not set the Ultra weekly allowance.'
        } };
      }
    },
    {
      // The plans (Free, Max, Ultra), their prices, and the caller's plan.
      method: 'GET',
      path: '/v1/plans',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (!plans) return { body: { enabled: false, current: null, ends_at: null, plans: [] } };
        return { body: await plans.describe(caller, { purchasable: Boolean(payments) && caller.actor.type === 'user' }) };
      }
    },
    {
      // The models this caller may choose, and the default.
      method: 'GET',
      path: '/v1/models',
      scope: 'chat',
      handler: async ({ caller }) => {
        // Guests also see the tiers that need sign-in, marked locked, when sign-in exists.
        const signIn = Boolean(auth) && (config.auth.email || config.auth.google);
        const plan = plans ? await plans.planFor(caller) : 'ultra';
        const list = models ? await models.listFor(caller, { showLocked: signIn || (plans && config.plans.enabled), plan }) : { models: [], default: null };
        return { body: { models: list.models, default: list.default } };
      }
    },
    {
      // What the chat page needs to tell people honestly: is the AI on, and
      // does a message leave this server to reach it? Nothing more.
      method: 'GET',
      path: '/v1/status',
      public: true,
      handler: async () => ({
        body: {
          ai_available: await modelReady(),
          external_model: provider ? provider.capabilities().dataLeavesServer : null,
          own_model: provider ? provider.capabilities().local === true && provider.id !== 'fake' : null,
          redacts_contact_details: Boolean(provider && provider.capabilities().dataLeavesServer && config.ai.redactExternal),
          // Which files the model can read. Text files always work.
          files: {
            photos: Boolean(provider) && provider.capabilities().vision !== false,
            pdfs: Boolean(provider) && provider.capabilities().pdf !== false
          },
          legal: { terms_version: config.legal.terms, privacy_version: config.legal.privacy },
          // GitHub plugin: on, or a short code for the missing setting (never a value).
          github: config.github ? { available: true } : { available: false, off: config.githubOff || 'not_set' },
          plans: Boolean(plans) && config.plans.enabled,
          library: Boolean(library) && config.library?.enabled === true,
          projects: Boolean(projects) && config.projects?.enabled === true,
          research: Boolean(research),
          uploads: uploads ? { direct: true, max_mb: Math.round(uploads.maxBytes / 1048576) } : { direct: false },
          images: images && images.available ? { available: true, per_guest: config.images.perGuest, per_user_day: config.images.perUserDay } : { available: false },
          videos: videos && videos.available ? { available: true, ultra_only: true, max_seconds: config.video.maxSeconds } : { available: false },
          sign_in: { email: Boolean(auth) && config.auth.email, google: Boolean(auth) && config.auth.google },
          turnstile: { site_key: config.turnstile?.siteKey || null },
          guest_session_hours: Math.round(config.guestTtlSeconds / 3600),
          speech: {
            available: Boolean(voice && voice.available),
            // Return the known catalog even when no provider is configured so
            // Settings can show the choices as unavailable instead of hiding them.
            voices: voice && Array.isArray(voice.voices) ? voice.voices : [],
            default: voice ? voice.defaultVoice : null,
            rate: config.ai.speech.rate
          }
        }
      })
    },
    {
      // Research agent (docs/research.md). Body: { query, urls? }.
      method: 'POST',
      path: '/v1/research',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body, ip }) => {
        if (!research) throw new HttpError(404, 'not_found', 'Research is not available.');
        return { body: await research.scan(caller, body, ip) };
      }
    },
    {
      // Unified professional intelligence search, backed by the existing public-web research pipeline.
      // LinkedIn results remain separate and are available only through approved API scopes and supported endpoints.
      method: 'POST',
      path: '/v1/professional-search',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body, ip }) => {
        const plan = buildProfessionalSearch(body || {});
        if (plan.source !== 'linkedin_authorized' && !research) throw new HttpError(404, 'not_found', 'Professional search is not available.');
        const linkedinStatus = plan.source === 'public_web' ? ({ available: linkedin.available, connected: false, scopes: [], capabilities: { organization_posts: false } }) : await linkedin.statusFor(caller).catch(() => ({ available: linkedin.available, connected: false, scopes: [], capabilities: { organization_posts: false } }));
        const orgId = typeof body?.organization_id === 'string' ? body.organization_id : '';
        const linkedinGroup = { id: 'linkedin_authorized', label: 'LinkedIn authorized API', status: 'requires_organization_id', sources: [], facts: [], limitation: 'The official API does not provide unrestricted global search across all LinkedIn categories. Organization post retrieval requires an approved scope and an organization ID.' };
        if (plan.source === 'public_web') {
          linkedinGroup.status = 'not_requested';
          linkedinGroup.limitation = '';
        } else if (!linkedin.available) {
          linkedinGroup.status = 'not_configured';
          linkedinGroup.limitation = 'Configure LinkedIn OAuth credentials and run migration 043 before connecting an account.';
        } else if (!linkedinStatus.connected) {
          linkedinGroup.status = 'not_connected';
        } else if (plan.category !== 'posts_discussions') {
          linkedinGroup.status = 'unsupported_category';
          linkedinGroup.limitation = 'This authorized LinkedIn integration can retrieve approved organization posts only. Use public-web research for other categories.';
        } else if (!linkedinStatus.capabilities?.organization_posts) {
          linkedinGroup.status = 'missing_permission';
          linkedinGroup.limitation = 'The connected account does not have the approved r_organization_social scope.';
        } else if (!orgId) {
          linkedinGroup.status = 'requires_organization_id';
        } else {
          try {
            const linked = await linkedin.searchOrganizationPosts(caller, { organizationId: orgId, query: plan.query, count: body?.count });
            linkedinGroup.status = 'available';
            linkedinGroup.sources = linked.posts.map((post) => ({ url: post.source_url, title: post.id || 'LinkedIn organization post', retrieved_at: linked.retrieved_at, channel: 'linkedin_authorized', id: post.id, author: post.author, created_at: post.created_at })).filter((source) => source.url);
            linkedinGroup.facts = linked.posts.map((post) => ({ fact: post.text, url: post.source_url, created_at: post.created_at, channel: 'linkedin_authorized' })).filter((fact) => fact.fact);
            linkedinGroup.retrieved_at = linked.retrieved_at;
            linkedinGroup.note = linked.note;
          } catch (error) {
            if (!['linkedin_permission_required', 'linkedin_not_connected', 'linkedin_reconnect_required'].includes(error?.code)) throw error;
            linkedinGroup.status = error.code === 'linkedin_permission_required' ? 'missing_permission' : 'not_connected';
            linkedinGroup.limitation = error.message;
          }
        }
        if (plan.source === 'linkedin_authorized') {
          return { body: {
            query: plan.query, facts: linkedinGroup.facts, sources: linkedinGroup.sources, report: '',
            professional_search: {
              category: plan.category,
              filters: { location: plan.location, date_range: plan.date_range, source: plan.source },
              source_groups: [
                { id: 'public_web', label: 'Public web research', status: 'not_requested', sources: [], facts: [] },
                linkedinGroup
              ],
              analysis_note: 'Only records returned by the authorized LinkedIn API are included. Organization post search is not a global LinkedIn search.'
            }
          } };
        }
        const scan = await research.scan(caller, buildProfessionalResearchInput(body || {}, plan), ip);
        const result = presentProfessionalSearch(scan, plan);
        result.professional_search.source_groups[1] = linkedinGroup;
        return { body: result };
      }
    },
    {
      // Open Graph / Twitter card raster image for a cited web page. The
      // server fetches and validates the image so the browser stays same-origin.
      method: 'GET',
      path: '/v1/page-preview',
      public: true,
      handler: async ({ req, ip, res }) => {
        if (!pagePreviews) throw new HttpError(404, 'not_found', 'Not found.');
        const url = new URL(req.url, 'http://localhost').searchParams.get('url') || '';
        if (url.length > 2048) throw new HttpError(400, 'invalid_url', 'Invalid page URL.');
        if (!pagePreviews.cached(url) && !(await limiter.siteIcon(ip))) throw new HttpError(429, 'rate_limited', 'Too many image requests.');
        const preview = await pagePreviews.preview(url);
        if (!preview) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
          res.end('No preview image');
          return;
        }
        res.writeHead(200, {
          'Content-Type': preview.type,
          'Content-Length': preview.bytes.length,
          'Cache-Control': 'public, max-age=86400',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Cross-Origin-Resource-Policy': 'same-origin'
        });
        res.end(preview.bytes);
      }
    },
    {
      // Search relevant YouTube tutorials. API key stays server-side; callers
      // must have a chat-scoped session and requests share the existing limiter.
      method: 'GET',
      path: '/v1/youtube/search',
      scope: 'chat',
      handler: async ({ req, ip }) => {
        if (!youtubeSearch?.available) throw new HttpError(503, 'youtube_unavailable', 'Video search is not configured.');
        if (!(await limiter.siteIcon(ip))) throw new HttpError(429, 'rate_limited', 'Too many search requests.');
        const query = new URL(req.url, 'http://localhost').searchParams.get('q') || '';
        if (query.length > 180) throw new HttpError(400, 'invalid_query', 'Search query is too long.');
        return await youtubeSearch.search(query);
      }
    },
    {
      // Verify a persisted YouTube player before restoring its iframe.
      method: 'GET',
      path: '/v1/youtube/verify',
      scope: 'chat',
      handler: async ({ req, ip }) => {
        if (!youtubeSearch?.available) return { valid: false };
        if (!(await limiter.siteIcon(ip))) throw new HttpError(429, 'rate_limited', 'Too many search requests.');
        const id = new URL(req.url, 'http://localhost').searchParams.get('id') || '';
        if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new HttpError(400, 'invalid_video_id', 'That video is not valid.');
        return { valid: await youtubeSearch.verify(id) };
      }
    },
    {
      // Resolve public TikTok/Facebook URLs using their official oEmbed APIs.
      // Only allowlisted provider hosts are accepted; upstream HTML is never
      // returned to the client or injected into the page.
      method: 'GET',
      path: '/v1/social/oembed',
      scope: 'chat',
      handler: async ({ req, ip }) => {
        if (!(await limiter.siteIcon(ip))) throw new HttpError(429, 'rate_limited', 'Too many embed requests.');
        const raw = new URL(req.url, 'http://localhost').searchParams.get('url') || '';
        if (!raw || raw.length > 2048) throw new HttpError(400, 'invalid_url', 'Invalid social video URL.');
        let url;
        try { url = new URL(raw); } catch { throw new HttpError(400, 'invalid_url', 'Invalid social video URL.'); }
        if (url.protocol !== 'https:') throw new HttpError(400, 'invalid_url', 'Only HTTPS social URLs are supported.');
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        let provider = '';
        let upstream = '';
        let embedUrl = '';
        if (host === 'tiktok.com' || host === 'm.tiktok.com') {
          const match = url.pathname.match(/^\/@[A-Za-z0-9._-]+\/video\/(\d+)/);
          if (!match) throw new HttpError(400, 'invalid_url', 'Use a direct TikTok video link.');
          provider = 'tiktok';
          upstream = 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(url.href);
          embedUrl = 'https://www.tiktok.com/player/v1/' + match[1] + '?controls=1&play_button=1&description=1';
        } else if (host === 'facebook.com' || host === 'm.facebook.com' || host === 'fb.watch') {
          if (host === 'fb.watch' && !/^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) throw new HttpError(400, 'invalid_url', 'Invalid Facebook video URL.');
          if (host !== 'fb.watch' && !/(^\/watch(?:\/|$)|\/videos\/|\/posts\/|\/permalink\/|\/reel\/|\/photo(?:s)?\/)/i.test(url.pathname)) {
            throw new HttpError(400, 'invalid_url', 'Use a direct public Facebook post or video link.');
          }
          provider = 'facebook';
          const endpoint = /\/videos\/|\/reel\//i.test(url.pathname) || url.searchParams.has('v') ? 'oembed_video' : 'oembed_post';
          upstream = 'https://graph.facebook.com/v26.0/' + endpoint + '?url=' + encodeURIComponent(url.href) + '&omitscript=true';
          embedUrl = 'https://www.facebook.com/plugins/' + (endpoint === 'oembed_video' ? 'video.php' : 'post.php') + '?href=' + encodeURIComponent(url.href) + '&show_text=true&width=500';
        } else {
          throw new HttpError(400, 'unsupported_provider', 'Only TikTok and Facebook URLs are supported.');
        }
        // oEmbed metadata is helpful, but it is not the player. In particular,
        // Meta's Graph oEmbed endpoint can reject requests without an app token
        // even when the public video plugin can still render the post. Keep the
        // validated, provider-specific player URL usable when metadata lookup
        // fails; the provider itself remains responsible for privacy/playback.
        let data = {};
        try {
          const response = await fetch(upstream, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
          if (response.ok) {
            try { data = await response.json(); } catch { data = {}; }
          }
        } catch {
          // A metadata outage must not prevent the public embed from loading.
        }
        return { provider, type: String(data.type || (provider === 'tiktok' ? 'video' : 'rich')).slice(0, 32), title: String(data.title || (provider === 'tiktok' ? 'TikTok video' : 'Facebook video/post')).slice(0, 240), embedUrl, sourceUrl: url.href };
      }
    },
    {
      // Search public Wikimedia Commons photos. Image URLs are limited to Wikimedia's
      // upload host and every result includes its source page and license metadata.
      method: 'GET',
      path: '/v1/web-images/search',
      scope: 'chat',
      handler: async ({ req, ip }) => {
        if (!imageSearch) throw new HttpError(503, 'image_search_unavailable', 'Internet image search is not available right now.');
        if (!(await limiter.siteIcon(ip))) throw new HttpError(429, 'rate_limited', 'Too many search requests.');
        const query = new URL(req.url, 'http://localhost').searchParams.get('q') || '';
        if (query.length > 180) throw new HttpError(400, 'invalid_query', 'Search query is too long.');
        return await imageSearch.search(query);
      }
    },
    {
      // A source's real site logo (GET /v1/site-icon?host=…), fetched by our server (docs/web.md, "Site
      // logos"). Public, because <img> sends no sign-in; only raster images,
      // served so they can never run as a page here.
      method: 'GET',
      path: '/v1/site-icon',
      public: true,
      handler: async ({ req, ip, res }) => {
        if (!siteIcons) throw new HttpError(404, 'not_found', 'Not found.');
        // ?host=example.com (a query, since path ids never hold dots).
        const host = new URL(req.url, 'http://localhost').searchParams.get('host') || '';
        if (!siteIcons.cached(host) && !(await limiter.siteIcon(ip))) throw new HttpError(429, 'rate_limited', 'Too many requests.');
        const icon = await siteIcons.icon(host);
        if (!icon) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
          res.end('No icon');
          return;
        }
        res.writeHead(200, {
          'Content-Type': icon.type,
          'Content-Length': icon.bytes.length,
          'Cache-Control': 'public, max-age=86400',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Cross-Origin-Resource-Policy': 'same-origin'
        });
        res.end(icon.bytes);
      }
    },
    {
      // Citation details for one source, facts only (docs/citations.md).
      // Body: { url } or { doi }. Answers { citation }.
      method: 'POST',
      path: '/v1/cite',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body }) => {
        if (!cite) throw new HttpError(404, 'not_found', 'Citations are not available.');
        return { body: await cite.lookup(caller, body) };
      }
    },
    {
      // The caller's own scans (newest first).
      method: 'GET',
      path: '/v1/research',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (!research) throw new HttpError(404, 'not_found', 'Research is not available.');
        return { body: await research.list(caller) };
      }
    },
    {
      // Download a caller-owned report. Formats are markdown, html, and json.
      method: 'GET',
      path: '/v1/research/:id/export',
      scope: 'chat',
      handler: async ({ caller, params, req, res }) => {
        if (!research) throw new HttpError(404, 'not_found', 'Research is not available.');
        const format = new URL(req.url, 'http://local').searchParams.get('format') || 'markdown';
        const file = await research.export(caller, params.id, format);
        const bytes = Buffer.from(file.content, 'utf8');
        res.writeHead(200, {
          'Content-Type': file.contentType,
          'Content-Length': bytes.length,
          'Content-Disposition': `attachment; filename="${file.filename}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Referrer-Policy': 'no-referrer'
        });
        res.end(bytes);
      }
    },
    {
      // Explicit user confirmation is required; scanning never saves to Library automatically.
      method: 'POST',
      path: '/v1/research/:id/save-to-library',
      scope: 'chat',
      body: true,
      handler: async ({ caller, params, body }) => {
        if (!research) throw new HttpError(404, 'not_found', 'Research is not available.');
        return { status: 201, body: await research.saveToLibrary(caller, params.id, body) };
      }
    },
    {
      // One of the caller's own scans.
      method: 'GET',
      path: '/v1/research/:id',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        if (!research) throw new HttpError(404, 'not_found', 'Research is not available.');
        return { body: await research.get(caller, params.id) };
      }
    },
    {
      // Raw audio bytes avoid base64 expansion. Keep this below serverless request limits.
      // The browser sends the filename in the query and the MIME type in Content-Type.
      method: 'POST',
      path: '/v1/transcriptions',
      scope: 'chat',
      raw: true,
      maxBody: 4 * 1024 * 1024,
      handler: async ({ req, raw, caller, ip }) => {
        if (!transcription?.available) throw new HttpError(503, 'transcription_unavailable', 'Audio transcription is not available right now.');
        await limiter.transcription(caller, ip);
        const url = new URL(req.url, 'http://local');
        const name = url.searchParams.get('name') || 'recording.webm';
        const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase();
        const language = url.searchParams.get('language') || undefined;
        const result = await transcription.transcribe({ bytes: raw, name, mime, language });
        return { body: { text: result.text, characters: result.characters, model: result.model } };
      }
    },
    {
      // Raw PDF bytes keep the upload simple and avoid browser-side PDF rendering.
      method: 'POST',
      path: '/v1/pdf-ocr',
      scope: 'chat',
      raw: true,
      maxBody: 6 * 1024 * 1024,
      handler: async ({ req, raw, caller, ip }) => {
        if (!pdfOcr?.available) throw new HttpError(503, 'ocr_unavailable', 'PDF text extraction is not available right now.');
        await limiter.transcription(caller, ip);
        const url = new URL(req.url, 'http://local');
        const name = url.searchParams.get('name') || 'scanned-document.pdf';
        const result = await pdfOcr.extract({ bytes: raw, name });
        return { body: { text: result.text, characters: result.characters, model: result.model } };
      }
    },
    {
      // A one-time link to upload one file straight to storage (docs/uploads.md).
      // Body: { name, type, size }. Answers { id, upload_url, max_bytes }; the
      // chat then names the file as { upload: id, name, type } in `attachments`.
      method: 'POST',
      path: '/v1/uploads',
      scope: 'chat',
      body: true,
      handler: async ({ caller, body, ip }) => {
        if (!uploads) throw new HttpError(404, 'not_found', 'Direct uploads are not available.');
        return { body: await uploads.sign(caller, body, ip) };
      }
    },
    {
      // One chat turn. Body: { message, conversation_id?, model?, attachments? }.
      // Without conversation_id a new conversation is started.
      method: 'POST',
      path: '/v1/chat',
      scope: 'chat',
      body: true,
      // room for files sent inside the request (base64) plus the message;
      // larger files come as direct uploads (docs/uploads.md)
      maxBody: Math.ceil(inlineBytes * 4 / 3) + 64 * 1024,
      // With { stream: true } the answer comes as lines of JSON (NDJSON) while it
      // is written: { type: 'start', conversation_id, user_message_id } once the
      // message is saved, { type: 'delta', text } pieces, { type: 'reset' } when another
      // model takes over, { type: 'audio', seq, mime, data } spoken sentences (only on a
      // voice turn with `speak_voice`), then { type: 'done', ...the usual reply, audio? } or
      // { type: 'error', error }. Problems found before the model starts (checks,
      // limits, plan) are normal JSON errors. Closing the connection stops the reply.
      handler: async ({ caller, body, ip, res, requestId }) => {
        if (body.stream !== true) return { body: await chat(caller, body, ip) };
        const stop = new AbortController();
        res.on('close', () => { if (!res.writableEnded) stop.abort(); });
        let started = false;
        const send = (event) => {
          if (res.destroyed || res.writableEnded) return;
          if (!started) {
            started = true;
            res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
          }
          res.write(JSON.stringify(event) + '\n');
        };
        // A hands-free voice turn with a natural voice ({ voice: true, speak_voice }):
        // each sentence is also spoken as it is written, and sent as { type: 'audio' }.
        const speaker = voice && typeof voice.live === 'function' && body.voice === true && typeof body.speak_voice === 'string'
          ? voice.live(caller, ip, body.speak_voice, send)
          : null;
        try {
          const out = await chat(caller, body, ip, { stream: {
            start: (info) => send({ type: 'start', ...info }),
            status: (stage) => { if (STAGES.has(stage)) send({ type: 'status', stage }); },
            onText: (text) => { send({ type: 'delta', text }); speaker?.push(text); },
            reset: () => { speaker?.reset(); send({ type: 'reset' }); }
          }, signal: stop.signal });
          const audio = speaker && !stop.signal.aborted ? await speaker.finish() : null;
          send({ type: 'done', ...out, ...(audio ? { audio } : {}) });
        } catch (err) {
          speaker?.cancel();
          if (!started) throw err;
          const known = err instanceof HttpError;
          if (!known && logger) logger.error('streamed reply failed', { requestId, error: err?.message });
          send({ type: 'error', error: known
            ? { code: err.code, message: err.message }
            : { code: 'internal', message: 'NasrinAI could not finish that reply. Please try again.' } });
        }
        if (!res.writableEnded && !res.destroyed) res.end();
      }
    },
    {
      method: 'POST',
      path: '/v1/conversations',
      scope: 'chat',
      handler: async ({ caller }) => ({ status: 201, body: { conversation: publicConversation(await conversations.create(caller)) } })
    },
    {
      method: 'GET',
      path: '/v1/conversations',
      scope: 'chat',
      handler: async ({ caller }) => {
        if (storage) await storage.sweep(caller);
        const links = projects ? await projects.links(caller, 'chat') : {};
        return { body: { conversations: (await conversations.list(caller, 50)).map((c) => ({ ...publicConversation(c), project_id: links[c.id] || null })) } };
      }
    },
    {
      method: 'GET',
      path: '/v1/conversations/:id/messages',
      scope: 'chat',
      handler: async ({ caller, params }) => {
        const conv = await conversations.get(caller, params.id);
        const project = projects ? await projects.forChat(caller, conv.id) : null;
        return { body: { conversation: publicConversation(conv), project: project ? { id: project.id, name: project.name } : null, messages: (await conversations.history(conv, 100)).map(publicMessage) } };
      }
    },
    {
      method: 'DELETE',
      path: '/v1/conversations/:id',
      scope: 'chat',
      handler: async ({ caller, params, res }) => {
        await conversations.remove(caller, params.id);
        res.statusCode = 204;
        res.end();
      }
    },
    {
      // Starts a guest session. No key: a NasrinAI platform guest.
      // With a publishable key (X-NasrinAI-Key) from a listed website: a guest
      // of that business. The guest can chat, nothing more.
      method: 'POST',
      path: '/v1/guest/sessions',
      public: true,
      handler: async ({ req, ip }) => {
        await limiter.guestSession(ip);
        const tenantId = await gateway.guestTenantFor(req);
        const { token, expiresAt } = issueGuestToken({
          secret: config.guestSecret, tenantId, guestId: newGuestId(), ttlSeconds: config.guestTtlSeconds, origin: String(req.headers.origin || '').toLowerCase().replace(/\/+$/, '') || null
        });
        return { status: 201, body: { token, expires_at: expiresAt, tenant_id: tenantId } };
      }
    },
    {
      // Who am I? Shows only the caller's own type, business and scopes.
      method: 'GET',
      path: '/v1/whoami',
      handler: async ({ caller }) => ({
        body: { actor_type: caller.actor.type, tenant_id: caller.tenantId, scopes: caller.scopes }
      })
    }
  ].concat(authRoutes({ config, auth, limiter, logger }), paymentRoutes({ config, payments, plans, store, limiter, legal, logger }), facebook ? facebook.routes : [], hooks, linkedin.routes);
}
