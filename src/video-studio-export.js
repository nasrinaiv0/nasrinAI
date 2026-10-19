import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { HttpError } from './http/errors.js';

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_TRACKS = 8;
const MAX_SECONDS = 60;

export function createVideoStudioExporter({
  ffmpegPath = ffmpegStatic || process.env.FFMPEG_PATH || '',
  spawnImpl = spawn,
  timeoutMs = 90_000,
  maxOutputBytes = MAX_VIDEO_BYTES
} = {}) {
  const available = typeof ffmpegPath === 'string' && ffmpegPath.length > 0;

  function run(args, { allowFailure = false, timeout = timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      if (!available) return reject(new HttpError(503, 'video_export_unavailable', 'Video export is not configured on this server.'));
      let child;
      try { child = spawnImpl(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] }); }
      catch { return reject(new HttpError(503, 'video_export_unavailable', 'The video export runtime could not be started.')); }
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        reject(new HttpError(504, 'video_export_timeout', 'Video export took too long. Reduce the number of audio tracks and try again.'));
      }, timeout);
      child.stderr?.on('data', chunk => {
        if (stderr.length < 256_000) stderr += chunk.toString().slice(0, 256_000 - stderr.length);
      });
      child.on('error', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new HttpError(503, 'video_export_unavailable', 'The video export runtime could not be started.'));
      });
      child.on('close', code => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0 || allowFailure) resolve({ code, stderr });
        else reject(new HttpError(502, 'video_export_failed', 'The MP4 could not be rendered with the selected audio. Check the source video and timeline clips.'));
      });
    });
  }

  async function exportWithAudio({ videoBytes, durationSeconds, timelineItems, audioAssets }) {
    if (!available) throw new HttpError(503, 'video_export_unavailable', 'Video export is not configured on this server.');
    if (!Buffer.isBuffer(videoBytes) || videoBytes.length < 1 || videoBytes.length > MAX_VIDEO_BYTES) {
      throw new HttpError(413, 'video_export_input_size', 'The source MP4 must be smaller than 50 MB to export with audio.');
    }
    const duration = Number(durationSeconds);
    if (!Number.isFinite(duration) || duration < 1 || duration > MAX_SECONDS) {
      throw new HttpError(400, 'video_export_duration', 'The source video duration must be between 1 and 60 seconds.');
    }
    if (!Array.isArray(timelineItems) || timelineItems.length < 1) {
      throw new HttpError(400, 'video_timeline_empty', 'Add at least one audio clip to the project timeline before exporting.');
    }
    if (timelineItems.length > MAX_TRACKS || !Array.isArray(audioAssets) || audioAssets.length !== timelineItems.length) {
      throw new HttpError(400, 'video_timeline_limit', 'Export supports up to eight audio clips per project at a time.');
    }
    for (let i = 0; i < timelineItems.length; i++) {
      const item = timelineItems[i];
      const asset = audioAssets[i];
      if (!Buffer.isBuffer(asset?.bytes) || asset.bytes.length < 1 || asset.bytes.length > MAX_AUDIO_BYTES) {
        throw new HttpError(413, 'video_export_audio_size', 'One of the selected audio clips is empty or exceeds 12 MB.');
      }
      if (![item.startSeconds, item.trimStartSeconds, item.gain, item.lane].every(Number.isFinite) ||
          item.startSeconds < 0 || item.startSeconds >= duration || item.trimStartSeconds < 0 ||
          item.gain < 0 || item.gain > 2 || !Number.isInteger(item.lane) || item.lane < 1 || item.lane > 8 ||
          (item.trimEndSeconds != null && (!Number.isFinite(item.trimEndSeconds) || item.trimEndSeconds <= item.trimStartSeconds))) {
        throw new HttpError(400, 'video_timeline_invalid', 'One of the selected timeline clips has invalid position, trim, or gain settings.');
      }
    }

    const dir = await mkdtemp(path.join(tmpdir(), 'nasrinai-video-export-'));
    try {
      const sourcePath = path.join(dir, 'source.mp4');
      const outputPath = path.join(dir, 'export.mp4');
      await writeFile(sourcePath, videoBytes, { flag: 'wx', mode: 0o600 });
      for (let i = 0; i < audioAssets.length; i++) {
        await writeFile(path.join(dir, 'audio-' + i + '.mp3'), audioAssets[i].bytes, { flag: 'wx', mode: 0o600 });
      }

      const probe = await run(['-hide_banner', '-i', sourcePath], { allowFailure: true, timeout: Math.min(timeoutMs, 20_000) });
      if (!/Stream #\\d+:\\d+[^\\n]*Video:/i.test(probe.stderr)) {
        throw new HttpError(400, 'video_export_invalid_source', 'The source file does not contain a readable video stream.');
      }
      const hasSourceAudio = /Stream #\\d+:\\d+[^\\n]*Audio:/i.test(probe.stderr);

      const args = ['-nostdin', '-y', '-hide_banner', '-loglevel', 'error', '-i', sourcePath];
      for (let i = 0; i < audioAssets.length; i++) args.push('-i', path.join(dir, 'audio-' + i + '.mp3'));

      const filters = [];
      const mixLabels = [];
      if (hasSourceAudio) {
        filters.push('[0:a:0]apad=pad_dur=' + duration.toFixed(3) + '[source_audio]');
        mixLabels.push('[source_audio]');
      }
      for (let i = 0; i < timelineItems.length; i++) {
        const item = timelineItems[i];
        const inputIndex = i + 1;
        const delayMs = Math.round(item.startSeconds * 1000);
        const trim = item.trimEndSeconds == null
          ? 'atrim=start=' + item.trimStartSeconds.toFixed(3)
          : 'atrim=start=' + item.trimStartSeconds.toFixed(3) + ':end=' + item.trimEndSeconds.toFixed(3);
        const label = 'audio_' + i;
        filters.push('[' + inputIndex + ':a:0]' + trim +
          ',asetpts=PTS-STARTPTS,adelay=' + delayMs + '|' + delayMs +
          ',volume=' + item.gain.toFixed(3) +
          ',apad=pad_dur=' + duration.toFixed(3) + '[' + label + ']');
        mixLabels.push('[' + label + ']');
      }
      filters.push(mixLabels.join('') + 'amix=inputs=' + mixLabels.length +
        ':duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]');

      args.push('-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[aout]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-map_metadata', '0',
        '-movflags', '+faststart', '-t', duration.toFixed(3), '-f', 'mp4', outputPath);
      await run(args);
      const outputStat = await stat(outputPath);
      if (!outputStat.size || outputStat.size > maxOutputBytes) {
        throw new HttpError(413, 'video_export_output_size', 'The exported MP4 is empty or exceeds the 50 MB download limit.');
      }
      return await readFile(outputPath);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  return { available, exportWithAudio };
}
