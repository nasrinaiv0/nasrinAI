import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../src/ai/prompt.js';

test('Generative UI instructions are limited to visual chat replies', () => {
  const normal = buildSystemPrompt({ blocks: true });
  assert.match(normal, /\[\[ui\]\]/);
  assert.match(normal, /architecture/);
  assert.doesNotMatch(buildSystemPrompt({ blocks: false }), /Generative UI payload/);
  assert.doesNotMatch(buildSystemPrompt({ blocks: true, voice: true }), /Generative UI payload/);
  assert.doesNotMatch(buildSystemPrompt({ blocks: true, knowledgeOnly: true }), /Generative UI payload/);
});
