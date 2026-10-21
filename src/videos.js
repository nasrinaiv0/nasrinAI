import { HttpError, notFound } from './http/errors.js';
import { marketingCacheKey } from './marketing-cache.js';
import { owns } from './conversations.js';
import { safePrompt, MAX_SECONDS, STEP_SECONDS, EXTEND_SECONDS, videoStepSeconds } from './ai/video.js';
import { videoCostPerSecond } from './ai/pricing.js';
import { resolveRequestTier } from './ai/request-tier.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createVideos({ store, plans, provider, limiter, usageLog = null, budget = null, config, logger, now = () => Date.now() }) {
  const unavailable = () => new HttpError(503, 'videos_unavailable', 'Video creation is not available right now.');

  async function reconcileActualVideoCost(video, actualCostUsd) {
    if (!video?.spendReservationId || video.costReconciledAt ||
        !Number.isFinite(actualCostUsd) || actualCostUsd < 0 || actualCostUsd > 100000) return video;
    const expectedUsd = Number(video.estimatedCostUsd);
    if (!Number.isFinite(expectedUsd) || expectedUsd < 0 || typeof budget?.reconcileSpend !== 'function') {
      logger.warn('video final cost could not be reconciled; conservative estimate retained', { id: video.id });
      return video;
    }
    try {
      // Persist provider usage first. If the RPC or timestamp write fails, a
      // later status poll can retry reconciliation without losing the invoice.
      await store.updateVideo(video.id, { actualCostUsd });
      await budget.reconcileSpend({ id: video.spendReservationId, reservedUsd: expectedUsd }, actualCostUsd);
      await store.updateVideo(video.id, { actualCostUsd, costReconciledAt: new Date(now()).toISOString() });
      logger.info('video provider cost reconciled', {
        id: video.id, provider: video.provider, model: video.providerModel,
        estimatedCostUsd: expectedUsd, actualCostUsd
      });
    } catch (err) {
      logger.warn('video final cost reconciliation pending retry', { id: video.id, code: err?.code || 'reconciliation_failed' });
    }
    return await store.getVideo({
      tenantId: video.tenantId, ownerType: video.ownerType, ownerId: video.ownerId, id: video.id
    }) || video;
  }

  const routeProviderOrJobIsOpenRouter = (jobProvider) => jobProvider?.id === 'openrouter';

  async function requireVideoPlan(caller, requestedTier) {
    if (caller.actor.type !== 'user') throw new HttpError(403, 'video_plan_required', 'Video creation requires an eligible paid plan.');
    if (!plans) throw unavailable();
    const account = await plans.current(caller);
    if (account.open || !['pro', 'max', 'ultra'].includes(account.plan)) throw new HttpError(403, 'video_plan_required', 'Video creation requires Pro, Max or Ultra. Upgrade your plan to create videos.');
    const selected = resolveRequestTier(requestedTier, account.plan, { open: Boolean(account.open) });
    if (!['pro', 'max', 'ultra'].includes(selected)) throw new HttpError(403, 'video_tier_required', 'Video generation requires selecting Pro, Max or Ultra.');
    if (account.plan === 'pro' && selected !== 'pro') throw new HttpError(403, 'video_tier_required', 'Pro video generation is limited to 480p. Upgrade to Max or Ultra for 1080p.');
    if (account.plan === 'max' && selected === 'ultra') throw new HttpError(403, 'video_tier_required', 'Max cannot use Ultra video add-ons.');
    if (account.plan === 'ultra' && selected !== 'ultra') throw new HttpError(403, 'video_tier_required', 'Select Ultra for Ultra video options.');
    return { account, selected };
  }

  async function create(caller, body) {
    const b = body && typeof body === 'object' ? body : {};
    const { selected } = await requireVideoPlan(caller, b.tier ?? b.model);
    const routeProvider = provider && typeof provider.create !== 'function' ? provider[selected] : provider;
    if (!routeProvider) throw new HttpError(503, 'video_tier_unavailable', 'Video generation is not configured for the selected tier.');
    const requestedSeconds = Number(b.seconds);
    const effectiveRequestedSeconds = Number.isFinite(requestedSeconds) && requestedSeconds > 0
      ? requestedSeconds
      : (routeProvider.maxSeconds || MAX_SECONDS);
    if (routeProvider.maxSeconds && effectiveRequestedSeconds > routeProvider.maxSeconds) throw new HttpError(422, 'video_duration_unsupported', `This provider supports clips up to ${routeProvider.maxSeconds} seconds. Choose a shorter duration or use the default video provider.`);
    await limiter.signIn('video:' + caller.actor.id, config.video.perHour);
    if (b.conversation_id != null) {
      if (!UUID.test(String(b.conversation_id))) throw notFound();
      const conversation = await store.getConversation(b.conversation_id);
      if (!owns(caller, conversation)) throw notFound();
    }
    const prompt = safePrompt(b.prompt);
    const targetSeconds = Math.max(1, Math.min(MAX_SECONDS, effectiveRequestedSeconds));
    const aspectRatio = b.aspect_ratio === '9:16' ? '9:16' : '16:9';
    // Default to 720p/30 FPS. Honor a user-selected value only when the
    // plan permits it; if the model cannot provide it, fall back to the
    // highest available quality within that plan, preferring 60 FPS.
    // Keep the existing 4K add-on route for Max/Ultra. Provider pricing and
    // capability checks below remain authoritative; unsupported combinations fail closed.
    const tierResolutions = selected === 'pro'
      ? ['480p', '360p']
      : ['4k', '1080p', '720p', '480p', '360p'];
    const allowedResolutions = (routeProvider.allowedResolutions || tierResolutions)
      .filter((resolution) => tierResolutions.includes(resolution));
    const allowedFrameRates = (routeProvider.allowedFrameRates || [60, 30])
      .filter((fps) => [60, 30].includes(Number(fps))).map(Number);
    const requestedByUserResolution = String(b.resolution || '').trim().toLowerCase();
    const requestedByUserFps = b.fps == null || b.fps === '' ? null : Number(b.fps);
    if (requestedByUserResolution && !tierResolutions.includes(requestedByUserResolution)) {
      throw new HttpError(403, 'video_resolution_not_in_plan', 'That resolution is not available on your current video plan.');
    }
    if (requestedByUserFps != null && ![30, 60].includes(requestedByUserFps)) {
      throw new HttpError(400, 'invalid_video_fps', 'Choose 30 or 60 FPS.');
    }
    const preferredResolution = requestedByUserResolution || (tierResolutions.includes('720p') ? '720p' : '480p');
    const preferredFps = requestedByUserFps || 30;
    const resolutionCandidates = [preferredResolution, ...allowedResolutions.filter((x) => x !== preferredResolution)];
    const fpsCandidates = [preferredFps, ...allowedFrameRates.filter((x) => x !== preferredFps)];
    let requestedResolution = null;
    let requestedFps = null;
    let perSecond = null;
    let basePerSecond = null;
    if (routeProvider.id === 'openrouter' && typeof routeProvider.getCostPerSecondUsd === 'function') {
      for (const resolution of resolutionCandidates) {
        if (!allowedResolutions.includes(resolution)) continue;
        for (const fps of fpsCandidates) {
          if (!allowedFrameRates.includes(fps)) continue;
          try {
            perSecond = await routeProvider.getCostPerSecondUsd({
              generateAudio: true, duration: targetSeconds, aspectRatio, requestedResolution: resolution, fps
            });
            requestedResolution = resolution;
            requestedFps = fps;
            break;
          } catch { /* try the next eligible quality combination */ }
        }
        if (requestedResolution) break;
      }
      if (!requestedResolution) {
        throw new HttpError(503, 'video_quality_unavailable', 'This model has no supported, priced video quality for your plan.');
      }
    } else {
      requestedResolution = allowedResolutions.includes(preferredResolution) ? preferredResolution : (allowedResolutions[0] || config.video.resolution);
      requestedFps = allowedFrameRates.includes(preferredFps) ? preferredFps : 30;
      perSecond = videoCostPerSecond(routeProvider.model, requestedResolution, routeProvider.costPerSecondUsd ?? null);
    }
    const cacheKey = marketingCacheKey('video', {
      prompt, targetSeconds, aspectRatio, requestTier: selected,
      provider: routeProvider.id, model: routeProvider.model || 'unknown',
      resolution: requestedResolution || 'provider-default', fps: requestedFps
    });
    const cached = b.reuse_cached === true && store.getMarketingCache ? await store.getMarketingCache({
      tenantId: caller.tenantId, ownerType: caller.actor.type, ownerId: caller.actor.id, kind: 'video', key: cacheKey
    }) : null;
    if (cached && typeof cached.videoId === 'string') {
      const existing = await store.getVideo({
        tenantId: caller.tenantId, ownerType: caller.actor.type, ownerId: caller.actor.id, id: cached.videoId
      });
      if (existing && existing.status === 'completed' && (existing.bytes || existing.providerVideoUri)) {
        logger.info('marketing video cache hit', { id: existing.id, targetSeconds, provider: routeProvider.id });
        return { video_id: existing.id, status: 'completed', progress: 100, target_seconds: existing.targetSeconds, cache_hit: true };
      }
    }
    // Provider generation is chunked (8 seconds initially, then 7-second
    // extensions), so its billable duration can exceed the requested clip.
    const estimatedSeconds = targetSeconds <= STEP_SECONDS
      ? STEP_SECONDS
      : STEP_SECONDS + Math.ceil((targetSeconds - STEP_SECONDS) / EXTEND_SECONDS) * EXTEND_SECONDS;
    const estimatedCost = Math.round(estimatedSeconds * perSecond * 1e6) / 1e6;
    if (!Number.isFinite(estimatedCost) || estimatedCost <= 0 || estimatedCost > config.video.maxCostUsd) {
      throw new HttpError(503, 'budget_reached', 'This video exceeds the configured per-video spending limit.');
    }
    const addonCostUsd = 0;
    const addonTokens = 0;
    let spendReservation;
    try {
      spendReservation = await budget.reserveSpend({ caller, amountUsd: estimatedCost, maxRequestUsd: null });
    } catch (err) {
      throw err;
    }
    const started = now();
    let operation;
    try {
      operation = await routeProvider.create({ prompt, aspectRatio, seconds: targetSeconds, requestedResolution, fps: requestedFps });
    } catch (err) {
      // Provider failures can still incur charges; settle both reservations conservatively.
      await budget.settleSpend(spendReservation, estimatedCost).catch(() => {});
      await usageLog?.record?.(caller, { provider: routeProvider.id, model: routeProvider.model, outcome: 'provider_error',
        task: 'video', latencyMs: now() - started, costUsd: estimatedCost, inputTokens: addonTokens, spendReservationId: spendReservation.id });
      throw err;
    }
    // No final invoice is available at job creation; settle the conservative estimate.
    await budget.settleSpend(spendReservation, estimatedCost);
    await usageLog?.record?.(caller, { provider: routeProvider.id, model: routeProvider.model, outcome: 'ok',
      task: 'video', latencyMs: now() - started, costUsd: estimatedCost, inputTokens: addonTokens, spendReservationId: spendReservation.id });
    const id = await store.addVideo({
      tenantId: caller.tenantId, conversationId: b.conversation_id || null,
      ownerType: caller.actor.type, ownerId: caller.actor.id, prompt,
      targetSeconds, producedSeconds: 0, status: 'in_progress', requestTier: selected,
      provider: routeProvider.id, providerModel: routeProvider.model || null, providerOperation: operation, cacheKey, resolution: requestedResolution, fps: requestedFps,
      spendReservationId: spendReservation.id, estimatedCostUsd: estimatedCost, addonTokens, addonCostUsd, actualCostUsd: null, costReconciledAt: null
    });
    logger.info('video job created', { id, targetSeconds, provider: routeProvider.id });
    return { video_id: id, status: 'in_progress', progress: 0, target_seconds: targetSeconds };
  }

  async function advance(caller, id) {
    await requireVideoPlan(caller);
    if (!UUID.test(String(id))) throw new HttpError(404, 'not_found', 'Video not found.');
    const v = await store.getVideo({ tenantId: caller.tenantId, ownerType: caller.actor.type, ownerId: caller.actor.id, id });
    if (!v) throw new HttpError(404, 'not_found', 'Video not found.');
    if (v.status === 'completed' || v.status === 'failed') {
      if (v.actualCostUsd !== null && v.actualCostUsd !== undefined && !v.costReconciledAt) {
        return await reconcileActualVideoCost(v, Number(v.actualCostUsd));
      }
      return v;
    }

    const jobProvider = provider && typeof provider.create !== 'function'
      ? provider[v.requestTier] || provider[v.providerTier] || provider.ultra || provider.max
      : provider;
    if (!jobProvider) throw unavailable();
    let state;
    try { state = jobProvider.extract(await jobProvider.status(v.providerOperation)); }
    catch (err) {
      logger.warn('video provider poll failed', { id, error: err.message });
      return { ...v, progress: Math.min(95, Math.max(1, Math.floor((v.producedSeconds / Math.max(1, v.targetSeconds)) * 100))) };
    }
    if (!state.done && !state.failed) return { ...v, progress: Math.min(95, Math.max(1, Math.floor((v.producedSeconds / Math.max(1, v.targetSeconds)) * 100))) };
    if (state.actualCostUsd !== null && state.actualCostUsd !== undefined && v.spendReservationId) {
      Object.assign(v, await reconcileActualVideoCost(v, Number(state.actualCostUsd)));
    } else if (routeProviderOrJobIsOpenRouter(jobProvider) && (state.done || state.failed)) {
      logger.warn('OpenRouter video poll omitted final usage cost; conservative estimate retained', { id: v.id });
    }
    if (state.failed || !state.uri) {
      await store.updateVideo(v.id, { status:'failed', errorCode:'provider_failed', errorMessage:state.error || 'Video generation failed.' });
      return await store.getVideo({ tenantId:v.tenantId, ownerType:v.ownerType, ownerId:v.ownerId, id:v.id });
    }

    const bytes = await jobProvider.download(state.uri);
    const produced = jobProvider.maxSeconds ? Math.min(v.targetSeconds, jobProvider.maxSeconds) : v.producedSeconds ? v.producedSeconds + EXTEND_SECONDS : STEP_SECONDS;
    const reached = produced >= Math.min(v.targetSeconds, MAX_SECONDS);
    if (reached) {
      // Avoid oversized JSON/hex writes to PostgREST. Only cache a video when
      // its bytes fit a conservative durable-storage ceiling; larger videos
      // keep the existing provider-URI fallback and are not cached.
      const cacheable = bytes.length <= 8 * 1024 * 1024;
      const completedPatch = { status:'completed', producedSeconds: Math.min(produced, MAX_SECONDS), providerVideoUri: state.uri, mime:'video/mp4' };
      if (cacheable) completedPatch.bytes = bytes;
      await store.updateVideo(v.id, completedPatch);
      if (cacheable && v.cacheKey && store.setMarketingCache) {
        await store.setMarketingCache({
          tenantId: v.tenantId, ownerType: v.ownerType, ownerId: v.ownerId,
          kind: 'video', key: v.cacheKey, value: { videoId: v.id }
        }).catch((err) => logger.warn('marketing video cache write failed', { error: err.message }));
      }
    } else {
      if (provider.maxSeconds) {
        await store.updateVideo(v.id, { status:'failed', errorCode:'duration_unsupported', errorMessage:'This provider cannot extend video jobs.' });
        return await store.getVideo({ tenantId:v.tenantId, ownerType:v.ownerType, ownerId:v.ownerId, id:v.id });
      }
      const nextOperation = await provider.extend({ prompt: v.prompt, videoBytes: bytes });
      await store.updateVideo(v.id, {
        status:'in_progress',
        producedSeconds: produced,
        providerOperation: nextOperation,
        providerVideoUri: state.uri,
        mime:'video/mp4'
      });
    }
    return await store.getVideo({ tenantId:v.tenantId, ownerType:v.ownerType, ownerId:v.ownerId, id:v.id });
  }

  async function status(caller, id) {
    const v = await advance(caller, id);
    return {
      video_id: v.id, status: v.status,
      progress: v.status === 'completed' ? 100 : Math.min(99, Math.floor((v.producedSeconds / Math.max(1, v.targetSeconds)) * 100)),
      produced_seconds: v.producedSeconds, target_seconds: v.targetSeconds,
      error: v.status === 'failed' ? { code: v.errorCode, message: v.errorMessage } : null,
      download: v.status === 'completed' ? '/v1/videos/' + v.id + '/content' : null
    };
  }

  async function read(caller, id) {
    await requireVideoPlan(caller);
    if (!UUID.test(String(id))) throw new HttpError(404, 'not_found', 'Video not found.');
    const v = await store.getVideo({ tenantId: caller.tenantId, ownerType: caller.actor.type, ownerId: caller.actor.id, id });
    if (!v || v.status !== 'completed' || (!v.bytes && !v.providerVideoUri)) throw new HttpError(404, 'not_found', 'Video is not ready.');
    const bytes = v.bytes ? Buffer.from(v.bytes) : await provider.download(v.providerVideoUri);
    return { ...v, bytes };
  }

  return { available: Boolean(provider), create, status, read };
}
