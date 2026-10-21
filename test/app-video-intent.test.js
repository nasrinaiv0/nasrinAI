import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const start = app.indexOf('  function needsYouTubeVideos(query) {');
const end = app.indexOf('  const PERSISTENT_YOUTUBE_KEY', start);
assert.ok(start >= 0 && end > start, 'video intent helpers should exist in app.js');
const helpers = app.slice(start, end);
const { needsYouTubeVideos, youtubeResultsHeading } = new Function(
  helpers + '\nreturn { needsYouTubeVideos, youtubeResultsHeading };'
)();

test('video requests for other social platforms do not trigger unrelated YouTube cards', () => {
  for (const query of [
    'trending videos in tiktok',
    'show any videos from TikTok',
    'Facebook reels',
    'show Instagram videos'
  ]) assert.equal(needsYouTubeVideos(query), false, query);
});

test('explicit YouTube requests still show video results', () => {
  for (const query of [
    'trending videos on YouTube',
    'show me YouTube videos about MrBeast',
    'YouTube tutorial for baking'
  ]) assert.equal(needsYouTubeVideos(query), true, query);
});

test('video result heading reflects the requested content intent', () => {
  assert.equal(youtubeResultsHeading('trending videos in TikTok'), 'Trending videos');
  assert.equal(youtubeResultsHeading('show me YouTube videos about MrBeast'), 'Videos');
  assert.equal(youtubeResultsHeading('tutorial for changing a tire'), 'Video tutorials');
  assert.equal(youtubeResultsHeading('driving directions to the airport'), 'Related video guides');
});

test('general video search does not force tutorial keywords into the YouTube query', () => {
  const start = app.indexOf('  async function renderYouTubeVideos(');
  assert.ok(start >= 0, 'renderYouTubeVideos should exist');
  const snippet = app.slice(start, start + 1100);
  assert.match(snippet, /tutorialIntent/);
  assert.match(snippet, /tutorialIntent \? ' tutorial walkthrough' : ''/);
});


test('latest YouTube video requests trigger inline embed rendering', () => {
  assert.equal(needsYouTubeVideos('latest video of mr beast in youtube'), true);
  assert.equal(needsYouTubeVideos('latest video of mr beast'), true);
});

test('YouTube player uses the privacy-enhanced embed host', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /youtube-nocookie\\.com\\/embed\\/\' \+ video\.id/);
});
