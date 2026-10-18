import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildSystemPrompt } from '../src/ai/prompt.js';

const source = readFileSync(new URL('../public/creative-intent.js', import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const shortcuts = sandbox.NasrinCreativeIntent;

test('parses case-insensitive universal slash commands and preserves arguments', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(shortcuts.parseShortcut('/CLONE cinematic black and white'))), {
    name: 'clone', args: 'cinematic black and white', capability: 'image', executeFirst: true, requiresPhoto: true
  });
  assert.deepEqual(JSON.parse(JSON.stringify(shortcuts.parseShortcut('/rewrite make this concise'))), {
    name: 'rewrite', args: 'make this concise', capability: 'chat', executeFirst: true
  });
});

test('maps image-edit shortcuts to the image capability', () => {
  for (const name of ['clone', 'blur', 'remove-background', 'upscale']) {
    assert.equal(shortcuts.parseShortcut('/' + name).capability, 'image', name);
    assert.equal(shortcuts.detect('/' + name), 'image', name);
  }
});

test('maps video shortcuts to the video capability', () => {
  for (const name of ['video']) {
    assert.equal(shortcuts.parseShortcut('/' + name).capability, 'video', name);
    assert.equal(shortcuts.detect('/' + name), 'video', name);
  }
});

test('does not treat unknown slash commands as supported shortcuts', () => {
  assert.equal(shortcuts.parseShortcut('/made-up-command'), null);
  assert.equal(shortcuts.detect('/made-up-command'), null);
});

test('normal natural-language creative intent continues to work', () => {
  assert.equal(shortcuts.detect('Create a picture of a cat'), 'image');
  assert.equal(shortcuts.detect('Create a short video'), 'video');
  assert.equal(shortcuts.detect('What is image generation?'), null);
});

test('natural image enhancement requests route to image editing without requiring the word photo', () => {
  for (const request of ['make it clear and hd', 'Please upscale this', 'make this less blurry', 'sharpen and improve quality', 'restore this photo in 4K']) {
    assert.equal(shortcuts.detect(request), 'image', request);
    assert.equal(shortcuts.isImageEnhancement(request), true, request);
  }
  for (const request of ['What is HD image enhancement?', 'How does upscaling work?']) {
    assert.equal(shortcuts.detect(request), null, request);
  }
});

test('system prompt enforces execute-first behavior for supported shortcuts', () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /Universal slash commands are explicit task requests/);
  assert.match(prompt, /Do not ask for optional preferences/);
  assert.match(prompt, /Ask only when a genuinely required input is unavailable/);
  assert.match(prompt, /do not pretend a text reply created media/);
});

test('image slash commands dispatch directly without optional brief questions or confirmation', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(executeFirst\) return makeImage\(job, \{ confirm: false \}\)/);
  assert.match(app, /if \(shortcut && shortcut\.requiresPhoto && !pending\.some/);
  assert.match(app, /window\.NasrinCreativeIntent\.isImageEnhancement\(text\).*pending\.some/s);
  assert.match(app, /const directEdit = Boolean\(shortcut \|\| window\.NasrinCreativeIntent\.isImageEnhancement\(text\)\)/);
  assert.match(app, /if \(confirm && !window\.confirm/);
});
