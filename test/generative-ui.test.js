import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../src/ai/prompt.js';

test('Generative UI instructions are limited to visual chat replies', () => {
  const normal = buildSystemPrompt({ blocks: true });
  assert.match(normal, /\[\[ui\]\]/);
  assert.match(normal, /architecture/);
  assert.doesNotMatch(buildSystemPrompt({ blocks: false }), /Supported types are architecture/);
  assert.doesNotMatch(buildSystemPrompt({ blocks: true, voice: true }), /Supported types are architecture/);
  assert.doesNotMatch(buildSystemPrompt({ blocks: true, knowledgeOnly: true }), /Supported types are architecture/);
});

test('Generative UI prompt supports intent-aware charts and requires real data', () => {
  const prompt = buildSystemPrompt({ blocks: true });
  assert.match(prompt, /type chart/);
  assert.match(prompt, /categories/);
  assert.match(prompt, /never fabricate data/);
  assert.match(prompt, /compact/);
  assert.doesNotMatch(buildSystemPrompt({ blocks: false }), /type chart/);
  assert.doesNotMatch(buildSystemPrompt({ blocks: true, voice: true }), /type chart/);
});
