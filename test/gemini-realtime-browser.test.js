import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// public/gemini-realtime.js in a stand-in browser: Gemini Live sends its JSON
// as binary WebSocket frames; the reply's audio must still be played.
async function load() {
  const code = await readFile(new URL('../public/gemini-realtime.js', import.meta.url), 'utf8');
  const started = [];
  const sources = [];
  let socket = null;
  class FakeWS {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; socket = this; }
    send(m) { this.sent.push(m); }
    close() {}
  }
  const node = () => ({ connect() {}, disconnect() {} });
  class FakeCtx {
    constructor() { this.sampleRate = 48000; this.currentTime = 0; this.destination = {}; this.made = true; }
    async resume() {}
    createScriptProcessor() { return node(); }
    createMediaStreamSource() { return node(); }
    createBuffer(ch, n, rate) { return { duration: n / rate, copyToChannel() {} }; }
    createBufferSource() { const n = { ...node(), start(t) { started.push(t); }, stop() {}, connect(to) { n.to = to; } }; sources.push(n); return n; }
    createMediaStreamDestination() { return { stream: { kind: 'reply-stream' } }; }
  }
  const window = {
    WebSocket: FakeWS, AudioContext: FakeCtx,
  };
  const ctx = vm.createContext({
    window, WebSocket: FakeWS, AudioContext: FakeCtx, TextDecoder, atob, btoa, Uint8Array, Int16Array, Float32Array, DataView, JSON, Math, String,
    setTimeout, clearTimeout,   // the setup handshake has a timeout
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } }
  });
  vm.runInContext(code, ctx);
  return { api: window.NasrinGeminiRealtime, started, sources, socket: () => socket, FakeCtx };
}

test('binary Gemini frames are read: audio plays and words show', async () => {
  const { api, started, socket, FakeCtx } = await load();
  const said = [];
  const tapCtx = new FakeCtx();
  let opened = false;
  const errors = [];
  const state = await api.start({ value: 'tok', model: 'gemini-3.8-live' }, {
    audioContext: tapCtx, state() {}, active: () => true, muted: () => false, open() { opened = true; },
    input: (t) => said.push(['in', t]), output: (t) => said.push(['out', t]),
    interrupted() {}, complete: () => said.push(['done']), error: (e) => errors.push(e), close() {}
  });
  assert.equal(state.ctx, tapCtx, 'the context made during the tap is used');
  const ws = socket();
  assert.equal(ws.binaryType, 'arraybuffer');
  ws.onopen();
  assert.equal(opened, false, 'voice is not marked ready before Gemini confirms setup');
  assert.match(ws.sent[0], /\"setup\"/);
  ws.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
  assert.equal(opened, true, 'voice becomes ready after setupComplete');
  assert.equal(errors.length, 0);
  const pcm = Buffer.alloc(4800).toString('base64');   // 0.1 s of 24 kHz PCM16
  const frame = new TextEncoder().encode(JSON.stringify({ serverContent: { outputTranscription: { text: 'Hello' }, modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm } }] } } }));
  ws.onmessage({ data: frame.buffer });
  ws.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
  assert.equal(started.length, 1, 'the reply audio was scheduled');
  assert.deepEqual(said, [['out', 'Hello'], ['done']]);
  assert.deepEqual(errors, [], 'no errors during a normal turn');
});

test('iPhone: the reply plays through the <audio> element made during the tap, not the earpiece', async () => {
  const { api, sources, socket, FakeCtx } = await load();
  const el = { paused: true, srcObject: null, plays: 0, play() { this.plays++; this.paused = false; return Promise.resolve(); } };
  const state = await api.start({ value: 'tok', model: 'gemini-3.8-live' }, {
    audioContext: new FakeCtx(), audioElement: el, state() {}, active: () => true, muted: () => false, open() {},
    input() {}, output() {}, interrupted() {}, complete() {}, error() {}, close() {}
  });
  assert.equal(el.srcObject.kind, 'reply-stream', 'the element plays the reply stream');
  const ws = socket();
  ws.onopen();
  ws.onmessage({ data: JSON.stringify({ setupComplete: {} }) });
  ws.onmessage({ data: JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { data: Buffer.alloc(480).toString('base64') } }] } } }) });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].to, state.out, 'audio goes to the element, not straight to the speakers');
  assert.ok(el.plays >= 1);
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /audioElement: vc\.audioEl,/);
  assert.match(app, /if \(!vc\.on && navigator\.audioSession/, 'a tap during a call does not switch the iPhone to playback only');
});
