import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (f) => readFile(new URL('../public/' + f, import.meta.url), 'utf8');

// Owner request (2026-10-12): a minimal voice screen. The conversation sits at
// the top and fades out; a glowing liquid orb in the lower centre ripples out
// sound waves; the controls are Plus and the tier (left), mute and Exit
// (right). The speed button is gone.
test('voice screen markup: conversation, orb, four controls, no speed button', async () => {
  const html = await read('index.html');
  const screen = /<section class="voice-screen" id="voice"[^>]*>([\s\S]*?)\n  <\/section>/.exec(html);
  assert.ok(screen, 'the voice screen has its own class');
  const s = screen[1];
  assert.match(s, /<div class="voice-log" id="voiceLog" aria-live="polite" aria-label="Conversation"><\/div>/, 'the conversation shows (not hidden)');
  assert.match(s, /<button type="button" class="voice-orb" id="voiceSkip" disabled[^>]*>\s*<span class="voice-wave" id="voiceWave"/, 'the orb is the stop-talking button');
  for (const id of ['voicePlus', 'voiceTier', 'voiceMute', 'voiceEnd']) assert.match(s, new RegExp('id="' + id + '"'));
  assert.match(s, /<span id="voiceTierLabel">Quick<\/span>/, 'the tier shows its name');
  assert.doesNotMatch(s, /voiceSpeed|voiceClose|Speech speed/, 'no speed button and one exit');
  assert.ok(s.indexOf('id="voiceLog"') < s.indexOf('id="voiceSkip"'), 'conversation above the orb');
});

// Regression: the voice screen's CSS used `.voice`, which is also the class of
// each row in Settings > Voice, so every row there became a fixed full-screen
// layer and only one voice was visible.
test('voice screen styles never target the Settings voice rows', async () => {
  const css = await read('voice-liquid-glass.css');
  assert.doesNotMatch(css, /(^|[\s,}])\.voice(\[|::|\s*\{|\s*,)/m);
  assert.match(css, /\.voice-screen \{[^}]*position: fixed;/);
  const app = await read('app.css');
  for (const rule of app.matchAll(/(?:^|\})\s*\.voice\s*\{([^}]*)\}/g)) assert.doesNotMatch(rule[1], /position:\s*fixed/);
});

test('voice script: no speed control, orb stops talking, realtime lines join up', async () => {
  const js = await read('app.js');
  assert.doesNotMatch(js, /voiceSpeed|renderVoiceSpeed|setSpeechRate|voiceClose/);
  assert.match(js, /voiceSkip\.disabled = !\(state === 'speaking' \|\| state === 'thinking'\);/);
  // Regression: both realtime paths looked for `.voice-line`, a class no line
  // has, so every streamed word became its own line and stayed "live".
  assert.doesNotMatch(js, /\.voice-line/);
  assert.equal((js.match(/\.vmsg\.assistant\.is-realtime/g) || []).length, 4);
  assert.match(js, /x\.classList\.remove\('is-realtime','is-live'\)/);
  assert.match(js, /last\.classList\.remove\('is-realtime', 'is-live'\)/);
  // The "Realtime voice is on" line only appears once realtime has started.
  assert.match(js, /if \(realtime\) voiceSay\('hint', 'Realtime voice is on/);
});

test('voice-wave.js draws the orb on the voice screen and keeps the dictation wave', async () => {
  const js = await read('voice-wave.js');
  assert.match(js, /const wave = createOrb\(host, \{/);
  assert.match(js, /return createWave\(box, \{/, 'the message box keeps its wave');
  assert.match(js, /function meter\(\)/, 'one shared microphone level reader');
  assert.doesNotMatch(js, /getUserMedia/, 'never opens a second microphone');
});
