import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('existing Video Studio exposes ElevenLabs generation, saved assets, timeline, and MP4 export', async () => {
  const html = await readFile(new URL('../public/video-studio.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/video-studio.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/video-studio.css', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const id of ['audioStudioPanel','voiceoverForm','soundEffectForm','audioProjectSelect','audioAssets','audioTimeline','audioExportVideo','exportAudioVideo']) assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(js,/\/v1\/video-studio\/elevenlabs\/voiceover/);
  assert.match(js,/\/v1\/video-studio\/elevenlabs\/sound-effects/);
  assert.match(js,/\/v1\/video-studio\/audio-assets/);
  assert.match(js,/\/v1\/video-studio\/timeline/);
  assert.match(js,/\/v1\/video-studio\/export/);
  assert.match(js,/\/v1\/video-studio\/render-jobs/);
  assert.match(js,/\/v1\/video-studio\/render-timeline/);
  assert.match(js,/queueServerTimelineRender/);
  assert.match(js,/timelineRenderFingerprint/);
  assert.match(js,/audio_assets:/);
  assert.match(js,/audio_timeline:/);
  assert.match(js,/Saved audio assets:/);
  assert.match(js,/Project audio timeline:/);
  assert.match(css,/audio-studio-panel/);
  assert.match(app,/\['ElevenLabs', 'cloud', 'https:\/\/elevenlabs\.io'\]/);
  assert.match(app,/Open Video Studio/);
});

test('Studio subdomain redirects to the primary same-origin workspace for HttpOnly session cookies', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const redirect = config.redirects.find(rule => rule.has?.some(host => host.value === 'studio.nasrinai.com'));
  assert.equal(redirect?.destination,'https://nasrinai.com/video-studio.html');
  assert.equal(config.rewrites.some(rule => rule.has?.some(host => host.value === 'studio.nasrinai.com')),false);
});
