import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// public/gemini-realtime.js in a stand-in browser: Gemini Live sends its JSON
// as binary WebSocket frames; the reply's audio must still be played.
async function load() {
  const code = await readFile(new URL('../public/gemini-realtime.js', import.meta.url), 'utf8');
  const started = [];
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
    createBufferSource() { return { ...node(), start(t) { started.push(t); }, stop() {} }; }
  }
  const window = {
    WebSocket: FakeWS, AudioContext: FakeCtx,
  };
  const ctx = vm.createContext({
    window, WebSocket: FakeWS, AudioContext: FakeCtx, TextDecoder, atob, btoa, Uint8Array, Int16Array, Float32Array, DataView, JSON, Math, String,
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } }
  });
  vm.runInContext(code, ctx);
  return { api: window.NasrinGeminiRealtime, started, socket: () => socket, FakeCtx };
}

test('binary Gemini frames are read: audio plays and words show', async () => {
  const { api, started, socket, FakeCtx } = await load();
  const said = [];
  const tapCtx = new FakeCtx();
  const state = await api.start({ value: 'tok', model: 'gemini-3.8-live' }, {
    audioContext: tapCtx, state() {}, active: () => true, muted: () => false, open() {},
    input: (t) => said.push(['in', t]), output: (t) => said.push(['out', t]),
    interrupted() {}, complete: () => said.push(['done']), error() {}, close() {}
  });
  assert.equal(state.ctx, tapCtx, 'the context made during the tap is used');
  const ws = socket();
  assert.equal(ws.binaryType, 'arraybuffer');
  const pcm = Buffer.alloc(4800).toString('base64');   // 0.1 s of 24 kHz PCM16
  const frame = new TextEncoder().encode(JSON.stringify({ serverContent: { outputTranscription: { text: 'Hello' }, modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm } }] } } }));
  ws.onmessage({ data: frame.buffer });
  ws.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
  assert.equal(started.length, 1, 'the reply audio was scheduled');
  assert.deepEqual(said, [['out', 'Hello'], ['done']]);
});
