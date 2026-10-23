import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/store/memory-store.js';
import { createMemory } from '../src/knowledge/memory.js';

const caller = (enabled = true) => ({
  tenantId: '00000000-0000-0000-0000-000000000001',
  actor: { type: 'user', id: 'continuity-user' },
  prefs: { memory: enabled }
});
const logger = { warn() {}, info() {}, error() {} };

test('automatic consolidation is opt-in and never writes while Memory is off', async () => {
  const store = createMemoryStore();
  const memory = createMemory({ store, logger });
  const result = await memory.consolidate(caller(false), 'I prefer dark mode in NasrinAI.');
  assert.equal(result.saved, false);
  assert.equal((await store.listMemories({ tenantId: caller().tenantId, userId: caller().actor.id })).length, 0);
});

test('consolidation saves durable user-authored facts and makes them available to later turns', async () => {
  const store = createMemoryStore();
  const memory = createMemory({ store, logger });
  const who = caller();
  const result = await memory.consolidate(who, 'My project is NasrinAI owner console for Davao City.');
  assert.equal(result.saved, true);
  const notes = await memory.list(who);
  assert.equal(notes.length, 1);
  assert.match(notes[0].text, /NasrinAI owner console/);
  assert.match(await memory.context(who, 'Continue my project'), /NasrinAI owner console/);
});

test('consolidation ignores ordinary chat, secrets, and duplicate facts', async () => {
  const store = createMemoryStore();
  const memory = createMemory({ store, logger });
  const who = caller();
  assert.equal((await memory.consolidate(who, 'Can you help me fix this bug?')).saved, false);
  assert.equal((await memory.consolidate(who, 'Please remember that I am vegetarian.')).saved, false, 'explicit remember actions still require confirmation');
  assert.equal((await memory.consolidate(who, 'I prefer this API key sk-123456789012345678901234')).saved, false);
  assert.equal((await memory.consolidate(who, 'I prefer dark mode in NasrinAI.')).saved, true);
  assert.equal((await memory.consolidate(who, 'I prefer dark mode in NasrinAI.')).reason, 'duplicate');
  assert.equal((await memory.list(who)).length, 1);
});

test('near-duplicate project facts consolidate without deleting unrelated memories', async () => {
  const store = createMemoryStore();
  const memory = createMemory({ store, logger });
  const who = caller();
  await memory.consolidate(who, 'My project is NasrinAI owner console for Davao.');
  await memory.consolidate(who, 'I prefer dark mode in NasrinAI.');
  const result = await memory.consolidate(who, 'My project is NasrinAI owner console for Davao City.');
  assert.equal(result.saved, true);
  const notes = await memory.list(who);
  assert.equal(notes.length, 2);
  assert.ok(notes.some((note) => /Davao City/.test(note.text)));
  assert.ok(notes.some((note) => /prefer dark mode/.test(note.text)));
});
