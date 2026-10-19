import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { createVideoStudioExporter } from '../src/video-studio-export.js';

function run(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stderr) : reject(new Error(stderr || 'ffmpeg failed')));
  });
}

test('FFmpeg export mixes project timeline audio into an MP4 that contains video and audio streams', async (t) => {
  if (!ffmpegStatic) return t.skip('ffmpeg-static binary is unavailable on this platform');
  const dir = await mkdtemp(path.join(tmpdir(), 'nasrinai-export-test-'));
  try {
    const source = path.join(dir, 'source.mp4');
    const voice = path.join(dir, 'voice.mp3');
    await run(ffmpegStatic, [
      '-nostdin', '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=15:d=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=2',
      '-shortest', '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'aac', '-movflags', '+faststart', source
    ]);
    await run(ffmpegStatic, [
      '-nostdin', '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=44100:duration=0.5',
      '-c:a', 'libmp3lame', '-b:a', '64k', voice
    ]);
    const exporter = createVideoStudioExporter({ ffmpegPath: ffmpegStatic, timeoutMs: 30_000 });
    const output = await exporter.exportWithAudio({
      videoBytes: await readFile(source),
      durationSeconds: 2,
      timelineItems: [{ startSeconds: 0.5, trimStartSeconds: 0, trimEndSeconds: null, gain: 0.8, lane: 1 }],
      audioAssets: [{ bytes: await readFile(voice) }]
    });
    assert.ok(output.length > 1000);
    const outputPath = path.join(dir, 'output.mp4');
    await writeFile(outputPath, output);
    const probe = await run(ffmpegStatic, ['-hide_banner', '-i', outputPath]);
    assert.match(probe, /Video:/i);
    assert.match(probe, /Audio:/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('export refuses empty timelines, too many tracks, and oversized source videos', async () => {
  const exporter = createVideoStudioExporter({ ffmpegPath: ffmpegStatic || '/usr/bin/ffmpeg' });
  await assert.rejects(() => exporter.exportWithAudio({
    videoBytes: Buffer.from('x'), durationSeconds: 2, timelineItems: [], audioAssets: []
  }), err => err.code === 'video_export_input_size' || err.code === 'video_timeline_empty');
  await assert.rejects(() => exporter.exportWithAudio({
    videoBytes: Buffer.alloc(50 * 1024 * 1024 + 1), durationSeconds: 2,
    timelineItems: [{ startSeconds: 0, trimStartSeconds: 0, trimEndSeconds: null, gain: 1, lane: 1 }],
    audioAssets: [{ bytes: Buffer.from('x') }]
  }), err => err.code === 'video_export_input_size');
  await assert.rejects(() => exporter.exportWithAudio({
    videoBytes: Buffer.from('x'), durationSeconds: 2,
    timelineItems: Array.from({ length: 9 }, () => ({ startSeconds: 0, trimStartSeconds: 0, trimEndSeconds: null, gain: 1, lane: 1 })),
    audioAssets: Array.from({ length: 9 }, () => ({ bytes: Buffer.from('x') }))
  }), err => err.code === 'video_export_input_size' || err.code === 'video_timeline_limit');
});
