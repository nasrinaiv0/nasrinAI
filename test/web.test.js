import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readLink, checkUrl, isPublicAddress, htmlToText, linksIn } from '../src/web/read-link.js';
import { createWebSearch, needsWeb } from '../src/web/search.js';
import { createPagePreviews } from '../src/web/page-preview.js';
import { createYouTubeSearch } from '../src/web/youtube.js';
import { createFakeProvider } from '../src/ai/fake.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

const page = (status, headers, body = '') => Object.assign(Readable.from([Buffer.from(body)]), { statusCode: status, headers });

test('link reader refuses internal addresses (SSRF)', () => {
  for (const u of ['http://127.0.0.1/', 'http://localhost:3000/', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/', 'http://[::1]/',
    'file:///etc/passwd', 'ftp://example.com', 'https://user:pass@example.com', 'https://example.com:8443/', 'http://metadata.google.internal/']) {
    assert.equal(checkUrl(u), null, u);
  }
  assert.ok(checkUrl('https://example.com/a?b=1'));
  for (const ip of ['192.168.1.1', '172.20.0.1', '100.64.0.1', '0.0.0.0', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', '64:ff9b:1::1', '192.88.99.1', '192.31.196.1', '192.52.193.1', '192.175.48.1', '198.18.0.1', '198.19.255.254', '2001::1', '2001:20::1', '2002:7f00:1::', '2001:db8::1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('93.184.216.34'), true);
  assert.equal(isPublicAddress('2606:2800:220:1:248:1893:25c8:1946'), true);
});

test('link reader: readable text, redirects checked, errors explained', async () => {
  const html = '<html><head><title>Shop &amp; Co</title><style>x{}</style></head><body><nav>menu</nav><h1>Hours</h1><p>Open 9&nbsp;am.</p><script>evil()</script></body></html>';
  const ok = await readLink('https://shop.example.com/', { getImpl: async () => page(200, { 'content-type': 'text/html; charset=utf-8' }, html) });
  assert.equal(ok.title, 'Shop & Co');
  assert.match(ok.text, /Hours[\s\S]*Open 9 am\./);
  assert.doesNotMatch(ok.text, /evil|menu/);

  const redirected = await readLink('https://a.example.com/', { getImpl: async () => page(302, { location: 'http://127.0.0.1/admin' }) });
  assert.equal(redirected.error, 'redirects to a blocked address');
  assert.equal((await readLink('https://a.example.com/', { getImpl: async () => page(404, {}) })).error, 'the site answered 404');
  assert.equal((await readLink('https://a.example.com/x.zip', { getImpl: async () => page(200, { 'content-type': 'application/zip' }) })).error, 'not a text page');
  assert.equal((await readLink('https://a.example.com/large', { getImpl: async () => page(200, { 'content-type': 'text/plain' }, 'x'.repeat(1_500_001)) })).error, 'the page is too large');
  assert.equal((await readLink('http://10.1.1.1/')).error, 'not a public web address');
  assert.deepEqual(linksIn('see https://a.com/x, and https://b.org/y. also https://a.com/x'), ['https://a.com/x', 'https://b.org/y']);
  assert.equal(htmlToText('<li>one</li><li>two</li>').text, '- one\n- two');
});

test('chat: a shared link is read and given to the model as data', async () => {
  const provider = createFakeProvider({ reply: () => 'Adobo is listed on the menu.' });
  const built = buildTestApp({ provider, readLinkImpl: async (u) => ({ url: u, title: 'Menu', text: 'Adobo 150 pesos' }) });
  const srv = await serve(built.app);
  try {
    const r = await postJson(srv.url + '/v1/chat', { message: 'How much is adobo here? https://resto.example.com/menu' }, bearer(USER_TOKEN));
    assert.equal(r.status, 200);
    const sent = provider.calls.at(-1).messages.at(-1).content;
    assert.match(sent, /Text of the web page https:\/\/resto\.example\.com\/menu \("Menu"\)[\s\S]*Adobo 150 pesos/);
    const answer = await r.clone().json();
    assert.match(answer.message.content, /Adobo is listed on the menu\.[\s\S]*\*\*Sources\*\*[\s\S]*\[Menu\]\(<https:\/\/resto\.example\.com\/menu>\)/, 'the answer retains the page that informed it');
    const saved = built.store;
    const history = await (await fetch(srv.url + `/v1/conversations/${(await r.json()).conversation_id}/messages`, { headers: bearer(USER_TOKEN) })).json();
    assert.doesNotMatch(JSON.stringify(history), /Adobo 150/, 'page text is not stored');
    assert.ok(saved);
  } finally { await srv.close(); }
});

test('OpenRouter web search answers with cited sources and records usage', async () => {
  const calls = [];
  const ws = createWebSearch({ apiKey: 'sk-x', model: 'gpt-6-luna', fetchImpl: async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return Response.json({ output: [{ type: 'web_search_call' }, { type: 'message', content: [{ type: 'output_text', text: 'It is sunny in Cebu today.', annotations: [{ type: 'url_citation', url: 'https://weather.example.com/cebu', title: 'Cebu weather' }] }] }], usage: { input_tokens: 3000, output_tokens: 40 } });
  } });
  assert.equal(needsWeb('What is the weather in Cebu today?'), true);
  assert.equal(needsWeb('Explain photosynthesis'), false);
  assert.equal(needsWeb('Research recent AI API changes and cite sources'), true);

  const provider = createFakeProvider();
  const built = buildTestApp({ provider, webSearch: ws, env: { ROUTING: 'smart', OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30) } });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'What is the weather in Cebu today?' }, bearer(USER_TOKEN))).json();
    assert.match(r.message.content, /sunny in Cebu[\s\S]*\*\*Sources\*\*\n- \[Cebu weather\]\(<https:\/\/weather\.example\.com\/cebu>\)/);
    assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/responses');
    assert.deepEqual(calls[0].body.tools, [{ type: 'openrouter:web_search', parameters: { engine: 'auto', max_results: 10, max_total_results: 10, search_context_size: 'medium' } }]);
    assert.deepEqual(calls[0].body.include, ['web_search_call.action.sources']);
    assert.match(calls[0].body.instructions, /Prefer primary and authoritative sources/);
    assert.equal(provider.calls.length, 0, 'the search answered; no second model call');
    const e = built.store.usage.at(-1);
    assert.deepEqual([e.task, e.model], ['web', 'gpt-6-luna']);
    assert.ok(e.costUsd == null || (Number.isFinite(e.costUsd) && e.costUsd >= 0), 'usage accounting is never negative or non-finite');
  } finally { await srv.close(); }
});


test('web search: an answer without verifiable source links is never shown', async () => {
  const ws = createWebSearch({ apiKey: 'sk-x', model: 'gpt-6-luna', fetchImpl: async () => Response.json({
    output: [{ type: 'web_search_call' }, { type: 'message', content: [{ type: 'output_text', text: 'Unverified current claim.' }] }],
    usage: { input_tokens: 20, output_tokens: 10 }
  }) });
  const provider = createFakeProvider();
  const built = buildTestApp({ provider, webSearch: ws, env: { ROUTING: 'smart', OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30) } });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'What is the weather in Cebu today?' }, bearer(USER_TOKEN))).json();
    assert.doesNotMatch(r.message.content, /Unverified current claim/);
    // No sources: the regular model answers instead (no web claim, no apology).
    assert.equal(provider.calls.length, 1);
    assert.match(r.message.content, /You said:/);
  } finally { await srv.close(); }
});

test('web search: streams first answer text before the response completes', async () => {
  const chunks = [
    'event: response.created\ndata: {"type":"response.created"}\n\n',
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"The answer is " }\n\n',
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"42."}\n\n',
    'event: response.completed\ndata: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"The answer is 42.","annotations":[{"type":"url_citation","url":"https://example.com","title":"Example"}]}]}],"usage":{"input_tokens":10,"output_tokens":5}}}\n\n'
  ];
  const ws = createWebSearch({ apiKey: 'sk-x', model: 'gpt-6-luna', fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); }
  }), { headers: { 'content-type': 'text/event-stream' } }) });
  const seen = [];
  const found = await ws.search({ system: 'answer', messages: [{ role: 'user', content: 'what is 42?' }], onText: (t) => seen.push(t) });
  assert.equal(seen.join(''), found.text, 'safe streaming chunks reconstruct the final answer');
  assert.ok(seen.length >= 1, 'answer text streams before the response completes');
  assert.equal(found.text, 'The answer is 42.');
  assert.equal(found.citations[0].url, 'https://example.com/');
});

test('a draft that admits it lacks current facts is replaced by a web search', async () => {
  let searches = 0;
  const ws = createWebSearch({ apiKey: 'sk-x', model: 'gpt-6-luna', fetchImpl: async () => { searches += 1; return Response.json({
    output: [{ type: 'web_search_call' }, { type: 'message', content: [{ type: 'output_text', text: 'The Senate opened the trial on Monday.', annotations: [{ type: 'url_citation', url: 'https://news.example.ph/a', title: 'News' }] }] }],
    usage: { input_tokens: 20, output_tokens: 10 }
  }); } });
  const provider = createFakeProvider({ reply: () => 'I can help, but I’ll need to check the web to give the latest. My built-in knowledge may be outdated.' });
  const built = buildTestApp({ provider, webSearch: ws, env: { ROUTING: 'smart', OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30) } });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'what happened with the impeachment case' }, bearer(USER_TOKEN))).json();
    assert.equal(searches, 1);
    assert.match(r.message.content, /Senate opened the trial/);
    assert.match(r.message.content, /Sources/);
    assert.doesNotMatch(r.message.content, /check the web|outdated/);
  } finally { await srv.close(); }
});


test('page previews only return validated raster images from safe page metadata', async () => {
  let imageReads = 0;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const previews = createPagePreviews({
    readLinkImpl: async (url) => ({
      url,
      html: '<html><head><meta property="og:image" content="/media/photo.png"></head><body>Page</body></html>',
      text: 'Page'
    }),
    readBytesImpl: async (url) => {
      imageReads++;
      assert.equal(url, 'https://example.com/media/photo.png');
      return { bytes: png };
    },
    now: () => 1000
  });
  const result = await previews.preview('https://example.com/article');
  assert.equal(result.type, 'image/png');
  assert.deepEqual(result.bytes, png);
  assert.equal(imageReads, 1);
  await previews.preview('https://example.com/article');
  assert.equal(imageReads, 1, 'successful previews are cached');
});

test('page previews reject non-http URLs and refuse SVG/HTML image payloads', async () => {
  let pageReads = 0;
  let imageReads = 0;
  const previews = createPagePreviews({
    readLinkImpl: async (url) => {
      pageReads++;
      return { url, html: '<meta property="og:image" content="https://example.com/image.svg">', text: 'Page' };
    },
    readBytesImpl: async () => {
      imageReads++;
      return { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') };
    }
  });
  assert.equal(await previews.preview('data:text/plain,hello'), null);
  assert.equal(pageReads, 0);
  assert.equal(await previews.preview('https://example.com/article'), null);
  assert.equal(imageReads, 1);
});


test('YouTube search returns only valid embeddable video IDs and keeps the API key server-side', async () => {
  const requests = [];
  const youtube = createYouTubeSearch({
    apiKey: 'test-secret-key',
    fetchImpl: async (url, options) => {
      const requestedUrl = new URL(url);
      requests.push({ url: requestedUrl, options });
      if (requestedUrl.pathname.endsWith('/search')) {
        return Response.json({ items: [
          { id: { videoId: 'abcdefghijk' }, snippet: { title: 'Tutorial', channelTitle: 'Channel', description: 'Steps', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg' } } } },
          { id: { videoId: 'lmnopqrstuv' }, snippet: { title: 'Cannot embed', channelTitle: 'Channel' } },
          { id: { videoId: 'bad id' }, snippet: { title: 'Invalid', channelTitle: 'Bad' } },
          { id: { channelId: 'not-a-video' }, snippet: { title: 'Channel result', channelTitle: 'Channel' } }
        ] });
      }
      return Response.json({ items: [
        { id: 'abcdefghijk', status: { embeddable: true, privacyStatus: 'public' } },
        { id: 'lmnopqrstuv', status: { embeddable: false, privacyStatus: 'public' } }
      ] });
    }
  });
  const result = await youtube.search('  how to configure an app  ');
  assert.equal(result.available, true);
  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].id, 'abcdefghijk');
  assert.equal(result.videos[0].embedUrl, 'https://www.youtube-nocookie.com/embed/abcdefghijk');
  const searchRequest = requests.find((item) => item.url.pathname.endsWith('/search'));
  const statusRequest = requests.find((item) => item.url.pathname.endsWith('/videos'));
  assert.equal(searchRequest.url.searchParams.get('type'), 'video');
  assert.equal(searchRequest.url.searchParams.get('maxResults'), '5');
  assert.equal(searchRequest.url.searchParams.get('q'), 'how to configure an app');
  assert.equal(searchRequest.url.searchParams.get('key'), 'test-secret-key');
  assert.equal(searchRequest.options.method, 'GET');
  assert.equal(statusRequest.url.searchParams.get('part'), 'status,contentDetails');
  assert.equal(statusRequest.url.searchParams.get('id'), 'abcdefghijk,lmnopqrstuv');
  assert.equal(statusRequest.url.searchParams.get('key'), 'test-secret-key');
});

test('YouTube search excludes videos blocked in the viewer region', async () => {
  let calls = 0;
  const youtube = createYouTubeSearch({
    apiKey: 'test-key',
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return Response.json({ items: [
        { id: { videoId: 'abcdefghijk' }, snippet: { title: 'Blocked in PH', channelTitle: 'Channel' } },
        { id: { videoId: 'lmnopqrstuv' }, snippet: { title: 'Allowed only elsewhere', channelTitle: 'Channel' } },
        { id: { videoId: 'zyxwvutsrqp' }, snippet: { title: 'Available in PH', channelTitle: 'Channel' } }
      ] });
      return Response.json({ items: [
        { id: 'abcdefghijk', status: { embeddable: true, privacyStatus: 'public' }, contentDetails: { regionRestriction: { blocked: ['PH'] } } },
        { id: 'lmnopqrstuv', status: { embeddable: true, privacyStatus: 'public' }, contentDetails: { regionRestriction: { allowed: ['US', 'CA'] } } },
        { id: 'zyxwvutsrqp', status: { embeddable: true, privacyStatus: 'public' }, contentDetails: {} }
      ] });
    }
  });
  const result = await youtube.search('trending videos');
  assert.deepEqual(result.videos.map((video) => video.id), ['zyxwvutsrqp']);
  const statusRequest = calls > 0;
  assert.equal(statusRequest, true);
});

test('YouTube search returns no embeds if embed permission cannot be verified', async () => {
  let calls = 0;
  const youtube = createYouTubeSearch({
    apiKey: 'test-key',
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return Response.json({ items: [
        { id: { videoId: 'abcdefghijk' }, snippet: { title: 'Tutorial', channelTitle: 'Channel' } }
      ] });
      return new Response('', { status: 403 });
    }
  });
  assert.deepEqual(await youtube.search('tutorial'), { available: true, videos: [] });
});

test('persisted YouTube videos are restored only when still embeddable', async () => {
  const requests = [];
  const youtube = createYouTubeSearch({
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      const requested = new URL(url);
      requests.push(requested);
      return Response.json({ items: [
        { id: 'abcdefghijk', status: { embeddable: true, privacyStatus: 'public' } }
      ] });
    }
  });
  assert.equal(await youtube.verify('abcdefghijk'), true);
  assert.equal(requests[0].pathname.endsWith('/videos'), true);
  assert.equal(requests[0].searchParams.get('part'), 'status');
  assert.equal(requests[0].searchParams.get('id'), 'abcdefghijk');
  assert.equal(await youtube.verify('not-a-valid-id'), false);
  assert.equal(requests.length, 1, 'invalid IDs never reach YouTube');
});

test('YouTube search is disabled without an API key and handles upstream failures gracefully', async () => {
  const disabled = createYouTubeSearch({ apiKey: '' });
  assert.equal(disabled.available, false);
  assert.deepEqual(await disabled.search('tutorial'), { available: false, videos: [] });
  const failing = createYouTubeSearch({ apiKey: 'test-key', fetchImpl: async () => new Response('', { status: 403 }) });
  assert.deepEqual(await failing.search('tutorial'), { available: true, videos: [] });
});


test('web intent detection covers public-entity questions and source-seeking research without browsing timeless basics', () => {
  assert.equal(needsWeb('Who is Fei-Fei Li?'), true);
  assert.equal(needsWeb('What is OpenAI?'), true);
  assert.equal(needsWeb('Compare Claude and OpenAI models'), true);
  assert.equal(needsWeb('Find the best AI coding tools'), true);
  assert.equal(needsWeb('Show reviews of the latest iPhone'), true);
  assert.equal(needsWeb('Find peer-reviewed papers on ocean warming'), true);
  assert.equal(needsWeb('Explain photosynthesis'), false);
  assert.equal(needsWeb('What is a variable?'), false);
  assert.equal(needsWeb('Can NasrinAI browse the internet?'), false);
});


test('web search uses deeper context for research and asks for evidence quality', async () => {
  let body;
  const ws = createWebSearch({ apiKey: 'sk-x', model: 'gpt-6-luna', fetchImpl: async (_url, init) => {
    body = JSON.parse(init.body);
    return Response.json({ output: [
      { type: 'web_search_call', action: { sources: [{ url: 'https://official.example.com/docs' }] } },
      { type: 'message', content: [{ type: 'output_text', text: 'A sourced comparison.', annotations: [{ type: 'url_citation', url: 'https://official.example.com/docs', title: 'Official docs' }] }] }
    ], usage: { input_tokens: 30, output_tokens: 10 } });
  } });
  const result = await ws.search({ system: 'Answer carefully.', messages: [{ role: 'user', content: 'Research and compare official documentation and peer-reviewed papers across multiple sources.' }] });
  assert.equal(body.tools[0].parameters.search_context_size, 'high');
  assert.deepEqual(body.include, ['web_search_call.action.sources']);
  assert.match(body.instructions, /cross-check with more than one credible source/);
  assert.match(body.instructions, /flag uncertainty, disagreement/);
  assert.equal(result.citations[0].url, 'https://official.example.com/docs');
});

test('broadened web intent patterns use working word boundaries', () => {
  assert.equal(needsWeb('Who is Fei-Fei Li?'), true);
  assert.equal(needsWeb('What is OpenAI?'), true);
  assert.equal(needsWeb('Compare Claude and OpenAI models'), true);
  assert.equal(needsWeb('Find the best AI coding tools'), true);
  assert.equal(needsWeb('Find peer-reviewed papers on ocean warming'), true);
  assert.equal(needsWeb('Explain photosynthesis'), false);
  assert.equal(needsWeb('Can NasrinAI browse the internet?'), false);
});
