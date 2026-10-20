import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../public/video-studio.html', import.meta.url), 'utf8');
const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/video-studio.css', import.meta.url), 'utf8');

test('Video Studio browser script parses without syntax errors', () => {
  assert.doesNotThrow(() => new vm.Script(js, { filename: 'video-studio.js' }));
});

test('editor exposes dedicated video, overlay, text, and audio tracks', () => {
  for (const track of ['video', 'overlay', 'text', 'audio']) {
    assert.match(html, new RegExp('<option value="' + track + '">'));
    assert.match(js, new RegExp("track-" + track));
  }
  assert.match(js, /timeline-track-clips/);
});

test('trim, split, captions, effects, and keyframe controls are wired', () => {
  for (const id of ['clipStart', 'clipDuration', 'clipPosition', 'splitClip', 'addCaption', 'clipFilter', 'clipTransition', 'clipOpacity', 'clipGain', 'addKeyframe', 'keyframeTime', 'keyframeScale']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing control ' + id);
    assert.ok(js.includes("$('" + id + "')"), 'control not wired: ' + id);
  }
  assert.match(js, /pointermove/);
  assert.match(js, /keyframes\.push/);
});

test('project drafts and cloud documents persist multitrack edit properties', () => {
  for (const property of ['position', 'track', 'transition', 'filter', 'opacity', 'gain', 'keyframes']) {
    assert.ok(js.includes(property + ':'), 'missing serialized property ' + property);
  }
  assert.match(js, /nasrinai\.videoStudio\.draft\.v1/);
  assert.match(js, /function cloudDocument/);
});

test('export composites concurrent tracks and mixes audio with bounded browser workload', () => {
  assert.match(js, /Rendering multitrack timeline/);
  assert.match(js, /createMediaElementSource/);
  assert.match(js, /createMediaStreamDestination/);
  assert.match(js, /state\.clips\.length>40/);
  assert.match(js, /total>180/);
  assert.match(js, /MediaRecorder\.isTypeSupported/);
  assert.match(js, /mime\.includes\('mp4'\)\?'mp4':'webm'/);
});

test('responsive editor includes reduced-motion and touch trim affordances', () => {
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /clip-trim-handle/);
  assert.match(css, /touch-action:none/);
  assert.match(css, /max-width:760px/);
});
