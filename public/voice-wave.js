// Voice visuals, black and white, in two places:
//   1. the full-screen voice conversation (#voiceWave): a glowing liquid orb in
//      the lower centre that ripples out sound waves (createOrb)
//   2. the message box while you dictate: the fluid sound wave (createWave,
//      mounted by app.js with NasrinWave.composer)
// Plain script, no libraries, no inline code or inline styles (the page CSP
// forbids them). Colour comes from CSS (--ink), so it is black on Light and
// white on Dark and follows Settings > Appearance by itself.
//
// It follows:
//   - the voice screen's data-state: listening | speaking | thinking | paused | ...
//   - Nasrin.talk(0..1), the real loudness of Nasrin's voice being played
//   - YOUR voice: taller and tighter waves the louder you speak, flat when quiet
//
// Each visual has:
//   attach(stream)  reads the level of a microphone stream the app already opened
//                   (never opens a second microphone)
//   detach()        stops reading it
//   hear(0..1)      a level estimate where there is no stream (browser speech
//                   recognition): each new words event bumps it, then it fades
//   speechOn(bool)  the recognizer says you started / stopped talking
// The voice screen's orb is NasrinVoiceWave; the message box's wave is made by
// NasrinWave.composer(element).
// Less motion (device setting or Settings > General > Reduce motion) draws a
// calm still picture instead of animating.
(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motionQuery.matches || document.documentElement.getAttribute('data-motion') === 'reduce';

  // One entry per ribbon: height, waves across, speed, start phase, line width, opacity.
  const LAYERS = [
    { a: 1.00, f: 1.5, s: 1.2,  o: 0, w: 2.2, op: 1.00 },
    { a: 0.88, f: 2.0, s: -1.6, o: 2, w: 2.0, op: 0.80 },
    { a: 0.76, f: 2.6, s: 2.0,  o: 4, w: 1.8, op: 0.62 },
    { a: 0.62, f: 3.2, s: -2.4, o: 1, w: 1.6, op: 0.48 },
    { a: 0.46, f: 4.0, s: 2.9,  o: 5, w: 1.2, op: 0.34 },
    { a: 0.30, f: 1.1, s: 0.9,  o: 3, w: 1.6, op: 1.00, core: true }
  ];

  // How each voice state moves: resting height, extra swing, speed.
  const STATES = {
    listening: { base: 0.20, swing: 0.16, speed: 1.0 },
    speaking:  { base: 0.26, swing: 0.28, speed: 1.3 },
    thinking:  { base: 0.14, swing: 0.05, speed: 2.2 },
    paused:    { base: 0.03, swing: 0,    speed: 0.4 }
  };
  const IDLE = { base: 0.07, swing: 0.02, speed: 0.6 };

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  // Your voice level: read from a microphone stream the app already opened
  // (never a second microphone), or, without one, estimated from
  // speech-recognition events.
  function meter() {
    let mic = 0;            // your loudness from the microphone stream, eased
    let heard = 0;          // estimate from speech-recognition events, fades fast
    let talking = false;    // the recognizer says you are talking right now
    let micCtx = null, micSource = null, micAnalyser = null, micBuf = null;

    function detach() {
      try { if (micSource) micSource.disconnect(); } catch (e) { /* already apart */ }
      try { if (micCtx) micCtx.close(); } catch (e) { /* already closed */ }
      micCtx = micSource = micAnalyser = micBuf = null;
      mic = 0;
    }
    function attach(stream) {
      detach();
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC || !stream || !stream.getAudioTracks().length) return;
        micCtx = new AC();
        if (micCtx.resume) micCtx.resume().catch(() => {});
        micSource = micCtx.createMediaStreamSource(stream);   // the same stream, not a new microphone
        micAnalyser = micCtx.createAnalyser();
        micAnalyser.fftSize = 512;
        micSource.connect(micAnalyser);                       // never to the speakers: no echo
        micBuf = new Uint8Array(micAnalyser.fftSize);
      } catch (e) { detach(); }
    }
    function read(dt) {
      let raw = 0;
      if (micAnalyser) {
        micAnalyser.getByteTimeDomainData(micBuf);
        let sum = 0;
        for (let i = 0; i < micBuf.length; i++) { const v = (micBuf[i] - 128) / 128; sum += v * v; }
        raw = Math.min(1, Math.max(0, Math.sqrt(sum / micBuf.length) - 0.01) * 8);   // below the hiss = silence
      }
      // Rises fast, falls slowly, like a real level meter.
      mic += (raw - mic) * (1 - Math.exp(-dt / (raw > mic ? 0.03 : 0.18)));
      heard *= Math.exp(-dt / 0.35);
      return { mic, heard, talking };
    }
    return {
      attach, detach, read,
      hear(value) { heard = Math.max(heard, Math.max(0, Math.min(1, Number(value) || 0))); },
      speechOn(on) { talking = !!on; },
      reset() { detach(); heard = 0; talking = false; },
      hasStream: () => Boolean(micAnalyser)
    };
  }

  // Shared by both visuals: how high the motion should be right now, from the
  // state, Nasrin's voice (ext) and yours.
  function target(state, stateName, m, v, ext, t) {
    const wander = 0.5 + 0.5 * Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1.7);
    // Your voice only shapes the motion while it is your turn.
    const yours = stateName === 'listening'
      ? Math.max(v.mic, v.heard, v.talking ? 0.3 + 0.2 * wander : 0)
      : 0;
    // With a real level reading, silence is calm; without one, keep a soft drift.
    const swing = state.swing * (m.hasStream() && stateName === 'listening' ? 0.2 : 1);
    return { level: state.base + swing * wander + ext * 0.85 + yours * 0.95, yours };
  }

  let serial = 0;

  // cfg: W, H (drawing size), N (points per line), blur, soft (blur sizes),
  //      stroke (line width scale), stateName() -> string, active() -> bool,
  //      watch: [[node, [attribute names]]] (what to re-check when it changes),
  //      fit: true = stretch the drawing to the element's real shape (edge to edge),
  //      envPow: how fast the wave thins toward the ends (smaller = reaches further),
  //      edge: how much of each end fades out, freq: waves-across multiplier
  function createWave(host, cfg) {
    const id = 'vw' + (++serial);
    let W = cfg.W, N = cfg.N;
    const H = cfg.H, CY = H / 2, AMP = H * 0.373, SW = cfg.stroke || 1, FREQ = cfg.freq || 1, EDGE = cfg.edge || 0.16;
    const layers = LAYERS.map((l) => Object.assign({}, l));

    // ---------- drawing ----------
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false' }, host);
    const defs = el('defs', {}, svg);
    const blur = el('filter', { id: id + 'b', x: '-10%', y: '-60%', width: '120%', height: '220%' }, defs);
    el('feGaussianBlur', { stdDeviation: String(cfg.blur) }, blur);
    const soft = el('filter', { id: id + 's', x: '-10%', y: '-60%', width: '120%', height: '220%' }, defs);
    el('feGaussianBlur', { stdDeviation: String(cfg.soft) }, soft);
    const grad = el('linearGradient', { id: id + 'g', x1: '0', x2: '1' }, defs);
    el('stop', { offset: '0', 'stop-color': '#000' }, grad);
    el('stop', { offset: String(EDGE), 'stop-color': '#fff' }, grad);
    el('stop', { offset: String(1 - EDGE), 'stop-color': '#fff' }, grad);
    el('stop', { offset: '1', 'stop-color': '#000' }, grad);
    const mask = el('mask', { id: id + 'm', maskUnits: 'userSpaceOnUse', x: '0', y: '0', width: String(W), height: String(H) }, defs);
    const maskRect = el('rect', { width: String(W), height: String(H), fill: 'url(#' + id + 'g)' }, mask);

    const stage = el('g', { mask: 'url(#' + id + 'm)' }, svg);
    const fills = el('g', { class: 'vw-fills' }, stage);
    const glows = el('g', { class: 'vw-glows', filter: 'url(#' + id + 'b)' }, stage);
    const lines = el('g', { class: 'vw-lines', filter: 'url(#' + id + 's)' }, stage);

    for (const L of layers) {
      L.fill = el('path', { class: 'vw-fill', 'fill-opacity': L.core ? 0 : 0.1 * L.op }, fills);
      L.glow = el('path', { class: 'vw-glow', 'stroke-width': (L.core ? 3.5 : 7) * SW, opacity: L.op }, glows);
      L.top = el('path', { class: 'vw-line', 'stroke-width': L.w * SW, opacity: L.op }, lines);
      L.bot = el('path', { class: 'vw-line', 'stroke-width': L.core ? 0 : L.w * 0.6 * SW, opacity: L.op * 0.5 }, lines);
    }

    let xs = [], env = [];
    function layout(width) {
      W = width;
      N = cfg.fit ? Math.max(60, Math.round(W / 4)) : cfg.N;
      xs = []; env = [];
      for (let i = 0; i <= N; i++) {
        xs.push((i / N * W).toFixed(1));
        env.push(Math.pow(Math.sin(Math.PI * i / N), cfg.envPow || 3));
      }
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      mask.setAttribute('width', String(W));
      maskRect.setAttribute('width', String(W));
    }
    layout(W);
    // Fit: match the drawing to the element's real shape so the wave reaches both
    // sides at any screen width, with the same line thickness everywhere.
    function fit() {
      if (!cfg.fit) return;
      const r = svg.getBoundingClientRect();
      if (r.width < 20 || r.height < 8) return;
      const w = Math.round(H * r.width / r.height);
      if (Math.abs(w - W) > 2) { layout(w); if (!raf) render(phase, level, 1); }
    }

    function render(phase, level, spread) {
      for (const L of layers) {
        const ph = phase * L.s + L.o;
        const amp = AMP * L.a * level;
        let top = '', bot = '', back = '';
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const f = L.f * FREQ * spread;   // louder = more, tighter waves
          const w = Math.sin(f * 6.2832 * u + ph) * 0.62
                  + Math.sin(f * 1.7 * 6.2832 * u - ph * 0.8 + 1.3) * 0.26
                  + Math.sin(f * 2.9 * 6.2832 * u + ph * 1.4) * 0.12;
          const y = CY - w * env[i] * amp;
          const m = 2 * CY - y;   // the lower line mirrors the upper one
          const t = xs[i] + ' ' + y.toFixed(1);
          const b = xs[i] + ' ' + m.toFixed(1);
          top += (i ? 'L' : 'M') + t;
          bot += (i ? 'L' : 'M') + b;
          back = 'L' + b + back;
        }
        L.top.setAttribute('d', top);
        L.glow.setAttribute('d', top);
        L.bot.setAttribute('d', bot);
        L.fill.setAttribute('d', top + back + 'Z');
      }
    }

    // ---------- motion ----------
    let ext = 0;            // loudness of Nasrin's voice being played, 0..1
    let level = 0.07;       // the wave's current height, eased
    let phase = 0;
    let last = 0;
    let raf = 0;
    let state = IDLE;
    let stateName = '';
    let paused = false;

    // ---------- your voice ----------
    const m = meter();
    function push(value) { ext = Math.max(0, Math.min(1, Number(value) || 0)); }

    const read = () => {
      stateName = cfg.stateName();
      state = STATES[stateName] || IDLE;
      paused = stateName === 'paused';
      if (!cfg.active()) m.reset();
    };

    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      const t = now / 1000;
      ext *= Math.pow(0.04, dt);   // the voice level fades if no new reading arrives
      const { level: goal, yours } = target(state, stateName, m, m.read(dt), ext, t);
      level += (goal - level) * Math.min(1, dt * (goal > level ? 14 : 6));
      phase += dt * state.speed * (1 + yours * 0.6);
      render(phase, Math.min(1.15, level), 0.88 + 0.45 * Math.min(1, level));
      schedule();
    }

    const running = () => cfg.active() && !document.hidden && !reduced();
    function schedule() {
      if (!raf && running()) raf = requestAnimationFrame(frame);
    }
    function refresh() {
      fit();
      read();
      if (reduced()) {
        // Less motion: one calm wave, redrawn only when the state changes.
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        render(1.2, paused ? 0.03 : 0.16, 1);
        return;
      }
      last = performance.now();
      schedule();
    }

    for (const [node, attrs] of cfg.watch) {
      new MutationObserver(refresh).observe(node, { attributes: true, attributeFilter: attrs });
    }
    new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    document.addEventListener('visibilitychange', refresh);
    if (cfg.fit) {
      if (window.ResizeObserver) new ResizeObserver(fit).observe(host);
      window.addEventListener('resize', fit);
    }
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', refresh);

    render(0, 0.07, 1);
    refresh();
    return { attach: m.attach, detach: m.detach, hear: m.hear, speechOn: m.speechOn, push };
  }

  // ---------- the liquid orb (voice screen) ----------
  // A soft glowing drop of ink that wobbles like liquid with the voice, and
  // sends out rings, its sound waves: more and brighter the louder it gets.
  const ORB_STATES = {
    listening: { base: 0.16, swing: 0.10, speed: 0.9 },
    speaking:  { base: 0.22, swing: 0.20, speed: 1.2 },
    thinking:  { base: 0.10, swing: 0.05, speed: 2.0 },
    paused:    { base: 0.02, swing: 0,    speed: 0.3 }
  };
  const ORB_IDLE = { base: 0.06, swing: 0.02, speed: 0.5 };
  const RINGS = 3;

  function createOrb(host, cfg) {
    const id = 'vo' + (++serial);
    const S = 400, C = S / 2, R0 = 80, N = 48;
    const svg = el('svg', { viewBox: '0 0 ' + S + ' ' + S, 'aria-hidden': 'true', focusable: 'false' }, host);
    const defs = el('defs', {}, svg);
    const glowF = el('filter', { id: id + 'g', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: '18' }, glowF);
    const sheenF = el('filter', { id: id + 's', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: '7' }, sheenF);
    // Colour comes from CSS (.vo-a/.vo-b stop-color: var(--ink)).
    const body = el('radialGradient', { id: id + 'b', cx: '0.38', cy: '0.32', r: '0.75' }, defs);
    el('stop', { offset: '0', class: 'vo-a' }, body);
    el('stop', { offset: '1', class: 'vo-b' }, body);

    const rings = [];
    for (let i = 0; i < RINGS; i++) rings.push(el('path', { class: 'vo-ring' }, svg));
    const glow = el('path', { class: 'vo-glow', filter: 'url(#' + id + 'g)' }, svg);
    const drop = el('path', { class: 'vo-body', fill: 'url(#' + id + 'b)' }, svg);
    const sheen = el('path', { class: 'vo-sheen', filter: 'url(#' + id + 's)' }, svg);

    // A smooth closed shape through the points (Catmull-Rom as Bezier curves).
    function shape(rs, scale, cx, cy) {
      const pts = rs.map((r, i) => {
        const a = i / N * 6.2832;
        return [cx + Math.cos(a) * r * scale, cy + Math.sin(a) * r * scale];
      });
      let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
      for (let i = 0; i < N; i++) {
        const p0 = pts[(i + N - 1) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
        d += 'C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)
          + ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)
          + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
      }
      return d + 'Z';
    }

    function render(phase, level, waves, ringPhase) {
      const lv = Math.min(1.2, level);
      const R = R0 * (1 + 0.10 * lv);
      const rs = [];
      for (let i = 0; i < N; i++) {
        const a = i / N * 6.2832;
        rs.push(R * (1 + lv * (0.10 * Math.sin(2 * a + phase * 1.3)
          + 0.07 * Math.sin(3 * a - phase * 1.7 + 1)
          + 0.05 * Math.sin(5 * a + phase * 2.3 + 2)
          + 0.03 * Math.sin(7 * a - phase * 3.1))));
      }
      const d = shape(rs, 1, C, C);
      drop.setAttribute('d', d);
      glow.setAttribute('d', shape(rs, 1.08, C, C));
      sheen.setAttribute('d', shape(rs, 0.42, C - R * 0.28, C - R * 0.34));
      for (let i = 0; i < RINGS; i++) {
        const p = (ringPhase + i / RINGS) % 1;
        const ring = rings[i];
        if (!waves) { ring.setAttribute('opacity', '0'); continue; }
        ring.setAttribute('d', shape(rs, 1.06 + p * 1.15, C, C));
        ring.setAttribute('stroke-width', (2.4 * (1 - p) + 0.4).toFixed(2));
        ring.setAttribute('opacity', (Math.pow(1 - p, 1.6) * (0.08 + 0.55 * Math.min(1, lv))).toFixed(3));
      }
    }

    let ext = 0, level = 0.06, phase = 0, ringPhase = 0, last = 0, raf = 0;
    let state = ORB_IDLE, stateName = '';
    const m = meter();
    function push(value) { ext = Math.max(0, Math.min(1, Number(value) || 0)); }

    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      ext *= Math.pow(0.04, dt);
      const { level: goal, yours } = target(state, stateName, m, m.read(dt), ext, now / 1000);
      level += (goal - level) * Math.min(1, dt * (goal > level ? 12 : 5));
      phase += dt * state.speed * (1 + yours * 0.6);
      ringPhase = (ringPhase + dt * (0.22 + Math.min(1, level) * 0.9)) % 1;   // louder: faster waves
      render(phase, level, stateName !== 'paused', ringPhase);
      schedule();
    }

    const running = () => cfg.active() && !document.hidden && !reduced();
    function schedule() {
      if (!raf && running()) raf = requestAnimationFrame(frame);
    }
    function refresh() {
      stateName = cfg.stateName();
      state = ORB_STATES[stateName] || ORB_IDLE;
      if (!cfg.active()) m.reset();
      if (reduced()) {
        // Less motion: one calm drop, no waves, redrawn only when the state changes.
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        render(1.2, stateName === 'paused' ? 0.02 : 0.12, false, 0);
        return;
      }
      last = performance.now();
      schedule();
    }

    for (const [node, attrs] of cfg.watch) {
      new MutationObserver(refresh).observe(node, { attributes: true, attributeFilter: attrs });
    }
    new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    document.addEventListener('visibilitychange', refresh);
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', refresh);

    render(0, 0.06, false, 0);
    refresh();
    return { attach: m.attach, detach: m.detach, hear: m.hear, speechOn: m.speechOn, push };
  }

  // ---------- the voice conversation screen: the orb ----------
  const host = document.getElementById('voiceWave');
  const voice = document.getElementById('voice');
  if (host && voice) {
    const wave = createOrb(host, {
      stateName: () => voice.dataset.state || '',
      active: () => !voice.hidden,
      watch: [[voice, ['hidden', 'data-state']]]
    });
    window.NasrinVoiceWave = { attach: wave.attach, detach: wave.detach, hear: wave.hear, speechOn: wave.speechOn };

    // Follow the real loudness of the spoken reply.
    const character = window.Nasrin;
    if (character && typeof character.talk === 'function') {
      const original = character.talk;
      character.talk = function (value) {
        wave.push(value);
        return original.apply(this, arguments);
      };
    }
  }

  // ---------- the message box, while you dictate ----------
  // app.js passes the element it shows only while listening (class is-active).
  window.NasrinWave = {
    composer(box) {
      if (!box) return null;
      return createWave(box, {
        W: 600, H: 70, N: 140, blur: 4.5, soft: 0.6, stroke: 0.9,
        fit: true, envPow: 1.3, edge: 0.07, freq: 1.5,
        stateName: () => 'listening',
        active: () => box.classList.contains('is-active'),
        watch: [[box, ['class']]]
      });
    }
  };
})();
