import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildTestApp, serve } from './helpers.js';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('/v1/status tells the browser whether server transcription (auto language) is available', async () => {
  const built = buildTestApp({});
  const srv = await serve(built.app);
  try {
    const s = await (await fetch(srv.url + '/v1/status')).json();
    assert.ok(s.transcription && typeof s.transcription.available === 'boolean', 'status carries transcription.available');
  } finally { await srv.close(); }
});

test('the mic records audio and has the server detect the language, instead of one fixed browser language', () => {
  assert.match(app, /s\.transcription && s\.transcription\.available === true/, 'reads the status flag');
  const start = app.indexOf('async function startServerDictation(');
  const end = app.indexOf('\n  }\n', start);
  assert.ok(start > 0 && end > start, 'startServerDictation exists');
  const body = app.slice(start, end);
  assert.match(body, /getUserMedia\(/);
  assert.match(body, /new MediaRecorder\(/);
  const upload = app.slice(app.indexOf('async function finishServerDictation('), app.indexOf('async function finishServerDictation(') + 2600);
  assert.match(upload, /\/v1\/transcriptions\?name=/);
  assert.match(upload, /saved\.get\(KEYS\.language\)/, 'a language the person picked is sent as a hint');
  assert.match(upload, /!== 'auto'/, 'Auto sends no hint, so the model detects every language');
});

test('server dictation is bounded and stops cleanly', () => {
  assert.match(app, /SERVER_DICTATION_MAX_MS = \d+/, 'a recording length cap');
  const stop = /function stopDictation\(([^)]*)\) \{([\s\S]*?)\n  \}/.exec(app);
  assert.ok(stop && /serverDictation/.test(stop[2]), 'Stop also ends a server recording');
  assert.match(app, /track\.stop\(\)/, 'the microphone is released');
});

test('the mic works in browsers without built-in voice typing when server transcription is on', () => {
  assert.match(app, /const dictationSupported = \(\) =>/);
  assert.match(app, /Recognition \|\| \(serverStt && /);
});
