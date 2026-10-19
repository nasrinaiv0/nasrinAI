(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const signinPanel = $('signinPanel');
  const studioApp = $('studioApp');
  const signinStatus = $('signinStatus');
  const globalStatus = $('globalStatus');
  let accessToken = '';
  let tokenExpiresAt = 0;
  let pendingEmail = '';
  let captchaSiteKey = '';
  let captchaWidget = null;
  let captchaToken = '';
  let captchaPromise = null;
  let projects = [];
  let assets = [];
  let currentVideoId = '';
  let videoObjectUrl = '';
  let audioConfigured = false;
  let exportAvailable = false;

  async function readError(response) {
    let body = {};
    try { body = await response.json(); } catch {}
    const error = body?.error || {};
    const err = new Error(typeof error.message === 'string' ? error.message : 'The request could not be completed.');
    err.status = response.status;
    err.code = error.code || 'request_failed';
    return err;
  }

  async function raw(path, options = {}, auth = true, retry = true) {
    if (auth) await ensureSession();
    const headers = new Headers(options.headers || {});
    if (auth && accessToken) headers.set('Authorization', 'Bearer ' + accessToken);
    const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
    if (auth && response.status === 401 && retry) {
      await refreshSession();
      if (accessToken) return raw(path, options, auth, false);
    }
    if (!response.ok) throw await readError(response);
    return response;
  }

  async function api(path, options = {}, auth = true) {
    const response = await raw(path, options, auth);
    if (response.status === 204) return {};
    const type = response.headers.get('content-type') || '';
    return type.includes('application/json') ? response.json() : response;
  }

  async function postAuth(path, body) {
    const response = await fetch(path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!response.ok) throw await readError(response);
    return response.json();
  }

  async function refreshSession() {
    try {
      const response = await fetch('/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) {
        accessToken = '';
        tokenExpiresAt = 0;
        return false;
      }
      const data = await response.json();
      setSession(data);
      return true;
    } catch {
      accessToken = '';
      tokenExpiresAt = 0;
      return false;
    }
  }

  function setSession(data) {
    if (!data || typeof data.access_token !== 'string') throw new Error('Sign-in did not return a valid session.');
    accessToken = data.access_token;
    tokenExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    const email = typeof data.user?.email === 'string' ? data.user.email : pendingEmail;
    $('accountLabel').textContent = email || 'Signed in';
    $('signOut').hidden = false;
    signinPanel.hidden = true;
    studioApp.hidden = false;
  }

  async function ensureSession() {
    if (accessToken && tokenExpiresAt - Date.now() > 60_000) return;
    if (!(await refreshSession())) throw Object.assign(new Error('Your Studio session has expired. Sign in again.'), { status: 401, code: 'session_expired' });
  }

  async function captchaTokenForSignIn() {
    if (!captchaSiteKey) return '';
    if (captchaToken) {
      const value = captchaToken;
      captchaToken = '';
      return value;
    }
    if (!window.turnstile) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('The security check could not load. Please try again.'));
        document.head.appendChild(script);
      });
    }
    if (captchaWidget === null) {
      captchaWidget = window.turnstile.render('#turnstileWidget', {
        sitekey: captchaSiteKey,
        appearance: 'interaction-only',
        callback: (token) => { captchaToken = token; if (captchaPromise) { captchaPromise.resolve(token); captchaPromise = null; } },
        'expired-callback': () => { captchaToken = ''; },
        'error-callback': () => { captchaToken = ''; if (captchaPromise) { captchaPromise.reject(new Error('The security check failed. Please try again.')); captchaPromise = null; } }
      });
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { captchaPromise = null; reject(new Error('The security check timed out. Please try again.')); }, 20_000);
      captchaPromise = {
        resolve: (token) => { clearTimeout(timer); resolve(token); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      };
      try { window.turnstile.reset(captchaWidget); } catch {}
    });
  }

  async function loadPublicStatus() {
    try {
      const response = await fetch('/v1/status', { credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      captchaSiteKey = typeof data.turnstile?.site_key === 'string' ? data.turnstile.site_key : '';
      if (data.sign_in && data.sign_in.email === false) {
        $('emailForm').hidden = true;
        signinStatus.textContent = 'Email sign-in is not enabled for this deployment. Contact support for account access.';
      }
    } catch {}
  }

  $('emailForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = $('email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { signinStatus.textContent = 'Enter a valid email address.'; return; }
    $('sendCode').disabled = true;
    signinStatus.textContent = 'Sending a secure sign-in code…';
    try {
      const captcha_token = await captchaTokenForSignIn();
      await postAuth('/v1/auth/email/start', { email, ...(captcha_token ? { captcha_token } : {}) });
      pendingEmail = email;
      $('emailForm').hidden = true;
      $('codeForm').hidden = false;
      signinStatus.textContent = 'Check your inbox for the verification code.';
      $('code').focus();
    } catch (error) {
      signinStatus.textContent = error.message || 'Could not send a sign-in code.';
    } finally {
      $('sendCode').disabled = false;
      if (captchaWidget !== null && window.turnstile) { try { window.turnstile.reset(captchaWidget); } catch {} }
    }
  });

  $('codeForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = $('code').value.replace(/\s+/g, '');
    if (!/^\d{6,10}$/.test(code)) { signinStatus.textContent = 'Enter the verification code from your email.'; return; }
    $('verifyCode').disabled = true;
    signinStatus.textContent = 'Verifying…';
    try {
      const data = await postAuth('/v1/auth/email/verify', { email: pendingEmail, code });
      setSession(data);
      await loadStudio();
    } catch (error) {
      signinStatus.textContent = error.message || 'Sign-in failed. Check the code and try again.';
    } finally { $('verifyCode').disabled = false; }
  });

  $('changeEmail').addEventListener('click', () => {
    $('codeForm').hidden = true;
    $('emailForm').hidden = false;
    $('code').value = '';
    signinStatus.textContent = '';
  });

  $('signOut').addEventListener('click', async () => {
    try { await raw('/v1/auth/signout', { method: 'POST' }); } catch {}
    accessToken = '';
    tokenExpiresAt = 0;
    projects = [];
    assets = [];
    studioApp.hidden = true;
    signinPanel.hidden = false;
    $('accountLabel').textContent = 'Not signed in';
    $('signOut').hidden = true;
    signinStatus.textContent = 'You have signed out.';
  });

  function setStatus(message, error = false) {
    globalStatus.textContent = message;
    globalStatus.classList.toggle('error', error);
  }

  function selectedProjectId() { return $('projectSelect').value || ''; }

  async function loadProjects() {
    const result = await api('/v1/projects');
    projects = Array.isArray(result.projects) ? result.projects : [];
    const select = $('projectSelect');
    const previous = select.value;
    select.replaceChildren();
    for (const project of projects) {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      select.appendChild(option);
    }
    if (!projects.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Create a project to get started';
      select.appendChild(option);
    } else if (projects.some(p => p.id === previous)) select.value = previous;
    return projects;
  }

  async function loadAssets() {
    const result = await api('/v1/video-studio/audio-assets');
    assets = Array.isArray(result.assets) ? result.assets : [];
    renderAssets();
  }

  async function loadTimeline() {
    const projectId = selectedProjectId();
    const target = $('timeline');
    target.replaceChildren();
    if (!projectId) {
      const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'Create or select a project to manage its timeline.'; target.appendChild(empty); return;
    }
    const result = await api('/v1/video-studio/timeline?project_id=' + encodeURIComponent(projectId));
    if (!result.items?.length) {
      const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'No audio clips yet. Add one from Saved audio.'; target.appendChild(empty); return;
    }
    for (const item of result.items) {
      const card = document.createElement('article'); card.className = 'timeline-item';
      const head = document.createElement('div'); head.className = 'timeline-head';
      const title = document.createElement('strong'); title.textContent = item.asset?.label || 'Audio clip';
      const lane = document.createElement('span'); lane.className = 'pill'; lane.textContent = 'Lane ' + item.lane;
      head.append(title, lane);
      const controls = document.createElement('div'); controls.className = 'timeline-controls';
      const startWrap = document.createElement('label'); startWrap.textContent = 'Start (seconds)';
      const start = document.createElement('input'); start.type = 'number'; start.min = '0'; start.max = '3600'; start.step = '0.1'; start.value = item.startSeconds;
      startWrap.appendChild(start);
      const gainWrap = document.createElement('label'); gainWrap.textContent = 'Gain (0–2)';
      const gain = document.createElement('input'); gain.type = 'number'; gain.min = '0'; gain.max = '2'; gain.step = '0.1'; gain.value = item.gain;
      gainWrap.appendChild(gain);
      controls.append(startWrap, gainWrap);
      const actions = document.createElement('div'); actions.className = 'asset-actions';
      const save = document.createElement('button'); save.className = 'button secondary'; save.type = 'button'; save.textContent = 'Save timing';
      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          await api('/v1/video-studio/timeline/' + encodeURIComponent(item.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projectId, start_seconds: Number(start.value), gain: Number(gain.value) })
          });
          setStatus('Timeline timing saved.');
          await loadTimeline();
        } catch (error) { setStatus(error.message, true); }
        finally { save.disabled = false; }
      });
      const remove = document.createElement('button'); remove.className = 'button quiet'; remove.type = 'button'; remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try {
          await api('/v1/video-studio/timeline/' + encodeURIComponent(item.id) + '?project_id=' + encodeURIComponent(projectId), { method: 'DELETE' });
          setStatus('Clip removed from timeline.');
          await loadTimeline();
        } catch (error) { setStatus(error.message, true); }
        finally { remove.disabled = false; }
      });
      actions.append(save, remove);
      card.append(head, controls, actions);
      target.appendChild(card);
    }
  }

  function renderAssets() {
    const target = $('assetList');
    target.replaceChildren();
    if (!assets.length) {
      const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'Your generated audio assets will appear here.'; target.appendChild(empty); return;
    }
    for (const asset of assets) {
      const card = document.createElement('article'); card.className = 'asset-card';
      const head = document.createElement('div'); head.className = 'asset-head';
      const title = document.createElement('strong'); title.textContent = asset.label || (asset.kind === 'voiceover' ? 'AI voiceover' : 'Sound effect');
      const kind = document.createElement('span'); kind.className = 'pill'; kind.textContent = asset.kind === 'voiceover' ? 'Voiceover' : 'Sound effect';
      head.append(title, kind);
      const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none';
      const actions = document.createElement('div'); actions.className = 'asset-actions';
      const preview = document.createElement('button'); preview.className = 'button quiet'; preview.type = 'button'; preview.textContent = 'Load preview';
      preview.addEventListener('click', async () => {
        preview.disabled = true;
        try {
          if (!audio.dataset.loaded) {
            const response = await raw(asset.content_url);
            const blob = await response.blob();
            audio.src = URL.createObjectURL(blob);
            audio.dataset.loaded = 'true';
            preview.textContent = 'Preview loaded';
          }
          audio.focus();
        } catch (error) { setStatus(error.message || 'Could not load this audio preview.', true); }
        finally { preview.disabled = false; }
      });
      const download = document.createElement('button'); download.className = 'button quiet'; download.type = 'button'; download.textContent = 'Download MP3';
      download.addEventListener('click', async () => {
        download.disabled = true;
        try {
          const response = await raw(asset.content_url);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = url; link.download = asset.kind === 'voiceover' ? 'nasrinai-voiceover.mp3' : 'nasrinai-sound-effect.mp3'; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (error) { setStatus(error.message, true); }
        finally { download.disabled = false; }
      });
      const add = document.createElement('button'); add.className = 'button secondary'; add.type = 'button'; add.textContent = 'Add to timeline';
      add.disabled = !selectedProjectId();
      add.addEventListener('click', async () => {
        add.disabled = true;
        try {
          await api('/v1/video-studio/timeline', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: selectedProjectId(), audio_asset_id: asset.id, start_seconds: 0 })
          });
          setStatus('Audio added to project timeline.');
          await loadTimeline();
        } catch (error) { setStatus(error.message, true); }
        finally { add.disabled = !selectedProjectId(); }
      });
      const remove = document.createElement('button'); remove.className = 'button quiet'; remove.type = 'button'; remove.textContent = 'Delete';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Delete this audio asset and remove its timeline placements?')) return;
        remove.disabled = true;
        try {
          await api('/v1/video-studio/audio-assets/' + encodeURIComponent(asset.id), { method: 'DELETE' });
          assets = assets.filter(a => a.id !== asset.id);
          renderAssets(); await loadTimeline(); setStatus('Audio asset deleted.');
        } catch (error) { setStatus(error.message, true); }
        finally { remove.disabled = false; }
      });
      actions.append(preview, download, add, remove);
      card.append(head, audio, actions);
      target.appendChild(card);
    }
  }

  async function loadVoices() {
    const result = await api('/v1/video-studio/elevenlabs/voices');
    const select = $('voiceSelect');
    select.replaceChildren();
    for (const voice of result.voices || []) {
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = voice.name;
      select.appendChild(option);
    }
    if (!select.options.length) {
      const option = document.createElement('option'); option.value = ''; option.textContent = 'No voices available'; select.appendChild(option);
    }
  }

  async function loadStudio() {
    signinPanel.hidden = true;
    studioApp.hidden = false;
    try {
      const status = await api('/v1/video-studio/elevenlabs/status');
      audioConfigured = status.configured === true;
      exportAvailable = status.video_export_available === true;
      $('audioStatusPill').textContent = audioConfigured ? 'Configured' : 'Not configured';
      $('generateVoice').disabled = !audioConfigured;
      $('generateEffect').disabled = !audioConfigured;
      $('exportVideo').disabled = !exportAvailable;
      if (!audioConfigured) setStatus('Audio generation is not configured on this deployment. Saved project data remains available.', true);
      else if (!exportAvailable) setStatus('Audio generation is configured; MP4 export is not available on this deployment.', true);
      else setStatus('Studio ready. Choose a project, create audio, arrange the timeline, and export.');
      await loadProjects();
      await Promise.all([loadAssets(), loadVoices().catch(error => setStatus(error.message, true))]);
      await loadTimeline();
    } catch (error) {
      if (error.status === 401) {
        studioApp.hidden = true; signinPanel.hidden = false; signinStatus.textContent = 'Sign in to open your Studio workspace.'; return;
      }
      setStatus(error.message || 'Studio could not be loaded.', true);
    }
  }

  $('createProject').addEventListener('click', async () => {
    const name = window.prompt('Name your Video Studio project:', 'My Video Project');
    if (!name || !name.trim()) return;
    try {
      await api('/v1/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), description: 'Created in NasrinAI Video Studio' }) });
      await loadProjects(); await loadTimeline(); setStatus('Project created.');
    } catch (error) { setStatus(error.message, true); }
  });

  $('projectSelect').addEventListener('change', async () => {
    renderAssets();
    try { await loadTimeline(); } catch (error) { setStatus(error.message, true); }
  });
  $('refreshStudio').addEventListener('click', async () => {
    try { await loadProjects(); await Promise.all([loadAssets(), loadVoices().catch(() => {})]); await loadTimeline(); setStatus('Studio refreshed.'); }
    catch (error) { setStatus(error.message, true); }
  });
  $('refreshAssets').addEventListener('click', async () => { try { await loadAssets(); setStatus('Audio assets refreshed.'); } catch (error) { setStatus(error.message, true); } });
  $('refreshTimeline').addEventListener('click', async () => { try { await loadTimeline(); setStatus('Timeline refreshed.'); } catch (error) { setStatus(error.message, true); } });

  $('videoForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const prompt = $('videoPrompt').value.trim();
    if (!prompt) return;
    $('createVideo').disabled = true;
    const result = $('videoResult');
    result.hidden = false;
    result.textContent = 'Starting video generation…';
    try {
      const data = await api('/v1/videos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, seconds: Number($('videoSeconds').value) }) });
      if (!data.video_id) throw new Error('The video job could not be started.');
      currentVideoId = data.video_id;
      $('exportVideoId').value = currentVideoId;
      result.replaceChildren();
      const label = document.createElement('p'); label.className = 'muted'; label.textContent = 'Rendering video…'; result.appendChild(label);
      const id = data.video_id;
      const poll = async () => {
        try {
          const state = await api('/v1/videos/' + encodeURIComponent(id));
          if (state.status === 'failed') { label.textContent = state.error?.message || 'Video generation failed.'; $('createVideo').disabled = false; return; }
          if (state.status !== 'completed') { label.textContent = 'Rendering video · ' + Math.max(1, Number(state.progress) || 1) + '%'; setTimeout(poll, 8000); return; }
          label.textContent = 'Video ready · Job ID: ' + id;
          const response = await raw(state.download);
          const blob = await response.blob();
          if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
          videoObjectUrl = URL.createObjectURL(blob);
          const video = document.createElement('video'); video.controls = true; video.preload = 'metadata'; video.src = videoObjectUrl;
          const download = document.createElement('a'); download.className = 'button secondary'; download.href = videoObjectUrl; download.download = 'nasrinai-video.mp4'; download.textContent = 'Download source MP4';
          result.append(video, download);
          $('createVideo').disabled = false;
        } catch (error) {
          if (error.status === 403) { label.textContent = error.message; $('createVideo').disabled = false; return; }
          label.textContent = 'Checking render status again…'; setTimeout(poll, 12000);
        }
      };
      poll();
    } catch (error) {
      result.textContent = error.message || 'Could not start video generation.';
      $('createVideo').disabled = false;
    }
  });

  $('voiceForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = $('voiceScript').value.trim();
    if (!text) { setStatus('Enter a narration script first.', true); return; }
    $('generateVoice').disabled = true;
    try {
      await api('/v1/video-studio/elevenlabs/voiceover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: $('voiceSelect').value, model_id: $('modelSelect').value, label: 'Voiceover' })
      });
      await loadAssets(); setStatus('Voiceover generated and saved. Add it to your project timeline.');
    } catch (error) { setStatus(error.message, true); }
    finally { $('generateVoice').disabled = !audioConfigured; }
  });

  $('effectForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const prompt = $('effectPrompt').value.trim();
    if (!prompt) { setStatus('Describe the sound effect first.', true); return; }
    $('generateEffect').disabled = true;
    try {
      await api('/v1/video-studio/elevenlabs/sound-effects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, duration_seconds: Number($('effectDuration').value), label: 'Sound effect' })
      });
      await loadAssets(); setStatus('Sound effect generated and saved. Add it to your project timeline.');
    } catch (error) { setStatus(error.message, true); }
    finally { $('generateEffect').disabled = !audioConfigured; }
  });

  $('exportVideo').addEventListener('click', async () => {
    const videoId = $('exportVideoId').value.trim();
    const projectId = selectedProjectId();
    if (!videoId) { setStatus('Generate a video or enter a completed video job ID first.', true); return; }
    if (!projectId) { setStatus('Create or select a project first.', true); return; }
    $('exportVideo').disabled = true;
    const old = $('exportVideo').textContent;
    $('exportVideo').textContent = 'Rendering MP4…';
    try {
      const response = await raw('/v1/video-studio/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, project_id: projectId })
      });
      const blob = await response.blob();
      if (!blob.size || blob.size > 50 * 1024 * 1024) throw new Error('The exported MP4 is empty or exceeds the 50 MB download limit.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'nasrinai-video-with-audio.mp4'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus('Export complete. The MP4 includes the selected timeline audio.');
    } catch (error) { setStatus(error.message || 'MP4 export failed.', true); }
    finally { $('exportVideo').disabled = !exportAvailable; $('exportVideo').textContent = old; }
  });

  (async () => {
    await loadPublicStatus();
    if (await refreshSession()) {
      try { await loadStudio(); } catch (error) { setStatus(error.message, true); }
    } else {
      signinPanel.hidden = false;
      studioApp.hidden = true;
    }
  })();
})();
