import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

function fnBody(name, nextName) {
  const start = app.indexOf(`  async function ${name}(`) >= 0 ? app.indexOf(`  async function ${name}(`) : app.indexOf(`  function ${name}(`);
  const end = app.indexOf(nextName, start + 10);
  assert.ok(start >= 0 && end > start, `${name} should exist before ${nextName}`);
  return app.slice(start, end);
}

test('chat video creation uses no native prompt or confirm dialogs', () => {
  const body = fnBody('sendVideo', '  function shortcutImagePrompt(');
  assert.doesNotMatch(body, /window\.prompt|window\.confirm|\bprompt\(|\bconfirm\(/);
  assert.doesNotMatch(body, /Choose 30 or 60 FPS/);
});

test('chat video creation sends the clip length from the message and lets the server pick quality', () => {
  const body = fnBody('sendVideo', '  function shortcutImagePrompt(');
  assert.match(body, /parseVideoSeconds\(text\) \|\| 8/);
  const request = body.slice(body.indexOf("api('/v1/videos'"), body.indexOf("api('/v1/videos'") + 260);
  assert.match(request, /prompt: text, seconds, tier: currentModel \|\| 'nasrinai'/);
  assert.doesNotMatch(request, /resolution|fps/, 'unsupported quality/FPS choices must not be forced by the browser');
});

test('the ready notification no longer claims every video is Ultra', () => {
  assert.doesNotMatch(app, /Your Ultra video has finished rendering/);
});

test('photos with a video request go to Video Studio instead of silently ignoring them', () => {
  const send = app.indexOf('  async function send(raw) {');
  const gate = app.indexOf("if (!imageMode && intent === 'video') {", send);
  assert.ok(gate > send, 'video branch exists in send()');
  const branch = app.slice(gate, gate + 320);
  assert.match(branch, /pending\.some\(\(f\) => f\.type && f\.type\.startsWith\('image\/'\) && f\.data\)\) return offerStudioForPhotos\(text\)/);
  assert.ok(branch.indexOf('offerStudioForPhotos') < branch.indexOf('sendVideo(prompt)'), 'photo check runs before text-only generation');
  const offer = fnBody('offerStudioForPhotos', '  async function sendVideo(');
  assert.match(offer, /href = '\/video-studio\.html'/);
  assert.match(offer, /pending = \[\]/);
});

test('a video stays in the chat after a refresh: the reply carries a [genvideo:id] marker that history turns back into the player', () => {
  const send = fnBody('sendVideo', '  function shortcutImagePrompt(');
  assert.match(send, /conversationId = data\.conversation_id/, 'keeps using the chat the server saved the video into');
  assert.match(send, /\[genvideo:/, 'live replies go through the same marker path as history');
  assert.ok(app.includes('genvideo:([0-9a-f-]{36})'), 'history reads the marker');
  const player = fnBody('videoPlayer', '  async function sendVideo(');
  assert.match(player, /\/v1\/videos\/' \+ encodeURIComponent\(id\)/, 'checks the same job instead of making a new one');
  assert.doesNotMatch(player, /method: 'POST'/, 'resuming never submits another paid generation');
  assert.match(player, /isConnected/, 'stops polling when the chat is left');
  assert.match(player, /Download MP4/);
  assert.match(player, /generated-video-preview/);
});

test('video messages cannot be edited like text messages', () => {
  assert.ok(app.includes("!/^Create (?:an image|a video): /.test(lastUser.dataset.text || '')"));
});
