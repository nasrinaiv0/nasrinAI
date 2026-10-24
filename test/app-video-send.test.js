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
