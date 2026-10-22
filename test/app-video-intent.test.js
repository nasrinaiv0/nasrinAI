import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const start = app.indexOf('  function needsYouTubeVideos(query) {');
const end = app.indexOf('  const PERSISTENT_YOUTUBE_KEY', start);
const intentStart = app.indexOf('  function isYouTubeSearchRequest(query) {');
const intentEnd = app.indexOf('  async function renderYouTubeVideos(', intentStart);
assert.ok(start >= 0 && end > start && intentStart > end && intentEnd > intentStart, 'video intent helpers should exist in app.js');
const helpers = app.slice(start, end) + '\n' + app.slice(intentStart, intentEnd);
const { needsYouTubeVideos, youtubeResultsHeading, isYouTubeSearchRequest, youtubeQueryForReply } = new Function(
  helpers + '\nreturn { needsYouTubeVideos, youtubeResultsHeading, isYouTubeSearchRequest, youtubeQueryForReply };'
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
  assert.match(snippet, /tutorialIntent/);\n  assert.match(snippet, /tutorialIntent \\? ' tutorial walkthrough' : ''/);
});

test('video discovery queries route directly to YouTube instead of generating a video', () => {
  for (const query of [
    'show me the latest MrBeast video',
    'latest video of MrBeast',
    'find videos about the James Webb telescope',
    'show me YouTube videos about MrBeast',
    'watch the newest video from NASA'
  ]) assert.equal(isYouTubeSearchRequest(query), true, query);
  for (const query of ['youtube', 'MrBeast', 'mr beast', 'show me embedded videos', 'embed the video player']) {
    assert.equal(isYouTubeSearchRequest(query), false, query);
  }
  for (const query of [
    'create a video about MrBeast',
    'generate a video intro',
    'make a video of a cat',
    'explain how video compression works',
    'show me the latest MrBeast video and summarize it',
    'find a video and explain what happens'
  ]) assert.equal(isYouTubeSearchRequest(query), false, query);
});

test('affirmative follow-ups preserve the assistant reply YouTube search context', () => {
  const reply = 'I can help you find MrBeast latest YouTube uploads or trending videos. Would you like me to search?';
  assert.equal(youtubeQueryForReply('Yes', reply), reply);
  assert.equal(youtubeQueryForReply('Sure, please do', reply), reply);
  assert.equal(youtubeQueryForReply('Yes', 'Hello! How can I help you today?'), '');
  assert.equal(youtubeQueryForReply('show me YouTube videos about MrBeast', reply), 'show me YouTube videos about MrBeast');
  assert.equal(
    youtubeQueryForReply('embedded videos', 'Watch "I Survived 100 Days In A Circle, Win $500,000" on YouTube'),
    'I Survived 100 Days In A Circle, Win $500,000'
  );
});

test('YouTube send handler is top-level and failed searches recover visibly', () => {
  const handler = app.indexOf('  async function runYouTubeFirst(query) {');
  const send = app.indexOf('  async function send(raw) {');
  assert.ok(handler >= 0 && send > handler, 'runYouTubeFirst must be in send() scope, not nested in runChatJobSearch()');
  assert.ok(app.includes("YouTube embed search failed; showing direct search fallback."), 'a thrown search/embed error must produce a visible fallback');
  assert.ok(app.includes("link.href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query.slice(0, 180));"), 'fallback must link to a real YouTube search');
});

test('send button remains actionable for typed messages even when AI is unavailable', () => {
  assert.match(app, /sendBtn\.disabled = !stopping && \(busy \|\| preparing > 0 \|\| \(!hasText && !Recognition\)\)/);
  assert.doesNotMatch(app, /sendBtn\.disabled = !stopping && \(busy \|\| \(!aiAvailable && !isYouTubeSearchRequest\(input\.value\)\)/);
  assert.match(app, /NasrinAI is temporarily unavailable for this message/);
});

test('video discovery keeps the normal answer path and embeds are optional enrichment', () => {
  const sendStart = app.indexOf('  async function send(raw) {');
  const sendEnd = app.indexOf('  async function ', sendStart + 10);
  const sendBody = app.slice(sendStart, sendEnd > sendStart ? sendEnd : undefined);
  assert.doesNotMatch(sendBody, /return runYouTubeFirst\(text\)/, 'video intent must not bypass the normal answer');
  const answerRenderer = app.indexOf('if (fresh && role === \'assistant\')');
  const optionalEmbed = app.indexOf('if (videoQuery) renderYouTubeVideos(el, videoQuery, cited.links);', answerRenderer);
  assert.ok(answerRenderer >= 0 && optionalEmbed > answerRenderer, 'video enrichment runs after the assistant reply is rendered');
  assert.match(app.slice(optionalEmbed, optionalEmbed + 120), /renderYouTubeVideos/);
});

test('latest creator-video searches prioritize official uploads rather than channel cards', () => {
  const start = app.indexOf('  async function renderYouTubeVideos(');
  const end = app.indexOf('  function sourcesToggle(', start);
  const body = app.slice(start, end);
  assert.match(body, /official channel latest uploads video/);
  assert.match(body, /buildVideoSearchQuery/);
  assert.match(body, /const query = buildVideoSearchQuery\(userQuery\)/);
});
