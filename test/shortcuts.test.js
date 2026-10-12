import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/creative-intent.js', import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const shortcuts = sandbox.NasrinCreativeIntent;

test('parses case-insensitive universal slash commands and preserves arguments', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(shortcuts.parseShortcut('/CLONE cinematic black and white'))), {
    name: 'clone', args: 'cinematic black and white', capability: 'image', executeFirst: true
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
  for (const name of ['video', 'animate']) {
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
