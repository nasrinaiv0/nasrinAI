/**
 * Server-side, editor-neutral video project adapter for NasrinAI.
 *
 * This module ports the integration boundary (normalized timeline model,
 * CapCut/OpenCut JSON import, validation and safe timeline mutations) without
 * importing the upstream MCP stdio server or any frontend code.
 *
 * Times are represented in microseconds to match CapCut/OpenCut project data.
 * Imported vendor fields are retained under raw for loss-minimizing round trips.
 */

import { randomUUID } from 'node:crypto';

const EDITORS = new Set(['capcut', 'opencut']);
const TRACK_KINDS = new Set(['video', 'audio', 'text', 'sticker', 'effect']);
const MATERIAL_KINDS = new Set(['video', 'audio', 'image', 'text', 'sticker']);
const MAX_TRACKS = 64;
const MAX_CLIPS = 500;
const MAX_PROJECT_BYTES = 20 * 1024 * 1024;
const MAX_TIME = 24 * 60 * 60 * 1_000_000;

const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const text = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const id = (prefix) => prefix + '_' + randomUUID();
const clone = (v) => structuredClone(v);

function assert(condition, message, code = 'invalid_project') {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    error.status = 400;
    throw error;
  }
}

function normalizeTrackKind(value) {
  const v = String(value ?? '').toLowerCase();
  return TRACK_KINDS.has(v) ? v : 'video';
}

function normalizeMaterialType(value, fallback = 'video') {
  const v = String(value ?? fallback).toLowerCase();
  return MATERIAL_KINDS.has(v) ? v : fallback;
}

function validateProject(project) {
  assert(object(project), 'Project must be an object.');
  assert(EDITORS.has(project.editor), 'Unsupported editor format.');
  assert(typeof project.id === 'string' && project.id.length > 0 && project.id.length <= 200, 'Project id is invalid.');
  assert(typeof project.name === 'string' && project.name.length > 0 && project.name.length <= 200, 'Project name is invalid.');
  assert(finite(project.duration) && project.duration >= 0 && project.duration <= MAX_TIME, 'Project duration is invalid.');
  assert(Number.isInteger(project.width) && project.width >= 1 && project.width <= 16384, 'Project width is invalid.');
  assert(Number.isInteger(project.height) && project.height >= 1 && project.height <= 16384, 'Project height is invalid.');
  assert(finite(project.fps) && project.fps >= 1 && project.fps <= 240, 'Project frame rate is invalid.');
  assert(Array.isArray(project.tracks) && project.tracks.length <= MAX_TRACKS, 'Project track count is invalid.');
  assert(Array.isArray(project.materials), 'Project materials must be an array.');
  const materialIds = new Set();
  for (const m of project.materials) {
    assert(object(m) && typeof m.id === 'string' && m.id.length > 0, 'Material id is required.');
    assert(!materialIds.has(m.id), 'Duplicate material id: ' + m.id);
    materialIds.add(m.id);
    assert(MATERIAL_KINDS.has(m.type), 'Unsupported material type.');
    assert(finite(m.duration) && m.duration >= 0 && m.duration <= MAX_TIME, 'Material duration is invalid.');
    assert(typeof m.sourcePath === 'string' && m.sourcePath.length <= 4096, 'Material source path is invalid.');
  }
  const clipIds = new Set();
  let clipCount = 0;
  for (const track of project.tracks) {
    assert(object(track) && typeof track.id === 'string' && track.id.length > 0, 'Track id is required.');
    assert(TRACK_KINDS.has(track.kind), 'Unsupported track kind.');
    assert(Array.isArray(track.clips), 'Track clips must be an array.');
    const ordered = [...track.clips].sort((a, b) => a.targetStart - b.targetStart);
    let previousEnd = -1;
    for (const clip of ordered) {
      clipCount++;
      assert(clipCount <= MAX_CLIPS, 'Project exceeds the maximum clip count.');
      assert(object(clip) && typeof clip.id === 'string' && clip.id.length > 0, 'Clip id is required.');
      assert(!clipIds.has(clip.id), 'Duplicate clip id: ' + clip.id);
      clipIds.add(clip.id);
      assert(materialIds.has(clip.materialId), 'Clip references a missing material.');
      assert([clip.sourceIn, clip.sourceOut, clip.targetStart, clip.targetEnd].every(finite), 'Clip timing must be finite.');
      assert(clip.sourceIn >= 0 && clip.sourceOut > clip.sourceIn, 'Clip source range is invalid.');
      assert(clip.targetStart >= 0 && clip.targetEnd > clip.targetStart, 'Clip timeline range is invalid.');
      assert(clip.sourceOut - clip.sourceIn <= MAX_TIME && clip.targetEnd <= MAX_TIME, 'Clip duration is too large.');
      assert(clip.targetStart >= previousEnd, 'Overlapping clips on the same track are not supported.');
      previousEnd = clip.targetEnd;
    }
  }
  return project;
}

function buildProject({ id: projectId, name, editor, duration, width, height, fps, tracks, materials, texts, effects, raw }) {
  const maxEnd = tracks.flatMap(t => t.clips).reduce((max, c) => Math.max(max, c.targetEnd), 0);
  return validateProject({
    id: text(projectId || id('project'), 200),
    name: text(name || 'Untitled project', 200) || 'Untitled project',
    editor, duration: Math.max(Number(duration) || 0, maxEnd),
    width: Number.isInteger(width) && width > 0 ? width : 1920,
    height: Number.isInteger(height) && height > 0 ? height : 1080,
    fps: finite(fps) && fps > 0 ? fps : 30,
    tracks, materials, texts: Array.isArray(texts) ? texts : [], effects: Array.isArray(effects) ? effects : [],
    ...(object(raw) ? { raw: clone(raw) } : {})
  });
}

function fromOpenCut(raw) {
  const sourceTracks = Array.isArray(raw.tracks) ? raw.tracks : raw.timeline?.tracks;
  assert(Array.isArray(sourceTracks), 'OpenCut project must contain tracks or timeline.tracks.');
  const sourceMaterials = Array.isArray(raw.materials) ? raw.materials : [];
  const materials = sourceMaterials.map(m => ({
    id: text(m.id, 200), type: normalizeMaterialType(m.type),
    sourcePath: text(m.sourcePath ?? m.path, 4096),
    duration: Number(m.duration ?? 0), width: Number(m.width ?? 0), height: Number(m.height ?? 0),
    raw: clone(m)
  }));
  const tracks = sourceTracks.map(t => ({
    id: text(t.id || id('track'), 200), kind: normalizeTrackKind(t.kind ?? t.type),
    volume: finite(t.volume) ? Math.max(0, Math.min(1, t.volume)) : 1,
    visible: t.visible !== false, raw: clone(t),
    clips: (Array.isArray(t.clips) ? t.clips : []).map(c => ({
      id: text(c.id || id('clip'), 200),
      materialId: text(c.materialId ?? c.material_id, 200),
      sourceIn: Number(c.sourceIn ?? 0), sourceOut: Number(c.sourceOut ?? 0),
      targetStart: Number(c.targetStart ?? 0), targetEnd: Number(c.targetEnd ?? 0),
      ...(finite(c.volume) ? { volume: c.volume } : {}),
      ...(finite(c.speed) ? { speed: c.speed } : {}),
      raw: clone(c)
    }))
  }));
  return buildProject({ id: raw.id, name: raw.name, editor: 'opencut', duration: raw.duration, width: raw.width,
    height: raw.height, fps: raw.fps, tracks, materials, texts: raw.texts, effects: raw.effects, raw });
}

function fromCapCut(raw) {
  assert(Array.isArray(raw.tracks), 'CapCut draft must contain a tracks array.');
  const sourceMaterials = raw.materials && !Array.isArray(raw.materials) ? raw.materials : {};
  const groups = [
    ['videos', 'video'], ['audios', 'audio'], ['images', 'image'], ['texts', 'text'], ['stickers', 'sticker']
  ];
  const materials = [];
  for (const [key, type] of groups) {
    for (const m of Array.isArray(sourceMaterials[key]) ? sourceMaterials[key] : []) {
      materials.push({
        id: text(m.id, 200), type, sourcePath: text(m.path ?? m.media_path, 4096),
        duration: Number(m.duration ?? 0), width: Number(m.width ?? 0), height: Number(m.height ?? 0),
        raw: clone(m)
      });
    }
  }
  const tracks = raw.tracks.map(t => ({
    id: text(t.id || id('track'), 200), kind: normalizeTrackKind(t.type ?? t.kind),
    volume: finite(t.volume) ? Math.max(0, Math.min(1, t.volume)) : 1,
    visible: t.visible !== false, raw: clone(t),
    clips: (Array.isArray(t.segments) ? t.segments : []).map(c => {
      const targetStart = Number(c.target_timerange?.start ?? 0);
      const targetDuration = Number(c.target_timerange?.duration ?? 0);
      const sourceIn = Number(c.source_timerange?.start ?? 0);
      const sourceDuration = Number(c.source_timerange?.duration ?? targetDuration);
      return {
        id: text(c.id || id('clip'), 200), materialId: text(c.material_id, 200),
        sourceIn, sourceOut: sourceIn + sourceDuration,
        targetStart, targetEnd: targetStart + targetDuration,
        raw: clone(c)
      };
    })
  }));
  return buildProject({
    id: raw.id, name: raw.name ?? raw.draft_name, editor: 'capcut', duration: raw.duration,
    width: raw.canvas_config?.width, height: raw.canvas_config?.height, fps: raw.fps,
    tracks, materials, texts: [], effects: Array.isArray(raw.effects) ? raw.effects : [], raw
  });
}

/** Import a CapCut draft_content.json or OpenCut project JSON document. */
export function importEditorProject(input, { editor } = {}) {
  const raw = typeof input === 'string' ? (() => {
    assert(Buffer.byteLength(input, 'utf8') <= MAX_PROJECT_BYTES, 'Project JSON exceeds 20 MB.', 'project_too_large');
    try { return JSON.parse(input); } catch { assert(false, 'Project JSON is malformed.'); }
  })() : input;
  assert(object(raw), 'Project document must be a JSON object.');
  const selected = editor || (object(raw.canvas_config) || (raw.materials && !Array.isArray(raw.materials) && Array.isArray(raw.tracks?.[0]?.segments)) ? 'capcut' : 'opencut');
  assert(EDITORS.has(selected), 'Editor must be capcut or opencut.');
  return selected === 'capcut' ? fromCapCut(raw) : fromOpenCut(raw);
}

/** Apply one validated timeline operation. Dry-run is the default. */
export function applyTimelineOperation(projectInput, operation, { dryRun = true } = {}) {
  const project = validateProject(clone(projectInput));
  assert(object(operation), 'Timeline operation must be an object.');
  const type = text(operation.type, 40);
  const next = clone(project);
  let result;
  if (type === 'add_track') {
    assert(next.tracks.length < MAX_TRACKS, 'Project has reached the track limit.');
    const kind = text(operation.kind, 20);
    assert(TRACK_KINDS.has(kind), 'Track kind is unsupported.');
    const track = { id: text(operation.id || id('track'), 200), kind, clips: [], visible: true, volume: 1 };
    assert(!next.tracks.some(t => t.id === track.id), 'Track id already exists.');
    next.tracks.push(track); result = { trackId: track.id };
  } else if (type === 'add_material') {
    const material = operation.material;
    assert(object(material), 'Material is required.');
    const normalized = {
      id: text(material.id || id('material'), 200), type: normalizeMaterialType(material.type),
      sourcePath: text(material.sourcePath, 4096), duration: Number(material.duration),
      width: Number(material.width ?? 0), height: Number(material.height ?? 0), raw: object(material.raw) ? clone(material.raw) : undefined
    };
    assert(!next.materials.some(m => m.id === normalized.id), 'Material id already exists.');
    next.materials.push(normalized); result = { materialId: normalized.id };
  } else if (type === 'add_clip') {
    const track = next.tracks.find(t => t.id === operation.trackId);
    assert(track, 'Target track was not found.', 'track_not_found');
    assert(next.tracks.flatMap(t => t.clips).length < MAX_CLIPS, 'Project has reached the clip limit.');
    const material = next.materials.find(m => m.id === operation.materialId);
    assert(material, 'Material was not found.', 'material_not_found');
    const sourceIn = Number(operation.sourceIn ?? 0);
    const sourceOut = Number(operation.sourceOut ?? material.duration);
    const targetStart = Number(operation.targetStart ?? Math.max(0, ...track.clips.map(c => c.targetEnd)));
    const targetEnd = targetStart + (sourceOut - sourceIn);
    const clip = { id: text(operation.id || id('clip'), 200), materialId: material.id, sourceIn, sourceOut, targetStart, targetEnd };
    assert(!next.tracks.flatMap(t => t.clips).some(c => c.id === clip.id), 'Clip id already exists.');
    track.clips.push(clip); track.clips.sort((a, b) => a.targetStart - b.targetStart);
    result = { clipId: clip.id };
  } else if (type === 'move_clip') {
    const found = findClip(next, operation.clipId);
    const start = Number(operation.targetStart);
    assert(finite(start) && start >= 0, 'New clip position is invalid.');
    const duration = found.clip.targetEnd - found.clip.targetStart;
    found.clip.targetStart = start; found.clip.targetEnd = start + duration;
    found.track.clips.sort((a, b) => a.targetStart - b.targetStart);
    result = { clipId: found.clip.id, targetStart: start };
  } else if (type === 'trim_clip') {
    const found = findClip(next, operation.clipId);
    const sourceIn = Number(operation.sourceIn ?? found.clip.sourceIn);
    const sourceOut = Number(operation.sourceOut ?? found.clip.sourceOut);
    assert(finite(sourceIn) && finite(sourceOut) && sourceIn >= 0 && sourceOut > sourceIn, 'New clip trim range is invalid.');
    const oldDuration = found.clip.targetEnd - found.clip.targetStart;
    const targetDuration = sourceOut - sourceIn;
    found.clip.sourceIn = sourceIn; found.clip.sourceOut = sourceOut; found.clip.targetEnd = found.clip.targetStart + targetDuration;
    if (operation.keepEnd === true) found.clip.targetStart = Math.max(0, found.clip.targetEnd - targetDuration);
    result = { clipId: found.clip.id, previousDuration: oldDuration, duration: targetDuration };
  } else if (type === 'remove_clip') {
    const found = findClip(next, operation.clipId);
    found.track.clips = found.track.clips.filter(c => c.id !== found.clip.id);
    result = { clipId: found.clip.id };
  } else {
    assert(false, 'Unsupported timeline operation: ' + type, 'unsupported_operation');
  }
  next.duration = next.tracks.flatMap(t => t.clips).reduce((max, c) => Math.max(max, c.targetEnd), 0);
  validateProject(next);
  return { project: dryRun ? project : next, changed: !dryRun, dryRun, result };
}

function findClip(project, clipId) {
  assert(typeof clipId === 'string' && clipId.length > 0, 'Clip id is required.');
  for (const track of project.tracks) {
    const clip = track.clips.find(c => c.id === clipId);
    if (clip) return { track, clip };
  }
  assert(false, 'Clip was not found.', 'clip_not_found');
}

/** Export a normalized project as OpenCut JSON; raw vendor fields are not trusted as an authority. */
export function exportOpenCutProject(projectInput) {
  const p = validateProject(clone(projectInput));
  return {
    version: '0.5', id: p.id, name: p.name, duration: p.duration, width: p.width, height: p.height, fps: p.fps,
    tracks: p.tracks.map(t => ({
      ...(object(t.raw) ? {} : {}), id: t.id, kind: t.kind,
      ...(finite(t.volume) ? { volume: t.volume } : {}), ...(typeof t.visible === 'boolean' ? { visible: t.visible } : {}),
      clips: t.clips.map(c => ({
        id: c.id, materialId: c.materialId, sourceIn: c.sourceIn, sourceOut: c.sourceOut,
        targetStart: c.targetStart, targetEnd: c.targetEnd,
        ...(finite(c.volume) ? { volume: c.volume } : {}), ...(finite(c.speed) ? { speed: c.speed } : {})
      }))
    })),
    materials: p.materials.map(m => ({ id: m.id, type: m.type, sourcePath: m.sourcePath, duration: m.duration, width: m.width, height: m.height })),
    texts: clone(p.texts), effects: clone(p.effects)
  };
}

export const VIDEO_EDITOR_LIMITS = Object.freeze({
  maxProjectBytes: MAX_PROJECT_BYTES, maxTracks: MAX_TRACKS, maxClips: MAX_CLIPS,
  maxTimelineSeconds: MAX_TIME / 1_000_000, timeUnit: 'microseconds'
});
