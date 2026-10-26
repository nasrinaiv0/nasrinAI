import test from 'node:test';
import assert from 'node:assert/strict';
import { importEditorProject, applyTimelineOperation, exportOpenCutProject } from '../src/video-studio-editor-adapter.js';

const openCut = () => ({
  version: '0.5', id: 'p1', name: 'Test', duration: 5_000_000, width: 1920, height: 1080, fps: 30,
  materials: [{ id: 'm1', type: 'video', sourcePath: 'asset://video-1', duration: 5_000_000, width: 1920, height: 1080 }],
  tracks: [{ id: 't1', kind: 'video', clips: [{ id: 'c1', materialId: 'm1', sourceIn: 0, sourceOut: 5_000_000, targetStart: 0, targetEnd: 5_000_000 }] }]
});

test('imports OpenCut project into a validated normalized timeline', () => {
  const p = importEditorProject(openCut());
  assert.equal(p.editor, 'opencut');
  assert.equal(p.tracks[0].clips[0].targetEnd, 5_000_000);
});

test('imports CapCut target/source time ranges into normalized clips', () => {
  const p = importEditorProject({
    id: 'cap1', duration: 2_000_000, canvas_config: { width: 1080, height: 1920 }, fps: 30,
    materials: { videos: [{ id: 'm1', path: 'asset://clip', duration: 2_000_000 }], audios: [], images: [], texts: [], stickers: [] },
    tracks: [{ id: 't1', type: 'video', segments: [{ id: 'c1', material_id: 'm1', source_timerange: { start: 200_000, duration: 800_000 }, target_timerange: { start: 1_000_000, duration: 800_000 } }] }]
  });
  assert.equal(p.editor, 'capcut');
  assert.equal(p.tracks[0].clips[0].sourceIn, 200_000);
  assert.equal(p.tracks[0].clips[0].targetStart, 1_000_000);
});

test('dry-run is the default and does not mutate the input project', () => {
  const p = importEditorProject(openCut());
  const result = applyTimelineOperation(p, { type: 'add_track', kind: 'audio' });
  assert.equal(result.dryRun, true);
  assert.equal(result.changed, false);
  assert.equal(result.project.tracks.length, 1);
  assert.equal(p.tracks.length, 1);
});

test('supports validated track/material/clip additions and OpenCut serialization', () => {
  let p = importEditorProject(openCut());
  p = applyTimelineOperation(p, { type: 'add_track', id: 't2', kind: 'video' }, { dryRun: false }).project;
  p = applyTimelineOperation(p, { type: 'add_material', material: { id: 'm2', type: 'video', sourcePath: 'asset://2', duration: 2_000_000 } }, { dryRun: false }).project;
  p = applyTimelineOperation(p, { type: 'add_clip', trackId: 't2', materialId: 'm2', targetStart: 0 }, { dryRun: false }).project;
  assert.equal(p.tracks[1].clips.length, 1);
  const exported = exportOpenCutProject(p);
  assert.equal(exported.tracks.length, 2);
  assert.equal(exported.tracks[1].clips[0].materialId, 'm2');
});

test('rejects overlapping clips, missing materials, invalid editor and oversized JSON', () => {
  const raw = openCut();
  raw.tracks[0].clips.push({ id: 'c2', materialId: 'm1', sourceIn: 0, sourceOut: 1_000_000, targetStart: 2_000_000, targetEnd: 3_000_000 });
  assert.throws(() => importEditorProject(raw), /Overlapping clips/);
  assert.throws(() => applyTimelineOperation(importEditorProject(openCut()), { type: 'add_clip', trackId: 't1', materialId: 'missing' }, { dryRun: false }), /Material was not found/);
  assert.throws(() => importEditorProject(openCut(), { editor: 'other' }), /Editor must be capcut or opencut/);
  assert.throws(() => importEditorProject(' '.repeat(20 * 1024 * 1024 + 1)), /exceeds 20 MB/);
});

test('rejects timeline moves that overlap another clip', () => {
  const raw = openCut();
  raw.materials.push({ id: 'm2', type: 'video', sourcePath: 'asset://2', duration: 1_000_000 });
  raw.tracks[0].clips = [
    { id: 'c1', materialId: 'm1', sourceIn: 0, sourceOut: 1_000_000, targetStart: 0, targetEnd: 1_000_000 },
    { id: 'c2', materialId: 'm2', sourceIn: 0, sourceOut: 1_000_000, targetStart: 2_000_000, targetEnd: 3_000_000 }
  ];
  const p = importEditorProject(raw);
  assert.throws(() => applyTimelineOperation(p, { type: 'move_clip', clipId: 'c1', targetStart: 2_500_000 }, { dryRun: false }), /Overlapping clips/);
});

test('supports split, speed, track visibility and volume changes without overlapping clips', () => {
  let p = importEditorProject(openCut());
  p = applyTimelineOperation(p, { type: 'split_clip', clipId: 'c1', at: 2_000_000 }, { dryRun: false }).project;
  assert.equal(p.tracks[0].clips.length, 2);
  assert.equal(p.tracks[0].clips[0].targetEnd, 2_000_000);
  assert.equal(p.tracks[0].clips[1].targetStart, 2_000_000);
  p = applyTimelineOperation(p, { type: 'set_clip_speed', clipId: 'c1', speed: 2 }, { dryRun: false }).project;
  assert.equal(p.tracks[0].clips.find(c => c.id === 'c1').speed, 2);
  p = applyTimelineOperation(p, { type: 'set_track_volume', trackId: 't1', volume: 0.5 }, { dryRun: false }).project;
  p = applyTimelineOperation(p, { type: 'set_track_visibility', trackId: 't1', visible: false }, { dryRun: false }).project;
  assert.equal(p.tracks[0].volume, 0.5);
  assert.equal(p.tracks[0].visible, false);
  assert.throws(() => applyTimelineOperation(p, { type: 'set_clip_speed', clipId: 'c1', speed: 20 }, { dryRun: false }), /between 0.25x and 4x/);
});
