import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/creative-intent.js', import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const detect = sandbox.NasrinCreativeIntent.detect;

test('detects common image creation prompts', () => {
  for (const prompt of [
    'Create an image',
    'Generate a picture of a cat',
    'Make me a poster',
    'I need a product photo',
    'Design a banner for my shop',
    'Please create a logo'
  ]) assert.equal(detect(prompt), 'image', prompt);
});

test('detects common video creation prompts', () => {
  for (const prompt of [
    'Create a video',
    'Generate a video for my ad',
    'Make me a promotional video',
    'Create a reel for my business',
    'Animate this picture into a video',
    'I want a short film'
  ]) assert.equal(detect(prompt), 'video', prompt);
});

test('keeps informational questions in normal chat', () => {
  for (const prompt of [
    'What is video generation?',
    'How do image models work?',
    'Can you explain how to create a video?',
    'Tell me about photo editing'
  ]) assert.equal(detect(prompt), null, prompt);
});

test('does not classify a video thumbnail as a video deliverable', () => {
  assert.equal(detect('Create a video thumbnail'), 'image');
});

test('ignores empty and unrelated prompts', () => {
  assert.equal(detect(''), null);
  assert.equal(detect('Help me plan my week'), null);
});

const parseVideoSeconds = sandbox.NasrinCreativeIntent.parseVideoSeconds;

test('routes "edit/turn photos into a video" requests to video, not chat or image', () => {
  for (const prompt of [
    'edit this into video',
    'Edit these photos into a video',
    'make a video from these photos',
    'Make a slideshow from these pictures',
    'put these images together into a video',
    'combine these photos into a reel'
  ]) assert.equal(detect(prompt), 'video', prompt);
});

test('video-related image deliverables and questions keep their routes', () => {
  assert.equal(detect('Create a logo for my video channel'), 'image');
  assert.equal(detect('Make a thumbnail for my video'), 'image');
  assert.equal(detect('What is a video editor?'), null);
  assert.equal(detect('How do I edit a video?'), null);
});

test('parseVideoSeconds reads a spoken clip length and ignores other numbers', () => {
  assert.equal(parseVideoSeconds('can you generate 2 sec video of kid laughing?'), 2);
  assert.equal(parseVideoSeconds('a 5-second clip of waves'), 5);
  assert.equal(parseVideoSeconds('make a 10 seconds ad'), 10);
  assert.equal(parseVideoSeconds('3s loop of rain'), 3);
  assert.equal(parseVideoSeconds('a 1 minute promo'), 60);
  assert.equal(parseVideoSeconds('a 10 minute video'), 60, 'capped at the 60-second product limit');
  assert.equal(parseVideoSeconds('1080p 60 fps video of 3 kids'), null);
  assert.equal(parseVideoSeconds('make a video of a cat'), null);
  assert.equal(parseVideoSeconds(''), null);
});
