import { HttpError, notFound } from './http/errors.js';
import { marketingCacheKey } from './marketing-cache.js';
import { owns } from './conversations.js';
import { safePrompt, MAX_SECONDS, STEP_SECONDS, EXTEND_SECONDS, videoStepSeconds } from './ai/video.js';
import { resolveRequestTier } from './ai/request-tier.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createVideos({ store, plans, provider, limiter, usageLog = null, budget = null, config, logger, now = () => Date.now() }) {
  const unavailable = () => new HttpError(503, 'videos_unavailable', 'Video creation is not available right now.');
  // A provider job may legitimately take several minutes, but it must not
  // remain "in progress" forever when the provider stops responding.
  const configuredJobTimeout = Number(config.video?.jobTimeoutMs ?? process.env.VIDEO_JOB_TIMEOUT_MS);
  const jobTimeoutMs = Number.isFinite(configuredJobTimeout) && configuredJobTimeout >= 60_000
    ? Math.min(configuredJobTimeout, 60 * 60_000)
    : 10 * 60_000;
  const jobAgeMs = (video) => {
    const createdAt = Date.parse(video?.createdAt || '');
    return Number.isFinite(createdAt) ? Math.max(0, now() - createdAt) : 0;
  };

  async function reconcileActualVideoCost(video, actualCostUsd, caller = null) {
    if (!video?.id || video.costReconciledAt ||
        !Number.isFinite(actualCostUsd) || actualCostUsd < 0 || actualCostUsd > 100000) return video;
    const costReconciledAt = new Date(now()).toISOString();
    try {
      await store.updateVideo(video.id, { actualCostUsd, costReconciledAt });
    } catch (err) {
      logger.warn('provider-reported video cost could not be recorded', { id: video.id, error: err.message });
      return video;
    }
    if (caller && usageLog?.record) {
      try {
        await usageLog.record(caller, {
          provider: video.provider || 'unknown',
          model: video.providerModel || 'unknown',
          outcome: 'ok',
          task: 'video_cost_reconciliation',
          costUsd: actualCostUsd,
          costSource: 'provider_reported'
        });
      } catch (err) {
        logger.warn('provider-reported video cost telemetry could not be recorded', { id: video.id, error: err.message });
      }
    }
    return { ...video, actualCostUsd, costReconciledAt };
  }

  const routeProviderOrJobIsOpenRouter = (jobProvider) => jobProvider?.id === 'openrouter';

  function providerForVideo(video, planTier = null) {
    if (provider && typeof provider.create === 'function') return provider;
    if (!provider) return null;
    // A job must always poll/download/extend through the exact tier adapter
    // that created it. Never silently cross-fallback into another paid tier.
    const exact = provider[video?.requestTier] || provider[video?.providerTier];
    if (exact) return exact;
    // Saved jobs do not record their tier (the generated_videos table has no
    // tier column), so after a reload the exact adapter is unknown. Checking a
    // job's status and fetching its file only needs the same provider account
    // that created it, never a new paid request, so use an adapter whose
    // provider id matches the job's, preferring the caller's plan tier. A job
    // from a provider that is no longer configured stays unavailable.
    const sameProvider = Object.entries(provider).filter(([, adapter]) => adapter && adapter.id === video?.provider);
    if (!sameProvider.length) return null;
    return (sameProvider.find(([tier]) => tier === planTier) || sameProvider[0])[1];
  }

  async function requireVideoPlan(caller, requestedTier) {
    if (caller.actor.type !== 'user') throw new HttpError(403, 'video_plan_required', 'Video creation requires an eligible paid plan.');
    if (!plans) throw unavailable();
    const account = await plans.current(caller);
    if (account.open || !['pro', 'max', 'ultra'].includes(account.plan)) throw new HttpError(403, 'video_plan_required', 'Video creation requires Pro, Max or Ultra. Upgrade your plan to create videos.');
    const requested = resolveRequestTier(requestedTier, account.plan, { open: Boolean(account.open) });
    // "Automatic" (the default NasrinAI selection, or no choice at all) means
    // "use my plan's video tier". It never goes above the plan: explicit
    // choices below keep their entitlement checks unchanged.
    const selected = requested === 'nasrinai' ? account.plan : requested;
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
    if (b.conversation_id != null) {
      if (!UUID.test(String(b.conversation_id))) throw notFound();
      const conversation = await store.getConversation(b.conversation_id);
      if (!owns(caller, conversation)) throw notFound();
    }
    const prompt = safePrompt(b.prompt);
    let targetSeconds = Math.max(1, Math.min(MAX_SECONDS, effectiveRequestedSeconds));
    let aspectRatio = b.aspect_ratio === '9:16' ? '9:16' : '16:9';
    // Default to 720p/30 FPS. Honor a user-selected value only when the
    // plan permits it; if the model cannot provide it, fall back to the
    // highest available quality within that plan, preferring 60 FPS.
    // Keep the existing 4K add-on route for Max/Ultra. Provider capability
    // checks remain authoritative; unsupported combinations fail closed.
    const tierResolutions = selected === 'pro'
      ? ['480p', '360p']
      : ['4k', '1080p', '720p', '480p', '360p'];
    const allowedResolutions = (routeProvider.allowedResolutions || tierResolutions)
      .filter((resolution) => tierResolutions.includes(resolution));
    const allowedFrameRates = (routeProvider.allowedFrameRates || [60, 30])
      .map(Number).filter((fps) => Number.isFinite(fps) && fps > 0 && fps <= 120);
    const requestedByUserResolution = String(b.resolution || '').trim().toLowerCase();
    const requestedByUserFps = b.fps == null || b.fps === '' ? null : Number(b.fps);
    if (requestedByUserResolution && !tierResolutions.includes(requestedByUserResolution)) {
      throw new HttpError(403, 'video_resolution_not_in_plan', 'That resolution is not available on your current video plan.');
    }
    // Unsupported user FPS is a preference mismatch, not a bad request.
    // Ignore it and let the provider catalog choose a supported default.
    const validRequestedFps = Number.isFinite(requestedByUserFps) && requestedByUserFps > 0 && requestedByUserFps <= 120 ? requestedByUserFps : null;
    const preferredResolution = requestedByUserResolution || (tierResolutions.includes('720p') ? '720p' : '480p');
    const preferredFps = validRequestedFps;
    const resolutionCandidates = [preferredResolution, ...allowedResolutions.filter((x) => x !== preferredResolution)];
    const fpsCandidates = [...new Set([...(preferredFps == null ? [] : [preferredFps]), ...allowedFrameRates])];
    let requestedResolution = null;
    let requestedFps = null;
    let generateAudio = true;
    if (routeProvider.id === 'openrouter' && typeof routeProvider.validateOptions === 'function') {
      let lastValidationError = null;
      for (const resolution of resolutionCandidates) {
        if (!allowedResolutions.includes(resolution)) continue;
        for (const fps of fpsCandidates) {
          if (!allowedFrameRates.includes(fps)) continue;
          try {
            // The provider returns its actual supported defaults when the
            // requested quality/FPS/aspect ratio is unavailable.
            const resolved = await routeProvider.validateOptions({
              generateAudio: true, duration: targetSeconds, aspectRatio, requestedResolution: resolution, fps
            });
            requestedResolution = resolved?.resolution || resolution;
            // A route with no advertised frame rate returns fps: null; keep it unset.
            requestedFps = resolved && typeof resolved === 'object' && 'fps' in resolved ? resolved.fps : fps;
            // The model may only offer certain clip lengths (a 2-second ask can
            // resolve to its 5-second clip). Record and create the real length.
            const resolvedSeconds = Number(resolved?.duration);
            if (Number.isFinite(resolvedSeconds) && resolvedSeconds >= 1 && resolvedSeconds <= (routeProvider.maxSeconds || MAX_SECONDS)) targetSeconds = Math.floor(resolvedSeconds);
            aspectRatio = resolved?.aspectRatio || aspectRatio;
            generateAudio = resolved?.generateAudio ?? true;
            break;
          } catch (err) {
            lastValidationError = err;
          }
        }
        if (requestedResolution) break;
      }
      if (!requestedResolution) {
        logger.warn('no compatible video model quality found for requested settings', {
          provider: routeProvider.id,
          tier: selected,
          duration: targetSeconds,
          aspectRatio,
          attemptedResolutions: resolutionCandidates.filter((x) => allowedResolutions.includes(x)),
          attemptedFrameRates: fpsCandidates.filter((x) => allowedFrameRates.includes(x)),
          reason: lastValidationError?.code || lastValidationError?.kind || 'capability_mismatch'
        });
        throw new HttpError(
          503,
          'video_capability_unavailable',
          'No available video model supports this duration and quality on your selected plan. Try another duration or quality, or try again later.'
        );
      }
    } else {
      requestedResolution = allowedResolutions.includes(preferredResolution) ? preferredResolution : (allowedResolutions[0] || config.video.resolution);
      requestedFps = allowedFrameRates.includes(preferredFps) ? preferredFps : 30;
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
    // Count the hourly limit only now: requests refused for plan, length or
    // model-capability reasons (and cache hits) never start a video.
    await limiter.video(caller, config.video.perHour);
    const started = now();
    let operation;
    try {
      operation = await routeProvider.create({ prompt, aspectRatio, seconds: targetSeconds, requestedResolution, fps: requestedFps, generateAudio });
    } catch (err) {
      await usageLog?.record?.(caller, { provider: routeProvider.id, model: routeProvider.model, outcome: 'provider_error',
        task: 'video', latencyMs: now() - started, costUsd: null });
      throw err;
    }
    await usageLog?.record?.(caller, { provider: routeProvider.id, model: routeProvider.model, outcome: 'ok',
      task: 'video', latencyMs: now() - started, costUsd: null });
    const id = await store.addVideo({
      tenantId: caller.tenantId, conversationId: b.conversation_id || null,
      ownerType: caller.actor.type, ownerId: caller.actor.id, prompt,
      targetSeconds, producedSeconds: 0, status: 'in_progress', requestTier: selected,
      provider: routeProvider.id, providerModel: routeProvider.model || null, providerOperation: operation, cacheKey, resolution: requestedResolution, fps: requestedFps,
      spendReservationId: null, estimatedCostUsd: null, addonTokens: 0, addonCostUsd: null, actualCostUsd: null, costReconciledAt: null
    });
    logger.info('video job created', {
      id, targetSeconds, provider: routeProvider.id, model: routeProvider.model || null,
      tier: selected, providerCreateLatencyMs: Math.max(0, now() - started)
    });
    return { video_id: id, status: 'in_progress', progress: 0, target_seconds: targetSeconds };
  }

  async function advance(caller, id) {
    const { account } = await requireVideoPlan(caller);
    if (!UUID.test(String(id))) throw new HttpError(404, 'not_found', 'Video not found.');
    const v = await store.getVideo({ tenantId: caller.tenantId, ownerType: caller.actor.type, ownerId: caller.actor.id, id });
    if (!v) throw new HttpError(404, 'not_found', 'Video not found.');
    if (v.status === 'completed' || v.status === 'failed') {
      if (v.actualCostUsd !== null && v.actualCostUsd !== undefined && !v.costReconciledAt) {
        return await reconcileActualVideoCost(v, Number(v.actualCostUsd), caller);
      }
      return v;
    }

    const ageMs = jobAgeMs(v);
    if (ageMs >= jobTimeoutMs) {
      logger.error('video job exceeded maximum processing time', {
        id, provider: v.provider, model: v.providerModel || null, tier: v.requestTier,
        ageMs, timeoutMs: jobTimeoutMs, stage: 'provider_processing_or_polling'
      });
      await store.updateVideo(v.id, {
        status: 'failed', errorCode: 'video_job_timeout',
        errorMessage: 'Video generation took too long and was stopped. Check your video usage before retrying to avoid duplicate requests.'
      });
      return await store.getVideo({ tenantId: v.tenantId, ownerType: v.ownerType, ownerId: v.ownerId, id: v.id });
    }
    const jobProvider = providerForVideo(v, account.plan);
    if (!jobProvider) throw unavailable();
    let state;
    const pollStarted = now();
    try {
      state = jobProvider.extract(await jobProvider.status(v.providerOperation));
      logger.info('video provider status checked', {
        id, provider: v.provider, model: v.providerModel || jobProvider.model || null,
        ageMs, pollLatencyMs: Math.max(0, now() - pollStarted),
        providerStatus: state.failed ? 'failed' : state.done ? 'completed' : 'processing',
        stage: state.done ? 'download_pending' : state.failed ? 'provider_failed' : 'provider_processing'
      });
    } catch (err) {
      logger.warn('video provider poll failed', {
        id, provider: v.provider, model: v.providerModel || jobProvider.model || null,
        ageMs, pollLatencyMs: Math.max(0, now() - pollStarted),
        stage: 'status_poll', error: String(err?.message || err).slice(0, 240)
      });
      return { ...v, progress: Math.min(95, Math.max(1, Math.floor((v.producedSeconds / Math.max(1, v.targetSeconds)) * 100))), poll_warning: true };
    }
    if (!state.done && !state.failed) return { ...v, progress: Math.min(95, Math.max(1, Math.floor((v.producedSeconds / Math.max(1, v.targetSeconds)) * 100))) };
    if (state.actualCostUsd !== null && state.actualCostUsd !== undefined) {
      Object.assign(v, await reconcileActualVideoCost(v, Number(state.actualCostUsd), caller));
    } else if (routeProviderOrJobIsOpenRouter(jobProvider) && (state.done || state.failed)) {
      logger.warn('OpenRouter video poll omitted final usage cost; cost remains unknown', { id: v.id });
    }
    if (state.failed || !state.uri) {
      await store.updateVideo(v.id, { status:'failed', errorCode:'provider_failed', errorMessage:state.error || 'Video generation failed.' });
      return await store.getVideo({ tenantId:v.tenantId, ownerType:v.ownerType, ownerId:v.ownerId, id:v.id });
    }

    const downloadStarted = now();
    let bytes;
    try {
      bytes = await jobProvider.download(state.uri);
      logger.info('video provider content downloaded', {
        id, provider: v.provider, model: v.providerModel || jobProvider.model || null,
        ageMs: jobAgeMs(v), downloadLatencyMs: Math.max(0, now() - downloadStarted),
        bytes: bytes?.length || 0, stage: 'download_complete'
      });
    } catch (err) {
      logger.error('video provider content download failed', {
        id, provider: v.provider, model: v.providerModel || jobProvider.model || null,
        ageMs: jobAgeMs(v), downloadLatencyMs: Math.max(0, now() - downloadStarted),
        stage: 'download', error: String(err?.message || err).slice(0, 240)
      });
      await store.updateVideo(v.id, {
        status: 'failed', errorCode: 'video_download_failed',
        errorMessage: 'The video finished generating, but NasrinAI could not retrieve it. Please try again later.'
      });
      return await store.getVideo({ tenantId: v.tenantId, ownerType: v.ownerType, ownerId: v.ownerId, id: v.id });
    }
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
      if (jobProvider.maxSeconds || typeof jobProvider.extend !== 'function') {
        await store.updateVideo(v.id, { status:'failed', errorCode:'duration_unsupported', errorMessage:'This provider cannot extend video jobs.' });
        return await store.getVideo({ tenantId:v.tenantId, ownerType:v.ownerType, ownerId:v.ownerId, id:v.id });
      }
      const nextOperation = await jobProvider.extend({ prompt: v.prompt, videoBytes: bytes });
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
      provider_poll_warning: v.poll_warning === true,
      download: v.status === 'completed' ? '/v1/videos/' + v.id + '/content' : null
    };
  }

  async function read(caller, id) {
    const { account } = await requireVideoPlan(caller);
    if (!UUID.test(String(id))) throw new HttpError(404, 'not_found', 'Video not found.');
    const v = await store.getVideo({ tenantId: caller.tenantId, ownerType: caller.actor.type, ownerId: caller.actor.id, id });
    if (!v || v.status !== 'completed' || (!v.bytes && !v.providerVideoUri)) throw new HttpError(404, 'not_found', 'Video is not ready.');
    const jobProvider = providerForVideo(v, account.plan);
    if (!v.bytes && (!jobProvider || typeof jobProvider.download !== 'function')) throw unavailable();
    const bytes = v.bytes ? Buffer.from(v.bytes) : await jobProvider.download(v.providerVideoUri);
    return { ...v, bytes };
  }

  return { available: Boolean(provider), create, status, read };
}
