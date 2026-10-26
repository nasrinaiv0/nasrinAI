// User-controlled screen sharing for NasrinAI Realtime Voice.
// Frames are downscaled in memory and dispatched to the active voice transport;
// they are never written to local storage, application storage, or the server.
(() => {
  'use strict';

  const button = document.getElementById('voiceShareScreen');
  if (!button) return;

  let stream = null;
  let video = null;
  let canvas = null;
  let timer = null;
  let captureGeneration = 0;

  function report(active, message) {
    window.dispatchEvent(new CustomEvent('nasrinai:voice-share-status', {
      detail: { active, message }
    }));
  }

  function clearCaptureElements() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    if (video) {
      try { video.pause(); } catch {}
      video.srcObject = null;
    }
    video = null;
    canvas = null;
  }

  function stopSharing(message = 'Screen sharing stopped.', notify = true) {
    const oldStream = stream;
    stream = null;
    captureGeneration += 1;
    clearCaptureElements();
    if (oldStream) {
      for (const track of oldStream.getTracks()) {
        track.onended = null;
        try { track.stop(); } catch {}
      }
    }
    if (notify) report(false, message);
  }

  function sendFrame(generation) {
    if (!stream || generation !== captureGeneration || !video || !canvas ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !video.videoWidth || !video.videoHeight) return;
    const maxWidth = 768;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.58);
      const comma = dataUrl.indexOf(',');
      if (comma < 0) return;
      window.dispatchEvent(new CustomEvent('nasrinai:voice-screen-frame', {
        detail: { mimeType: 'image/jpeg', data: dataUrl.slice(comma + 1) }
      }));
    } catch {
      // Some browser/OS capture surfaces temporarily return an unreadable frame.
      // Skip that frame; never interrupt the voice connection.
    }
  }

  async function startSharing() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      report(false, 'Screen sharing is not supported in this browser. Try a supported desktop browser.');
      return;
    }
    let captured;
    try {
      // The native picker owns permission and source selection. Do not capture
      // system audio; voice continues through the already-open microphone.
      captured = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (error) {
      const message = error?.name === 'NotAllowedError'
        ? 'Screen sharing was cancelled.'
        : 'Could not start screen sharing. Please try again.';
      report(false, message);
      return;
    }

    const track = captured.getVideoTracks()[0];
    if (!track) {
      for (const item of captured.getTracks()) item.stop();
      report(false, 'No screen video source was selected.');
      return;
    }

    stream = captured;
    const generation = ++captureGeneration;
    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    video.className = 'voice-screen-capture';
    video.srcObject = captured;
    document.body.appendChild(video);
    canvas = document.createElement('canvas');

    track.onended = () => {
      if (stream === captured) stopSharing('Screen sharing stopped.');
    };

    try {
      await video.play();
    } catch {
      stopSharing('Could not read the shared screen. Please try again.');
      return;
    }

    report(true, 'Screen sharing is on. Ask NasrinAI about anything on your screen.');
    sendFrame(generation);
    // A low frame rate keeps realtime voice responsive and limits visual payloads.
    timer = setInterval(() => sendFrame(generation), 1300);
  }

  button.addEventListener('click', () => {
    if (button.disabled) return;
    if (stream) stopSharing();
    else void startSharing();
  });

  window.addEventListener('nasrinai:voice-ended', () => {
    if (stream) stopSharing('Voice ended. Screen sharing stopped.');
  });

  window.addEventListener('pagehide', () => {
    if (stream) stopSharing('Screen sharing stopped.');
  });
})();
