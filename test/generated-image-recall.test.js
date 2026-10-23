import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGeneratedImageRecallRequest } from '../src/chat.js';

test('generated-image recall recognizes natural Library requests', () => {
  for (const phrase of [
    'show me the pictures generated in the library',
    'i want to see all the photos generated',
    'i want to see the photos in my library',
    'show me my photos in my library',
    'show me all generated photos',
    'view photos generated in my Library',
    'show me the images in my Library that Nasrin generated',
    'display my previously generated pictures',
    'can you bring up the images I created?',
    'find my saved pictures in the Library'
  ]) assert.equal(isGeneratedImageRecallRequest(phrase), true, phrase);
});

test('generated-image recall does not trigger for unrelated messages', () => {
  for (const phrase of [
    'how do I generate an image?',
    'what is a library?',
    'show me pictures of mountains',
    'show me photos of mountains',
    'create a new picture of a cat'
  ]) assert.equal(isGeneratedImageRecallRequest(phrase), false, phrase);
});
