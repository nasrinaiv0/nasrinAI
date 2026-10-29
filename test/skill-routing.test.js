import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAY_NEED_TOOLS } from '../src/chat.js';
import { buildSystemPrompt } from '../src/ai/prompt.js';

test('file and media action requests activate the available-tool routing path', () => {
  for (const request of [
    'Extract every logo from this image and remove the background',
    'Transcribe this audio file',
    'Extract frames from this video',
    'OCR this scanned PDF',
    'Convert this legacy .doc file',
    'Resize and compress this image',
    'Unpack this archive and inspect the files'
  ]) {
    assert.equal(MAY_NEED_TOOLS.test(request), true, request);
  }
});

test('ordinary greetings do not activate tool routing', () => {
  for (const request of ['Hello!', 'Thanks so much', 'Tell me a joke']) {
    assert.equal(MAY_NEED_TOOLS.test(request), false, request);
  }
});

test('attachment instructions require execution-first behavior and honest capability reporting', () => {
  const prompt = buildSystemPrompt();
  assert.match(prompt, /do not substitute an apology, a generic refusal/i);
  assert.match(prompt, /return the actual artifact/i);
  assert.match(prompt, /name that missing capability specifically/i);
  assert.match(prompt, /Never imply the app can perform a transformation solely because the model can describe it/i);
});

test('Google app requests offer the Google tools', async () => {
  const { GOOGLE_ASK } = await import('../src/chat.js');
  for (const request of ['but my gmail is connected', 'summarize my inbox', 'read my emails', 'what is in my google drive',
    'send an email to Bob', 'what meetings do I have', 'create a google meet link', 'list my keep notes', 'add an event to my calendar']) {
    assert.equal(GOOGLE_ASK.test(request), true, request);
  }
  for (const request of ['Hello!', 'Tell me a joke', 'how do I drive safely in rain']) assert.equal(GOOGLE_ASK.test(request), false, request);
});
