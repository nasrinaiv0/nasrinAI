import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_INPUT_BYTES = 100 * 1024 * 1024;
const BUCKET = 'video-studio-assets';
const OWNER_ID = /^[A-Za-z0-9_-]{1,80}$/;

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');
const safeText = (value, max = 300) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);

export function createVideoStudioRenderWorker({ config, fetchImpl = fetch, logger = null, sandboxApi = null, now = () => Date.now() }) {
  const enabled = Boolean(config?.supabaseUrl && config?.supabaseSecretKey);
  const base = String(config?.supabaseUrl || '').replace(/\/$/, '');
  const key = config?.supabaseSecretKey || '';

  async function db(method, path, body, prefer) {
    if (!enabled) throw new Error('Video Studio render storage is not configured.');
    const response = await fetchImpl(base + '/rest/v1/' + path, {
      method,
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(prefer ? { Prefer: prefer } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000)
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) throw new Error('Video Studio render database request failed (' + response.status + ').');
    return text ? JSON.parse(text) : null;
  }

  async function storage(method, objectPath, bytes = null, mime = 'application/octet-stream') {
    const deleting = method === 'DELETE';
    const response = await fetchImpl(base + (deleting
      ? '/storage/v1/object/' + BUCKET
      : '/storage/v1/object/' + BUCKET + '/' + encodePath(objectPath)), {
      method,
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        ...(bytes ? { 'Content-Type': mime, 'x-upsert': 'true' } : {}),
        ...(deleting ? { 'Content-Type': 'application/json' } : {})
      },
      ...(bytes ? { body: bytes } : {}),
      ...(deleting ? { body: JSON.stringify({ prefixes: [objectPath] }) } : {}),
      signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) {
      await response.text().catch(() => '');
      throw new Error('Video Studio private media storage failed (' + response.status + ').');
    }
    return method === 'GET' ? Buffer.from(await response.arrayBuffer()) : true;
  }

  function owner(caller) {
    if (caller?.actor?.type !== 'user' || !UUID.test(String(caller.tenantId)) || !OWNER_ID.test(String(caller.actor.id))) {
      const error = new Error('Sign in to render and save a Video Studio export.');
      error.status = 403; error.code = 'sign_in_required'; throw error;
    }
  }

  function publicJob(row) {
    return {
      render_id: row.id,
      project_id: row.project_id,
      status: row.status,
      progress: Number(row.progress) || 0,
      error: row.status === 'failed' ? { code: row.error_code || 'render_failed', message: row.error_message || 'The MP4 could not be rendered. Try again.' } : null,
      download_url: row.status === 'completed' ? '/v1/video-studio/render-jobs/' + row.id + '/content' : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at || null
    };
  }

  async function enqueue(caller, { projectId, videoId, videoBytes, durationSeconds, timelineItems, audioAssets, idempotencyKey = null }) {
    owner(caller);
    if (!UUID.test(String(projectId)) || !UUID.test(String(videoId))) {
      const error = new Error('Choose a saved Video Studio project and a generated video clip.'); error.status = 400; error.code = 'invalid_render_request'; throw error;
    }
    if (idempotencyKey != null && !/^[A-Za-z0-9_-]{8,100}$/.test(String(idempotencyKey))) {
      const error = new Error('The render request identifier is invalid.'); error.status = 400; error.code = 'invalid_idempotency_key'; throw error;
    }
    if (!Buffer.isBuffer(videoBytes) || videoBytes.length < 1 || videoBytes.length > MAX_VIDEO_BYTES) {
      const error = new Error('The source MP4 is empty or exceeds the 50 MB render limit.'); error.status = 413; error.code = 'video_export_input_size'; throw error;
    }
    if (!Number.isFinite(Number(durationSeconds)) || Number(durationSeconds) < 1 || Number(durationSeconds) > 60) {
      const error = new Error('The source video must be between 1 and 60 seconds long.'); error.status = 400; error.code = 'video_export_duration'; throw error;
    }
    if (!Array.isArray(timelineItems) || timelineItems.length < 1 || timelineItems.length > 8 ||
        !Array.isArray(audioAssets) || audioAssets.length !== timelineItems.length) {
      const error = new Error('Add between one and eight saved audio clips to the project timeline.'); error.status = 400; error.code = 'video_timeline_limit'; throw error;
    }
    for (let i = 0; i < timelineItems.length; i++) {
      const item = timelineItems[i], asset = audioAssets[i];
      if (!Buffer.isBuffer(asset?.bytes) || asset.bytes.length < 1 || asset.bytes.length > MAX_AUDIO_BYTES ||
          ![item.startSeconds, item.trimStartSeconds, item.gain, item.lane].every(Number.isFinite) ||
          item.startSeconds < 0 || item.startSeconds >= Number(durationSeconds) || item.trimStartSeconds < 0 ||
          item.gain < 0 || item.gain > 2 || !Number.isInteger(item.lane) || item.lane < 1 || item.lane > 8 ||
          (item.trimEndSeconds != null && (!Number.isFinite(item.trimEndSeconds) || item.trimEndSeconds <= item.trimStartSeconds))) {
        const error = new Error('One of the audio timeline clips has invalid timing or media.'); error.status = 400; error.code = 'video_timeline_invalid'; throw error;
      }
    }

    const totalInputBytes = videoBytes.length + audioAssets.reduce((total, asset) => total + (Buffer.isBuffer(asset?.bytes) ? asset.bytes.length : 0), 0);
    if (totalInputBytes > MAX_TOTAL_INPUT_BYTES) {
      const error = new Error('The combined source video and audio timeline exceed the 100 MB server-render input limit.'); error.status = 413; error.code = 'video_render_input_total_size'; throw error;
    }

    if (idempotencyKey) {
      const prior = await db('GET', 'video_studio_render_jobs?tenant_id=eq.' + caller.tenantId +
        '&owner_id=eq.' + encodeURIComponent(caller.actor.id) + '&idempotency_key=eq.' + encodeURIComponent(idempotencyKey) +
        '&limit=1&select=*');
      if (prior?.[0]) return { ...publicJob(prior[0]), reused: true };
    }

    const id = randomUUID();
    const root = 'renders/' + caller.tenantId + '/' + caller.actor.id + '/' + id;
    const inputManifest = { source: root + '/source.mp4', audio: [], durationSeconds: Number(durationSeconds), timelineItems: timelineItems.map((item) => ({
      startSeconds: item.startSeconds, trimStartSeconds: item.trimStartSeconds, trimEndSeconds: item.trimEndSeconds ?? null,
      gain: item.gain, lane: item.lane
    })) };
    const uploaded = [];
    try {
      await storage('POST', inputManifest.source, videoBytes, 'video/mp4'); uploaded.push(inputManifest.source);
      for (let i = 0; i < audioAssets.length; i++) {
        const path = root + '/audio-' + i + '.mp3';
        await storage('POST', path, audioAssets[i].bytes, 'audio/mpeg'); uploaded.push(path);
        inputManifest.audio.push(path);
      }
      const rows = await db('POST', 'video_studio_render_jobs?select=*', {
        id, tenant_id: caller.tenantId, owner_id: caller.actor.id, project_id: projectId,
        source_video_id: videoId, status: 'queued', progress: 0, input_manifest: inputManifest,
        idempotency_key: idempotencyKey || null
      }, 'return=representation');
      if (!rows?.[0]) throw new Error('The render job could not be saved.');
      return { ...publicJob(rows[0]), reused: false };
    } catch (err) {
      await Promise.all(uploaded.map(path => storage('DELETE', path).catch(() => {})));
      if (String(err?.message || '').includes('(409)') && idempotencyKey) {
        const prior = await db('GET', 'video_studio_render_jobs?tenant_id=eq.' + caller.tenantId +
          '&owner_id=eq.' + encodeURIComponent(caller.actor.id) + '&idempotency_key=eq.' + encodeURIComponent(idempotencyKey) +
          '&limit=1&select=*').catch(() => []);
        if (prior?.[0]) return { ...publicJob(prior[0]), reused: true };
      }
      throw err;
    }
  }

  async function getJob(caller, id) {
    owner(caller);
    if (!UUID.test(String(id))) return null;
    const rows = await db('GET', 'video_studio_render_jobs?id=eq.' + id +
      '&tenant_id=eq.' + caller.tenantId + '&owner_id=eq.' + encodeURIComponent(caller.actor.id) + '&limit=1&select=*');
    return rows?.[0] || null;
  }

  async function status(caller, id) {
    const row = await getJob(caller, id);
    if (!row) { const error = new Error('Render job not found.'); error.status = 404; error.code = 'not_found'; throw error; }
    return publicJob(row);
  }

  async function readOutput(caller, id) {
    const row = await getJob(caller, id);
    if (!row || row.status !== 'completed' || !row.output_path) {
      const error = new Error('The rendered MP4 is not ready yet.'); error.status = 404; error.code = 'render_not_ready'; throw error;
    }
    const bytes = await storage('GET', row.output_path);
    if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES || bytes.length !== Number(row.output_size_bytes)) {
      const error = new Error('The rendered MP4 failed its storage integrity check.'); error.status = 502; error.code = 'render_output_invalid'; throw error;
    }
    return { bytes, id: row.id };
  }

  async function updateJob(id, patch) {
    const rows = await db('PATCH', 'video_studio_render_jobs?id=eq.' + id + '&select=*', { ...patch, updated_at: new Date(now()).toISOString() }, 'return=representation');
    return rows?.[0] || null;
  }

  async function launch(row) {
    let sandbox;
    try {
      const { Sandbox } = sandboxApi || await import('@vercel/sandbox');
      const manifest = row.input_manifest;
      const source = await storage('GET', manifest.source);
      if (!source.length || source.length > MAX_VIDEO_BYTES) throw new Error('Stored source video failed validation.');
      const audio = [];
      for (const path of manifest.audio) {
        const bytes = await storage('GET', path);
        if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw new Error('Stored audio input failed validation.');
        audio.push(bytes);
      }
      const name = 'nasrinai-render-' + row.id;
      sandbox = await Sandbox.create({ name, runtime: 'node22', timeout: 2700000, persistent: true, resources: { vcpus: 2 } });
      const files = [{ path: '/vercel/sandbox/source.mp4', content: source }];
      for (let i = 0; i < audio.length; i++) files.push({ path: '/vercel/sandbox/audio-' + i + '.mp3', content: audio[i] });
      await sandbox.writeFiles(files);
      const runnerSource = [
        "import { spawn, spawnSync } from 'node:child_process';",
        "import { readFile, writeFile } from 'node:fs/promises';",
        "const marker = '/vercel/sandbox/render.exit';",
        "const source = '/vercel/sandbox/source.mp4';",
        "try {",
        "  const input = JSON.parse(await readFile('/vercel/sandbox/render-input.json', 'utf8'));",
        "  const duration = Number(input.durationSeconds);",
        "  const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', source], { encoding: 'utf8', maxBuffer: 1048576 });",
        "  const hasSourceAudio = /Stream #\\d+:\\d+[^\\n]*Audio:/i.test(probe.stderr || '');",
        "  const filters = [], labels = [];",
        "  if (hasSourceAudio) { filters.push('[0:a:0]apad=pad_dur=' + duration.toFixed(3) + '[source_audio]'); labels.push('[source_audio]'); }",
        "  for (let i = 0; i < input.audioCount; i++) {",
        "    const item = input.timelineItems[i], delay = Math.round(item.startSeconds * 1000);",
        "    const trim = item.trimEndSeconds == null ? 'atrim=start=' + item.trimStartSeconds.toFixed(3) : 'atrim=start=' + item.trimStartSeconds.toFixed(3) + ':end=' + item.trimEndSeconds.toFixed(3);",
        "    filters.push('[' + (i + 1) + ':a:0]' + trim + ',asetpts=PTS-STARTPTS,adelay=' + delay + '|' + delay + ',volume=' + item.gain.toFixed(3) + ',apad=pad_dur=' + duration.toFixed(3) + '[audio_' + i + ']');",
        "    labels.push('[audio_' + i + ']');",
        "  }",
        "  if (!labels.length) throw new Error('No audio tracks');",
        "  filters.push(labels.join('') + 'amix=inputs=' + labels.length + ':duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]');",
        "  const args = ['-nostdin','-y','-hide_banner','-loglevel','error','-i',source];",
        "  for (let i = 0; i < input.audioCount; i++) args.push('-i','/vercel/sandbox/audio-' + i + '.mp3');",
        "  args.push('-filter_complex',filters.join(';'),'-map','0:v:0','-map','[aout]','-c:v','copy','-c:a','aac','-b:a','192k','-map_metadata','0','-movflags','+faststart','-t',duration.toFixed(3),'-f','mp4','/vercel/sandbox/output.mp4');",
        "  const child = spawn('ffmpeg', args, { stdio: 'ignore' });",
        "  child.on('error', async () => { await writeFile(marker, '127'); });",
        "  child.on('close', async (code) => { await writeFile(marker, String(code ?? 1)); });",
        "} catch { await writeFile(marker, '1'); }"
      ].join('\n');
      const bootstrapSource = [
        '#!/bin/bash',
        'set +e',
        'if ! command -v ffmpeg >/dev/null 2>&1; then',
        '  sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg',
        '  if [ $? -ne 0 ]; then echo 127 > /vercel/sandbox/render.exit; exit 127; fi',
        'fi',
        'node /vercel/sandbox/runner.mjs'
      ].join('\n');
      await sandbox.writeFiles([
        { path: '/vercel/sandbox/render-input.json', content: Buffer.from(JSON.stringify({
          durationSeconds: Number(manifest.durationSeconds), audioCount: audio.length, timelineItems: manifest.timelineItems
        })) },
        { path: '/vercel/sandbox/runner.mjs', content: Buffer.from(runnerSource) },
        { path: '/vercel/sandbox/bootstrap.sh', content: Buffer.from(bootstrapSource), mode: 0o755 }
      ]);
      // The bootstrap and render both run detached: a Vercel function timeout or
      // a closed browser cannot terminate the job's isolated worker process.
      const detached = await sandbox.runCommand({ cmd: 'bash', args: ['/vercel/sandbox/bootstrap.sh'], detached: true });
      await updateJob(row.id, { status: 'running', progress: 15, sandbox_name: name, error_code: null, error_message: null });
      logger?.info?.('Video Studio render detached', { renderId: row.id, commandId: detached?.commandId || null });
    } catch (err) {
      if (sandbox) await (typeof sandbox.delete === 'function' ? sandbox.delete() : sandbox.stop()).catch(() => {});
      await Promise.all((row.input_manifest?.source ? [row.input_manifest.source] : []).concat(row.input_manifest?.audio || []).map(path => storage('DELETE', path).catch(() => {})));
      await updateJob(row.id, { status: 'failed', progress: 100, error_code: 'render_start_failed', error_message: 'The MP4 renderer could not start. Please retry the export.' });
      logger?.warn?.('Video Studio render start failed', { renderId: row.id, error: safeText(err?.message) });
    }
  }

  async function pollRunning() {
    const rows = await db('GET', 'video_studio_render_jobs?status=eq.running&select=*&order=updated_at.asc&limit=3');
    let completed = 0, failed = 0, waiting = 0;
    for (const row of rows || []) {
      const ageMs = now() - new Date(row.updated_at || row.created_at || 0).getTime();
      if (ageMs > 40 * 60 * 1000) {
        await updateJob(row.id, { status: 'failed', progress: 100, error_code: 'render_worker_timeout', error_message: 'The render worker timed out. Retry the export.' });
        await Promise.all((row.input_manifest?.source ? [row.input_manifest.source] : []).concat(row.input_manifest?.audio || []).map(path => storage('DELETE', path).catch(() => {})));
        failed++; continue;
      }
      if (!row.sandbox_name || !/^nasrinai-render-[0-9a-f-]{36}$/.test(row.sandbox_name)) {
        await updateJob(row.id, { status: 'failed', progress: 100, error_code: 'render_worker_lost', error_message: 'The render worker stopped unexpectedly. Retry the export.' }); failed++; continue;
      }
      let sandbox;
      try {
        const { Sandbox } = sandboxApi || await import('@vercel/sandbox');
        sandbox = await Sandbox.get({ name: row.sandbox_name });
        const marker = await sandbox.readFileToBuffer({ path: '/vercel/sandbox/render.exit' });
        if (!marker) { waiting++; continue; }
        const exitCode = Number(marker.toString('utf8').trim());
        if (exitCode !== 0) {
          await updateJob(row.id, { status: 'failed', progress: 100, error_code: 'render_failed', error_message: 'The MP4 could not be rendered. Check the source video and audio timeline, then retry.' });
          failed++;
        } else {
          const output = await sandbox.readFileToBuffer({ path: '/vercel/sandbox/output.mp4' });
          if (!output || output.length < 1 || output.length > MAX_OUTPUT_BYTES) {
            await updateJob(row.id, { status: 'failed', progress: 100, error_code: 'render_output_size', error_message: 'The rendered MP4 was empty or exceeded the 50 MB download limit.' });
            failed++;
          } else {
            const outputPath = 'renders/' + row.tenant_id + '/' + row.owner_id + '/' + row.id + '/output.mp4';
            await storage('POST', outputPath, output, 'video/mp4');
            await updateJob(row.id, { status: 'completed', progress: 100, output_path: outputPath, output_size_bytes: output.length, completed_at: new Date(now()).toISOString() });
            completed++;
          }
        }
        await Promise.all((row.input_manifest?.source ? [row.input_manifest.source] : []).concat(row.input_manifest?.audio || []).map(path => storage('DELETE', path).catch(() => {})));
        await (typeof sandbox.delete === 'function' ? sandbox.delete() : sandbox.stop()).catch(() => {});
      } catch (err) {
        // A not-yet-resumable sandbox may be temporarily unavailable. Leave it
        // running so the next cron tick can recover it; stale jobs are handled below.
        logger?.warn?.('Video Studio render poll failed', { renderId: row.id, error: safeText(err?.message) });
        waiting++;
      }
    }
    return { completed, failed, waiting };
  }

  async function processBatch({ limit = 1 } = {}) {
    if (!enabled) throw new Error('Video Studio render worker is not configured.');
    const polled = await pollRunning();
    const claimed = await db('POST', 'rpc/claim_video_studio_render_jobs', { p_limit: Math.max(1, Math.min(1, Number(limit) || 1)) });
    let started = 0;
    for (const row of Array.isArray(claimed) ? claimed : []) { await launch(row); started++; }
    return { enabled: true, started, ...polled };
  }

  return { enabled, enqueue, status, readOutput, processBatch };
}
