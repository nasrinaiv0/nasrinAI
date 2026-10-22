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

  async function enqueueTimeline(caller, { projectId, aspect = '16:9', clips, mediaAssets, idempotencyKey = null }) {
    owner(caller);
    if (!UUID.test(String(projectId))) {
      const error = new Error('Save this Video Studio project to the cloud before rendering.'); error.status = 400; error.code = 'video_project_required'; throw error;
    }
    if (idempotencyKey != null && !/^[A-Za-z0-9_-]{8,100}$/.test(String(idempotencyKey))) {
      const error = new Error('The render request identifier is invalid.'); error.status = 400; error.code = 'invalid_idempotency_key'; throw error;
    }
    if (!Array.isArray(clips) || clips.length < 1 || clips.length > 38 || !Array.isArray(mediaAssets) || mediaAssets.length > 38) {
      const error = new Error('A timeline render must contain between one and 30 clips.'); error.status = 400; error.code = 'video_timeline_limit'; throw error;
    }
    const allowedTracks = new Set(['video','overlay','text','audio']);
    const allowedFilters = new Set(['none','cinematic','warm','cool','mono','vivid']);
    const normalized = [];
    let durationSeconds = 0;
    for (const raw of clips) {
      if (!raw || typeof raw !== 'object' || !allowedTracks.has(raw.track || 'video')) {
        const error = new Error('A timeline clip has an unsupported track.'); error.status = 400; error.code = 'video_timeline_invalid'; throw error;
      }
      const position = Number(raw.position), duration = Number(raw.duration), start = Number(raw.start || 0);
      if (![position,duration,start].every(Number.isFinite) || position < 0 || duration <= 0 || duration > 60 || start < 0) {
        const error = new Error('A timeline clip has invalid timing.'); error.status = 400; error.code = 'video_timeline_invalid'; throw error;
      }
      const mediaIndex = raw.mediaIndex == null ? null : Number(raw.mediaIndex);
      if (mediaIndex != null && (!Number.isInteger(mediaIndex) || mediaIndex < 0 || mediaIndex >= mediaAssets.length)) {
        const error = new Error('A timeline clip refers to missing media.'); error.status = 400; error.code = 'video_timeline_invalid'; throw error;
      }
      if ((raw.track || 'video') !== 'text' && (raw.track || 'video') !== 'overlay' && mediaIndex == null) {
        const error = new Error('Save or generate every video, image, and audio clip before server rendering.'); error.status = 400; error.code = 'video_asset_required'; throw error;
      }
      const item = {
        name: safeText(raw.name, 120), title: safeText(raw.title, 200), track: raw.track || 'video',
        mediaIndex, mediaType: safeText(raw.mediaType, 100).toLowerCase(),
        position, duration, start, transition: ['cut','fade','dissolve','wipe'].includes(raw.transition) ? raw.transition : 'cut',
        filter: allowedFilters.has(raw.filter) ? raw.filter : 'none',
        opacity: Math.max(0, Math.min(100, Number(raw.opacity ?? 100))),
        gain: Math.max(0, Math.min(200, Number(raw.gain ?? 100))),
        keyframes: Array.isArray(raw.keyframes) ? raw.keyframes.slice(0, 30).map(k => ({
          time: Math.max(0, Math.min(duration, Number(k.time) || 0)),
          opacity: Math.max(0, Math.min(100, Number(k.opacity ?? 100))),
          scale: Math.max(.5, Math.min(2, Number(k.scale ?? 1)))
        })) : []
      };
      normalized.push(item);
      durationSeconds = Math.max(durationSeconds, position + duration);
    }
    if (durationSeconds < 1 || durationSeconds > 60) {
      const error = new Error('Server-side timeline exports must be between 1 and 60 seconds.'); error.status = 400; error.code = 'video_export_duration'; throw error;
    }
    let totalBytes = 0;
    for (const asset of mediaAssets) {
      if (!Buffer.isBuffer(asset?.bytes) || asset.bytes.length < 1 || asset.bytes.length > MAX_VIDEO_BYTES) {
        const error = new Error('One of the timeline media files is empty or exceeds the 50 MB limit.'); error.status = 413; error.code = 'video_export_input_size'; throw error;
      }
      totalBytes += asset.bytes.length;
    }
    if (totalBytes > MAX_TOTAL_INPUT_BYTES) {
      const error = new Error('Timeline source media exceeds the combined 100 MB render limit.'); error.status = 413; error.code = 'video_render_input_total_size'; throw error;
    }
    if (idempotencyKey) {
      const prior = await db('GET', 'video_studio_render_jobs?tenant_id=eq.' + caller.tenantId +
        '&owner_id=eq.' + encodeURIComponent(caller.actor.id) + '&idempotency_key=eq.' + encodeURIComponent(idempotencyKey) + '&limit=1&select=*');
      if (prior?.[0]) return { ...publicJob(prior[0]), reused: true };
    }
    const id = randomUUID(), root = 'renders/' + caller.tenantId + '/' + caller.actor.id + '/' + id;
    const inputManifest = { mode: 'timeline', aspect: aspect === '9:16' ? '9:16' : '16:9', durationSeconds, clips: normalized, media: [] };
    const uploaded = [];
    try {
      for (let i = 0; i < mediaAssets.length; i++) {
        const ext = /image\\/(png|jpeg|webp|gif)/.test(mediaAssets[i].mime || '') ? (mediaAssets[i].mime.includes('png') ? 'png' : mediaAssets[i].mime.includes('webp') ? 'webp' : mediaAssets[i].mime.includes('gif') ? 'gif' : 'jpg')
          : /audio\\//.test(mediaAssets[i].mime || '') ? 'mp3' : 'mp4';
        const path = root + '/media-' + i + '.' + ext;
        await storage('POST', path, mediaAssets[i].bytes, mediaAssets[i].mime || 'application/octet-stream');
        uploaded.push(path); inputManifest.media.push(path);
      }
      const rows = await db('POST', 'video_studio_render_jobs?select=*', {
        id, tenant_id: caller.tenantId, owner_id: caller.actor.id, project_id: projectId,
        source_video_id: null, status: 'queued', progress: 0, input_manifest: inputManifest,
        idempotency_key: idempotencyKey || null
      }, 'return=representation');
      if (!rows?.[0]) throw new Error('The render job could not be saved.');
      return { ...publicJob(rows[0]), reused: false };
    } catch (err) {
      await Promise.all(uploaded.map(path => storage('DELETE', path).catch(() => {})));
      if (String(err?.message || '').includes('(409)') && idempotencyKey) {
        const prior = await db('GET', 'video_studio_render_jobs?tenant_id=eq.' + caller.tenantId +
          '&owner_id=eq.' + encodeURIComponent(caller.actor.id) + '&idempotency_key=eq.' + encodeURIComponent(idempotencyKey) + '&limit=1&select=*').catch(() => []);
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
      const source = manifest.source ? await storage('GET', manifest.source) : null;
      if (source && (!source.length || source.length > MAX_VIDEO_BYTES)) throw new Error('Stored source video failed validation.');
      const audio = [];
      for (const path of manifest.audio || []) {
        const bytes = await storage('GET', path);
        if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw new Error('Stored audio input failed validation.');
        audio.push(bytes);
      }
      const media = [];
      for (const path of manifest.media || []) {
        const bytes = await storage('GET', path);
        if (!bytes.length || bytes.length > MAX_VIDEO_BYTES) throw new Error('Stored timeline media failed validation.');
        media.push({ path, bytes });
      }
      const name = 'nasrinai-render-' + row.id;
      sandbox = await Sandbox.create({ name, runtime: 'node22', timeout: 2700000, persistent: true, resources: { vcpus: 2 } });
      const check = await sandbox.runCommand({ cmd: 'bash', args: ['-lc', 'command -v ffmpeg'] });
      if (check.exitCode !== 0) {
        const install = await sandbox.runCommand({ cmd: 'bash', args: ['-c', 'apt-get update -qq && apt-get install -y -qq ffmpeg fonts-dejavu-core'], sudo: true });
        if (install.exitCode !== 0) throw new Error('The isolated renderer could not install FFmpeg.');
      }
      await sandbox.update({ networkPolicy: 'deny-all' });
      const files = [];
      if (source) files.push({ path: '/vercel/sandbox/source.mp4', content: source });
      for (let i = 0; i < audio.length; i++) files.push({ path: '/vercel/sandbox/audio-' + i + '.mp3', content: audio[i] });
      for (let i = 0; i < media.length; i++) {
        const ext = media[i].path.split('.').pop().replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin';
        files.push({ path: '/vercel/sandbox/media-' + i + '.' + ext, content: media[i].bytes });
        media[i].sandboxPath = '/vercel/sandbox/media-' + i + '.' + ext;
      }
      const runnerSource = [
        "import { spawn, spawnSync } from 'node:child_process';",
        "import { readFile, writeFile } from 'node:fs/promises';",
        "const marker = '/vercel/sandbox/render.exit';",
        "const run = (args) => new Promise((resolve) => { const child = spawn('ffmpeg', args, { stdio: 'ignore' }); child.on('error', () => resolve(127)); child.on('close', code => resolve(code ?? 1)); });",
        "try {",
        "  const input = JSON.parse(await readFile('/vercel/sandbox/render-input.json', 'utf8'));",
        "  const duration = Number(input.durationSeconds);",
        "  const args = ['-nostdin','-y','-hide_banner','-loglevel','error'];",
        "  const filters = [], audioLabels = [];",
        "  if (input.mode === 'timeline') {",
        "    const width = input.aspect === '9:16' ? 720 : 1280, height = input.aspect === '9:16' ? 1280 : 720;",
        "    args.push('-f','lavfi','-i','color=c=black:s=' + width + 'x' + height + ':r=30:d=' + duration.toFixed(3));",
        "    for (const media of input.media) { if (media.image) args.push('-loop','1','-framerate','30','-t',String(media.duration),'-i',media.path); else args.push('-i',media.path); }",
        "    filters.push('[0:v:0]null[base0]'); let base = 'base0', visual = 0;",
        "    for (const clip of input.clips) {",
        "      const start = Number(clip.position), end = start + Number(clip.duration), localStart = Number(clip.start || 0);",
        "      if (clip.track === 'text' || (!clip.mediaIndex && clip.mediaIndex !== 0 && clip.title)) {",
        "        if (clip.title) { const textPath = '/vercel/sandbox/text-' + visual + '.txt'; await writeFile(textPath, String(clip.title).replace(/[\\r\\n]/g,' ').slice(0,200));",
        "          const next = 'v' + visual++; const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';",
        "          filters.push('[' + base + ']drawtext=fontfile=' + font + ':textfile=' + textPath + ':fontcolor=white:fontsize=' + Math.round(width * .035) + ':box=1:boxcolor=black@0.48:boxborderw=18:x=(w-text_w)/2:y=h*0.78:alpha=' + (Number(clip.opacity ?? 100)/100).toFixed(3) + ':enable=\\'between(t,' + start.toFixed(3) + ',' + end.toFixed(3) + ')\\'[' + next + ']'); base = next; }",
        "        continue;",
        "      }",
        "      if (clip.mediaIndex == null) continue;",
        "      const media = input.media[clip.mediaIndex], index = Number(clip.mediaIndex) + 1;",
        "      if (clip.track === 'audio' || media.audio) {",
        "        if (media.audio) { const label = 'aud' + audioLabels.length; const trim = 'atrim=start=' + localStart.toFixed(3) + ':duration=' + Number(clip.duration).toFixed(3);",
        "          filters.push('[' + index + ':a:0]' + trim + ',asetpts=PTS-STARTPTS,adelay=' + Math.round(start*1000) + '|' + Math.round(start*1000) + ',volume=' + (Number(clip.gain ?? 100)/100).toFixed(3) + ',apad=pad_dur=' + duration.toFixed(3) + '[' + label + ']'); audioLabels.push('[' + label + ']'); }",
        "        continue;",
        "      }",
        "      const label = 'clip' + visual, next = 'v' + (visual++);",
        "      const colors = { none:'', cinematic:',eq=contrast=1.12:saturation=0.88', warm:',colorbalance=rs=0.08:gs=0.02:bs=-0.05', cool:',colorbalance=rs=-0.03:bs=0.08', mono:',hue=s=0', vivid:',eq=saturation=1.35:contrast=1.05' };",
        "      const fade = (clip.transition === 'fade' || clip.transition === 'dissolve') ? Math.min(0.6, Number(clip.duration)/2) : 0;",
        "      const chain = '[' + index + ':v:0]trim=start=' + localStart.toFixed(3) + ':duration=' + Number(clip.duration).toFixed(3) + ',setpts=PTS-STARTPTS,scale=' + width + ':' + height + ':force_original_aspect_ratio=increase,crop=' + width + ':' + height + ',fps=30,setsar=1,format=rgba' + colors[clip.filter || 'none'] + ',colorchannelmixer=aa=' + (Number(clip.opacity ?? 100)/100).toFixed(3) + (fade ? ',fade=t=in:st=0:d=' + fade.toFixed(3) + ':alpha=1,fade=t=out:st=' + Math.max(0,Number(clip.duration)-fade).toFixed(3) + ':d=' + fade.toFixed(3) + ':alpha=1' : '') + '[' + label + ']';",
        "      filters.push(chain);",
        "      const composite = 'base' + visual; filters.push('[' + base + '][' + label + ']overlay=0:0:eof_action=pass:enable=\\'between(t,' + start.toFixed(3) + ',' + end.toFixed(3) + ')\\'[' + composite + ']'); base = composite;",
        "      if (clip.title) { const textPath = '/vercel/sandbox/title-' + visual + '.txt'; await writeFile(textPath, String(clip.title).replace(/[\\r\\n]/g,' ').slice(0,200)); const titled = 'title' + visual;",
        "        filters.push('[' + base + ']drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile=' + textPath + ':fontcolor=white:fontsize=' + Math.round(width*.035) + ':box=1:boxcolor=black@0.48:boxborderw=18:x=(w-text_w)/2:y=h*0.78:enable=\\'between(t,' + start.toFixed(3) + ',' + end.toFixed(3) + ')\\'[' + titled + ']'); base = titled; }",
        "      const probe = spawnSync('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=index','-of','csv=p=0',media.path],{encoding:'utf8',timeout:5000});",
        "      if (probe.status === 0 && String(probe.stdout || '').trim()) { const labelAudio='aud'+audioLabels.length; filters.push('['+index+':a:0]atrim=start='+localStart.toFixed(3)+':duration='+Number(clip.duration).toFixed(3)+',asetpts=PTS-STARTPTS,adelay='+Math.round(start*1000)+'|'+Math.round(start*1000)+',volume='+(Number(clip.gain??100)/100).toFixed(3)+',apad=pad_dur='+duration.toFixed(3)+'['+labelAudio+']'); audioLabels.push('['+labelAudio+']'); }",
        "    }",
        "    if (audioLabels.length) { filters.push(audioLabels.join('') + 'amix=inputs=' + audioLabels.length + ':duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]'); args.push('-filter_complex',filters.join(';'),'-map','['+base+']','-map','[aout]'); }",
        "    else args.push('-filter_complex',filters.join(';'),'-map','['+base+']','-an');",
        "    args.push('-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-t',duration.toFixed(3),'-f','mp4','/vercel/sandbox/output.mp4');",
        "  } else {",
        "    const source = '/vercel/sandbox/source.mp4'; const probe = spawnSync('ffmpeg',['-hide_banner','-i',source],{encoding:'utf8',maxBuffer:1048576});",
        "    const hasSourceAudio = /Stream #\\d+:\\d+[^\\n]*Audio:/i.test(probe.stderr || '');",
        "    if (hasSourceAudio) { filters.push('[0:a:0]apad=pad_dur=' + duration.toFixed(3) + '[source_audio]'); audioLabels.push('[source_audio]'); }",
        "    for (let i=0;i<input.audioCount;i++) { const item=input.timelineItems[i],delay=Math.round(item.startSeconds*1000); const trim=item.trimEndSeconds==null?'atrim=start='+item.trimStartSeconds.toFixed(3):'atrim=start='+item.trimStartSeconds.toFixed(3)+':end='+item.trimEndSeconds.toFixed(3); filters.push('['+(i+1)+':a:0]'+trim+',asetpts=PTS-STARTPTS,adelay='+delay+'|'+delay+',volume='+item.gain.toFixed(3)+',apad=pad_dur='+duration.toFixed(3)+'[audio_'+i+']'); audioLabels.push('[audio_'+i+']'); }",
        "    if (!audioLabels.length) throw new Error('No audio tracks');",
        "    filters.push(audioLabels.join('')+'amix=inputs='+audioLabels.length+':duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]');",
        "    args.push('-i',source); for(let i=0;i<input.audioCount;i++)args.push('-i','/vercel/sandbox/audio-'+i+'.mp3');",
        "    args.push('-filter_complex',filters.join(';'),'-map','0:v:0','-map','[aout]','-c:v','copy','-c:a','aac','-b:a','192k','-map_metadata','0','-movflags','+faststart','-t',duration.toFixed(3),'-f','mp4','/vercel/sandbox/output.mp4');",
        "  }",
        "  await writeFile(marker, String(await run(args)));",
        "} catch { await writeFile(marker, '1'); }"
      ].join('\n');
      await sandbox.writeFiles([
        ...files,
        { path: '/vercel/sandbox/render-input.json', content: Buffer.from(JSON.stringify({
          mode: manifest.mode || 'audio',
          durationSeconds: Number(manifest.durationSeconds),
          audioCount: audio.length,
          timelineItems: manifest.timelineItems || [],
          aspect: manifest.aspect,
          clips: (manifest.clips || []).map(clip => ({ ...clip, mediaIndex: clip.mediaIndex, mediaType: clip.mediaType })),
          media: media.map((item, i) => ({
            path: item.sandboxPath,
            image: /image\\//i.test(String(manifest.clips?.find(clip => clip.mediaIndex === i)?.mediaType || '')) || /\\.(png|jpe?g|webp|gif)$/i.test(item.path),
            audio: /audio\\//i.test(String(manifest.clips?.find(clip => clip.mediaIndex === i)?.mediaType || '')),
            duration: Math.max(1, ...((manifest.clips || []).filter(clip => clip.mediaIndex === i).map(clip => clip.duration)))
          }))
        })) },
        { path: '/vercel/sandbox/runner.mjs', content: Buffer.from(runnerSource) }
      ]);
      // The render runs detached: a closed browser cannot terminate the worker.
      const detached = await sandbox.runCommand({ cmd: 'node', args: ['/vercel/sandbox/runner.mjs'], detached: true });
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

  async function purgeExpired() {
    const retentionDays = Math.max(1, Math.min(365, Number(config?.images?.retentionDays) || 30));
    const cutoff = new Date(now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const rows = await db('GET', 'video_studio_render_jobs?status=in.(completed,failed)&updated_at=lt.' +
      encodeURIComponent(cutoff) + '&select=id,output_path&limit=20');
    let removed = 0;
    for (const row of rows || []) {
      if (row.output_path) await storage('DELETE', row.output_path);
      await db('DELETE', 'video_studio_render_jobs?id=eq.' + row.id);
      removed++;
    }
    return removed;
  }

  async function processBatch({ limit = 1 } = {}) {
    if (!enabled) throw new Error('Video Studio render worker is not configured.');
    const polled = await pollRunning();
    const expired = await purgeExpired();
    const staleBefore = new Date(now() - 10 * 60 * 1000).toISOString();
    const staleStarting = await db('GET', 'video_studio_render_jobs?status=eq.starting&updated_at=lt.' +
      encodeURIComponent(staleBefore) + '&select=id,input_manifest&limit=10');
    let recovered = 0;
    for (const row of staleStarting || []) {
      await updateJob(row.id, { status: 'failed', progress: 100, error_code: 'render_start_timeout', error_message: 'The render worker could not start in time. Retry the export.' });
      await Promise.all((row.input_manifest?.source ? [row.input_manifest.source] : []).concat(row.input_manifest?.audio || []).map(path => storage('DELETE', path).catch(() => {})));
      recovered++;
    }
    const claimed = await db('POST', 'rpc/claim_video_studio_render_jobs', { p_limit: Math.max(1, Math.min(1, Number(limit) || 1)) });
    let started = 0;
    for (const row of Array.isArray(claimed) ? claimed : []) { await launch(row); started++; }
    return { enabled: true, started, recovered, expired, ...polled };
  }

  return { enabled, enqueue, enqueueTimeline, status, readOutput, processBatch };
}
