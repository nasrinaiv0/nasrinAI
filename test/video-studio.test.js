import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Video Studio ships a standalone responsive workspace with template and timeline controls', async () => {
  const html = await readFile(new URL('../public/video-studio.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/video-studio.css', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  assert.match(html, /id="templateGrid"/);
  assert.match(html, /id="timeline"/);
  assert.match(html, /id="toolAiTools"/);
  assert.match(html, /id="audioStudioPanel"/);
  assert.match(html, /id="voiceStability"/);
  assert.match(html, /id="voiceStyle"/);
  assert.match(html, /id="previewVoice"/);
  assert.match(html, /id="generate"/);
  assert.match(html, /id="exports"/);
  assert.match(html, /id="continueInChat"/);
  assert.match(html, /id="studioChatPanel"/);
  assert.match(html, /id="studioChatForm"/);
  assert.match(html, /id="studioChatMessages"/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)/);
  assert.match(js, /\/v1\/videos/);
  assert.match(js, /\/v1\/auth\/refresh/);
  assert.match(js, /nasrinai\.videoStudio\.draft\.v1/);
  assert.match(js, /studio_context/);
  assert.match(js, /currentProjectContext/);
  assert.match(js, /\/v1\/guest\/sessions/);
  assert.match(js, /\/v1\/chat/);
  assert.match(js, /data-chat-suggestion/);
  assert.match(js, /Authorization:\s*'Bearer '\s*\+/);
  assert.doesNotMatch(html, /<script\s*>/i, 'strict CSP requires external scripts');
  assert.doesNotMatch(js, /(?:sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,})/, 'no provider credentials in client code');
});

test('main workspace links to Video Studio without replacing existing navigation', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /href="\/video-studio\.html"/);
  assert.match(html, /id="spaceStudio"/);
  assert.match(html, /class="nvs-studio-mark__line"/);
  assert.match(html, /class="nvs-studio-mark__play"/);
  assert.match(html, /drawer-studio-link/);
  assert.doesNotMatch(html, /id="desktopResearchBtn"|id="drawerResearch"/, 'standalone Research navigation has been removed');
  assert.match(html, /id="desktopCodeBtn"/);
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /studio_context/);
  assert.match(app, /Video Studio project brief loaded/);
  assert.match(app, /history\.replaceState/);
});
