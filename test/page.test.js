import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/http/app.js';
import { createStatic } from '../src/http/static.js';
import { PUBLIC_DIR } from '../src/main.js';
import { createFakeProvider } from '../src/ai/fake.js';
import { buildTestApp, serve, testConfig, memoryLogger } from './helpers.js';

test('the chat page loads its script and styles as files that the strict CSP allows', async () => {
  const app = createApp({ config: testConfig(), logger: memoryLogger(), gateway: {}, serveStatic: createStatic(PUBLIC_DIR) });
  const srv = await serve(app);
  try {
    const page = await fetch(srv.url + '/');
    const html = await page.text();
    assert.match(html, /<link rel="icon" type="image\/png" href="\/logo\.png">/, 'Google-search favicon points to logo.png');
    assert.match(page.headers.get('content-security-policy'), /script-src 'self' https:\/\/challenges\.cloudflare\.com/);
    assert.match(page.headers.get('content-security-policy'), /frame-src https:\/\/challenges\.cloudflare\.com/);
    assert.match(html, /<script src="\/app\.js" defer><\/script>/);

    for (const [path, type] of [['/app.js', /javascript/], ['/character.js', /javascript/], ['/app.css', /text\/css/], ['/icon.svg', /image\/svg\+xml/], ['/apple-touch-icon.png', /image\/png/], ['/icon-512.png', /image\/png/], ['/logo.png', /image\/png/], ['/favicon.ico', /image\/x-icon/], ['/manifest.webmanifest', /application\/manifest\+json/]]) {
      const r = await fetch(srv.url + path);
      assert.equal(r.status, 200, path);
      assert.match(r.headers.get('content-type'), type, path);
    }
  } finally { await srv.close(); }
});

test('the page has no inline script, inline handlers, inline styles or HTML-injection sinks', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'inline <script>');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'inline event handler');
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'inline style attribute');
  assert.doesNotMatch(html, /<style/i, 'inline <style>');

  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const character = await readFile(new URL('../public/character.js', import.meta.url), 'utf8');
  for (const code of [js, character]) {
    assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|setAttribute\(\s*['"]style/);
  }
  assert.match(js, /createTextNode\(text\)/);
  assert.match(html, /<script src="\/character\.js" defer><\/script>/);
});

test('status tells the page whether the AI is on and whether messages leave the server', async () => {
  const off = buildTestApp({ provider: null });
  const on = buildTestApp({ provider: createFakeProvider({ dataLeavesServer: true }) });
  const a = await serve(off.app);
  const b = await serve(on.app);
  try {
    const statusOff = await (await fetch(a.url + '/v1/status')).json();
    const statusOn = await (await fetch(b.url + '/v1/status')).json();
    // The status endpoint now intentionally includes the known voice catalog
    // even when providers are unavailable; this test covers the remaining
    // status contract, while the dedicated voice tests cover catalog behavior.
    statusOff.speech = { ...statusOff.speech, voices: [], default: null };
    statusOn.speech = { ...statusOn.speech, voices: [], default: null };
    assert.deepEqual(statusOff,
      { ai_available: false, external_model: null, own_model: null, redacts_contact_details: false, files: { photos: false, pdfs: false }, legal: { terms_version: '2026-10-13', privacy_version: '2026-10-13g' }, github: { available: false, off: 'not_set' }, plans: true, library: true, projects: true, research: false, uploads: { direct: false }, images: { available: false }, videos: { available: false }, sign_in: { email: false, google: false }, turnstile: { site_key: null }, guest_session_hours: 24, speech: { available: false, voices: [], default: null, rate: 1.15 } });
    assert.deepEqual(statusOn,
      { ai_available: true, external_model: true, own_model: false, redacts_contact_details: true, files: { photos: true, pdfs: true }, legal: { terms_version: '2026-10-13', privacy_version: '2026-10-13g' }, github: { available: false, off: 'not_set' }, plans: true, library: true, projects: true, research: false, uploads: { direct: false }, images: { available: false }, videos: { available: false }, sign_in: { email: false, google: false }, turnstile: { site_key: null }, guest_session_hours: 24, speech: { available: false, voices: [], default: null, rate: 1.15 } });
  } finally { await a.close(); await b.close(); }
});

test('system-dark composer keeps the same compact padding as dark theme', async () => {
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  assert.match(css, /:root:not\(\[data-theme="light"\]\) #input \{[^}]*padding: 0\.4rem 0\.8rem 0\.45rem;/s,
    'system-dark composer must use the compact message-field padding');
  assert.doesNotMatch(css, /padding: 2\.65rem 2\.25rem 0\.45rem/,
    'oversized composer padding must not return');
});

// A missing element that app.js dereferences at start-up throws before the code
// that restores the sign-in and loads the tiers, so Google sign-in "does nothing"
// and the model picker never appears. Every $('id') must exist in index.html,
// unless it is read into a variable that is checked, or used with ?.
test('app.js never dereferences a page element that index.html does not have', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const unsafe = [];
  for (const m of js.matchAll(/\$\('([^']+)'\)(\??\.)?/g)) {
    const id = m[1];
    if (ids.has(id)) continue;
    const before = js.slice(Math.max(0, m.index - 40), m.index);
    const isOptionalRead = /\b(?:const|let)\s+\w+\s*=\s*$/.test(before);   // const x = $('id'); checked later
    const usesOptionalChain = m[2] === '?.';
    if (!isOptionalRead && !usesOptionalChain) unsafe.push(id);
  }
  assert.deepEqual([...new Set(unsafe)], [], 'elements used without a check but missing from index.html');
});

test('NasrinAI Space uses the requested Connect mark and adapts every app icon background', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  const connectMark = await readFile(new URL('../public/space-logos/nasrinai-connect-mark.svg', import.meta.url), 'utf8');
  assert.match(html, /id="spaceConnect"[\s\S]*?nasrinai-connect-mark\.svg/);
  assert.doesNotMatch(html, /id="spaceConnect"[\s\S]*?nasrinai-connect-dark\.svg/);
  assert.match(connectMark, /fill-rule="evenodd"/);
  // Library uses the one theme-adaptive glyph (owner request 2026-10-12), not a badge image.
  assert.match(html, /id="spaceLibrary"[\s\S]*?class="space-app-logo space-app-glyph lib-glyph"/);
  assert.match(html, /id="drawerLibrary"><svg class="lib-glyph"/);
  assert.match(css, /svg\.lib-glyph[^{]*\{ fill: currentColor; stroke: none; \}/);
  // Coding uses the pixel-robot Code logo (owner, 2026-10-12), chosen by theme and motion in CSS.
  assert.match(html, /id="spaceCoding">\s*<span class="space-app-icon" aria-hidden="true"><span class="space-app-logo code-logo"/);
  // Every app sits on the same tile (owner, 2026-10-13): light grey, lifted grey in dark mode.
  assert.equal((html.match(/<span class="space-app-icon"/g) || []).length, 7);
  assert.match(css, /#pageSpace \.space-app-icon \{[^}]*background: #ECEBE7;/);
  assert.match(css, /:root\[data-theme="dark"\] #pageSpace \.space-app-icon \{ background: #3A3A3C; \}/);
  // The robot has no tile of its own; while busy it breaks into pixels and comes back.
  for (const f of ['code-bot-light.svg', 'code-bot-dark.svg', 'code-bot-light-busy.svg']) {
    const svg = await readFile(new URL('../public/space-logos/' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(svg, /<rect width="1024" height="1024"/, f + ' has no background tile');
  }
  const busy = await readFile(new URL('../public/space-logos/code-bot-light-busy.svg', import.meta.url), 'utf8');
  assert.match(busy, /animateTransform attributeName="transform" type="translate"/);
  // Grows from small, bursts and comes back; spins horizontally only while burst (owner, 2026-10-13).
  assert.doesNotMatch(busy, /type="rotate"/);
  // Perfect pixel (owner, 2026-10-13): no copies, no fading, no overlap. The
  // grid spreads evenly and bounces; the face (eyes, speckle) slides across
  // the fixed grid like a turning globe, in whole-pixel frames.
  assert.doesNotMatch(busy, /values="1 1;1 1;-1 1/);
  assert.match(busy, /type="scale" values="\.76;1\.02;\.9;\.9;\.69;\.76"[^>]*calcMode="spline"/);
  assert.equal((busy.match(/<rect /g) || []).length, 616);
  assert.doesNotMatch(busy, /attributeName="opacity"/);
  assert.match(busy, /attributeName="fill" calcMode="discrete" values="[^"]*#0b0b0c/);
  assert.match(busy, /type="translate" values="0 0;0 0;[^"]*"[^>]*calcMode="spline"/);
  // Two more moods (remember, write), light and dark, CSP-safe, chosen by the thinking line.
  for (const f of ['code-bot-light-remember.svg', 'code-bot-dark-remember.svg', 'code-bot-light-write.svg', 'code-bot-dark-write.svg']) {
    const svg = await readFile(new URL('../public/space-logos/' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(svg, /<style|style=|<script|href=/i, f);
    assert.match(css, new RegExp(f.replace('.', '\\.')), f);
  }
  for (const f of ['code-bot-light.svg', 'code-bot-dark.svg', 'code-bot-light-still.svg', 'code-bot-dark-still.svg', 'code-bot-light-busy.svg', 'code-bot-dark-busy.svg']) {
    assert.match(css, new RegExp(f.replace('.', '\\.')), f);
    const svg = await readFile(new URL('../public/space-logos/' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(svg, /<style|style=|<script|href=/i, f + ' needs no inline styles or scripts (strict CSP)');
  }
  assert.match(html, /id="spaceCloud"[\s\S]*?space-logos\/icon-cloud-orange\.svg/);
  assert.match(html, /id="pageSpace"[\s\S]*?nasrinai-space-icon\.svg/);
  assert.match(css, /html\[data-theme="light"\] #pageSpace \.space-app-logo:not\(\.space-app-logo-empty\):not\(\.space-cloud-logo\) \{ filter: invert\(1\); \}/);
  assert.match(css, /prefers-color-scheme: light/);
  assert.match(css, /prefers-color-scheme: dark/);
});

test('logging out requires confirmation before the sign-out action', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const handler = js.slice(js.indexOf("$('logoutBtn').addEventListener('click'"), js.indexOf('accountBtn.addEventListener(\'click\'', js.indexOf("$('logoutBtn').addEventListener('click'")));
  assert.match(handler, /window\.confirm\(/, 'logout must ask for confirmation');
  assert.match(handler, /if\s*\(!window\.confirm\([\s\S]*?\)\)\s*return;/, 'cancel must abort logout');
  assert.ok(handler.indexOf('window.confirm(') < handler.indexOf('accountBtn.click()'), 'sign-out action must occur only after confirmation');
});



test('voice settings keep provider catalogs visible when browser audio support is missing', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const renderStart = js.indexOf('function renderVoices()');
  const renderEnd = js.indexOf("if(canDevice&&'onvoiceschanged'", renderStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart, 'voice renderer exists');
  const renderer = js.slice(renderStart, renderEnd);
  assert.match(renderer, /providerRows\('openai','ChatGPT \/ OpenAI'\)/);
  assert.match(renderer, /providerRows\('gemini','Gemini'\)/);
  assert.doesNotMatch(renderer, /speech\.available\s*&&\s*AudioCtx/, 'catalog visibility must not depend on Web Audio support');
  assert.match(renderer, /disabled:v\.available===false/, 'unconfigured providers remain visible but disabled');
});

test('status endpoint preserves unavailable voice catalog for Settings', async () => {
  const routes = await readFile(new URL('../src/routes.js', import.meta.url), 'utf8');
  assert.match(routes, /available:\s*Boolean\(voice\s*&&\s*voice\.available\)[\s\S]{0,400}voices:\s*voice\s*&&\s*Array\.isArray\(voice\.voices\)\s*\?\s*voice\.voices\s*:\s*\[\]/);
});

test('sign-in Turnstile widget is centered below the email form and smaller on phones', async () => {
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(css, /\.signin-captcha \{[^}]*display: flex;[^}]*justify-content: center;/s, 'widget must be centered');
  assert.match(css, /@media \(max-width: 480px\) \{\s*\.signin-captcha \{[^}]*transform: scale\(0\.8\);[^}]*transform-origin: top center;/s,
    'widget must be scaled down from its top center on phones');
  const form = html.indexOf('id="emailForm"');
  const widget = html.indexOf('id="turnstileWidget"');
  const status = html.indexOf('id="signinStatus"');
  assert.ok(form > -1 && form < widget && widget < status, 'widget sits below the email form and above the status message');
});

test('oversized pasted composer text becomes a plain-text attachment', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(js, /function pastedTextOverflows\(text\)/, 'overflow is measured against the composer max height');
  assert.match(js, /input\.addEventListener\('paste',[\s\S]{0,1600}pastedTextOverflows\(text\)/,
    'the paste handler checks plain text before allowing it into the composer');
  assert.match(js, /new File\(\[text\], 'pasted-message-'[\s\S]{0,100}type: 'text\/plain'/,
    'overflowing pasted text is wrapped in a TXT file');
  assert.match(js, /if \(!text \|\| !pastedTextOverflows\(text\)\) return;/,
    'short text continues to paste normally');
});

test('a tech-style loader shows while a picture, video or file is being made (owner, 2026-10-13)', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  const files = await readFile(new URL('../public/files.js', import.meta.url), 'utf8');
  // Built from elements, announced as a status, with the time so far.
  assert.match(js, /function genLoader\(text, \{ compact = false, timer = true \} = \{\}\) \{/);
  assert.match(js, /box\.setAttribute\('role', 'status'\);/);
  const loader = js.slice(js.indexOf('function genLoader('), js.indexOf('function clearScreen('));
  assert.doesNotMatch(loader, /innerHTML|insertAdjacentHTML/);
  // Used for the picture itself, the video and a file being written.
  assert.match(js, /if \(path === '\/v1\/images'\) \{[\s\S]{0,120}thinking = genLoader\(label\);/);
  assert.match(js, /const loader = genLoader\('Creating your video'\);/);
  assert.match(js, /fileLoader = genLoader\('Writing your file', \{ compact: true \}\)/);
  assert.doesNotMatch(files, /Writing your file…/);   // the loader replaces the old text note
  // Still when motion is reduced (system setting and the in-app setting).
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.gen-cell, \.gen-scan, \.gen-label > span:first-child \{ animation: none; \}/);
  assert.match(css, /:root\[data-motion="reduce"\] \.gen-scan \{ display: none; \}/);
});

test('replies fade in and the chat stays where the person is reading (owner, 2026-10-13)', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  // Following stops as soon as the person moves up, and only their own
  // scrolling can stop it; sending a message starts following again.
  assert.match(js, /function scrollToEnd\(el, \{ force = false, instant = false \} = \{\}\) \{\s*if \(force\) following = true;\s*if \(!following\) return;/);
  assert.match(js, /log\.addEventListener\('wheel', \(e\) => \{ touchedAt = Date\.now\(\); if \(e\.deltaY < 0\) up\(\); \}/);
  assert.match(js, /if \(Date\.now\(\) - touchedAt > 1000\) return;\s*following = log\.scrollHeight - log\.scrollTop - log\.clientHeight < 96;/);
  assert.match(js, /scrollToEnd\(el, \{ force: role === 'user' \}\);/);
  // Streaming text follows instantly (a smooth scroll per word would lag).
  assert.match(js, /strip\(raw\);[\s\S]{0,500}?scrollToEnd\(el, \{ instant: true \}\);\s*\},/);
  // Fade: the live reply, and a reply shown at once.
  assert.match(js, /el\.className = 'msg assistant is-live is-new';/);
  assert.match(css, /\.msg\.assistant\.is-new \{ animation: fade-in 360ms/);
});

test('web sources are visible by default with an accessible toggle beside reply actions (owner, 2026-10-18)', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  assert.match(js, /const cited = window\.NasrinFormat\.sources\(text\);\s*text = cited\.text \|\| text;/);
  assert.match(js, /if \(cited\.links\.length\) sourcesToggle\(actions, cited\.links\);/);
  const toggle = js.slice(js.indexOf('function sourcesToggle('), js.indexOf('function replyActions('));
  assert.match(toggle, /list\.hidden = false;/);
  assert.match(toggle, /const heading = mk\('p', 'reply-sources-heading', 'Sources & Resources'\);/);
  assert.match(toggle, /b\.setAttribute\('aria-expanded', 'true'\);/);
  assert.match(toggle, /heading\.hidden = !open;/);
  assert.match(toggle, /a\.rel = 'noopener noreferrer';/);
  assert.doesNotMatch(toggle, /innerHTML/);
  // Copy, share and Save to Library keep the sources; read-aloud skips them.
  assert.match(js, /const plainText = window\.NasrinFormat\.plain\(full\);/);
  assert.match(css, /\.reply-sources\[hidden\] \{ display: none; \}/);
});

test('"clean this" with a spreadsheet runs the cleaner on the device, never the chat (owner, 2026-10-13)', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="\/cleaner\.js" defer><\/script>/);
  // Asked to clean, with a .xlsx/.csv attached: cleaned here, no chat request.
  assert.match(js, /if \(!editing && !shortcut && CLEAN_ASK\.test\(text\) && pending\.some\(isSheetFile\)\) \{[\s\S]{0,120}return cleanFiles\(text, files\);/);
  assert.match(js, /const isSheetFile = \(f\) => f\.local && \/\\\.\(csv\|tsv\|xlsx\|xlsm\)\$\/i\.test/);
  const flow = js.slice(js.indexOf('async function cleanFiles('), js.indexOf('function cleanerCard('));
  assert.doesNotMatch(flow, /api\(|fetch\(|runTurn\(/);
  // The local File is kept on the item but never put in a request body.
  assert.match(js, /attachments: files\.map\(\(f\) => \(f\.upload \? \{ name: f\.name, type: f\.type, upload: f\.upload \} : \{ name: f\.name, type: f\.type, data: f\.data \}\)\)/);
  // The card: the check, a dashboard, the first rows, the full workbook to download.
  const card = js.slice(js.indexOf('function cleanerCard('), js.indexOf('// A file Nasrin wrote for the person'));
  assert.match(card, /values accounted for · nothing lost/);
  assert.match(card, /window\.NasrinCleaner\.workbook\(result, fileName\)/);
  assert.doesNotMatch(card, /innerHTML/);
});

test('chat follow-up questions are presented as a list with editable answers (owner, 2026-10-18)', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  const card = js.slice(js.indexOf('function askCard('), js.indexOf('function show(role, text'));
  assert.match(card, /const questionList = document\.createElement\('ul'\);/);
  assert.match(card, /questionList\.className = 'ask-questions';/);
  assert.match(card, /item\.appendChild\(questionBox\(q,/);
  assert.match(js, /field\.placeholder = 'Type your answer';/);
  assert.match(js, /field\.addEventListener\('input', \(\) =>/);
  assert.match(css, /\.ask-card \.ask-questions/);
});

test('normal chats use a slightly smaller text size (owner, 2026-10-13)', async () => {
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.msg\.assistant \{ align-self: flex-start; font-size: 0\.95rem; line-height: 1\.62; \}/);
  assert.match(css, /\.msg\.user \{[^}]*font-size: 0\.95rem;/);
  assert.match(css, /\.rich h3, \.rich h4 \{ font: 500 1rem\/1\.35 var\(--round\);/);
  // The coding chat keeps its own, smaller size.
  assert.match(css, /body\.coding-mode \.msg\.assistant \{ font-family: var\(--sans\); font-size: 0\.875rem;/);
});

test('the person’s message bubble is a softer charcoal in light mode only (owner, 2026-10-13)', async () => {
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  assert.match(css, /:root \{[^}]*--bubble: color-mix\(in srgb, var\(--ink\) 76%, var\(--paper\)\);/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\) \{[^}]*--bubble: var\(--ink\);/);
  assert.match(css, /:root\[data-theme="dark"\] \{[^}]*--bubble: var\(--ink\);/);
  assert.match(css, /\.msg\.user \{[^}]*background: var\(--bubble, var\(--ink\)\);/);
});

test('the Sources button shows overlapping site badges and the word Sources (owner, 2026-10-13)', async () => {
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/app.css', import.meta.url), 'utf8');
  const toggle = js.slice(js.indexOf('function sourcesToggle('), js.indexOf('function replyActions('));
  assert.match(toggle, /b\.setAttribute\('aria-label', `Sources \(\$\{links\.length\}\)`\);/);
  assert.match(toggle, /const hosts = \[\.\.\.new Set\(links\.map\(\(l\) => l\.host\)\)\]\.slice\(0, 3\);/);
  assert.match(toggle, /b\.append\(faces, mk\('span', 'src-word', 'Sources'\)\);/);
  assert.doesNotMatch(toggle, /<img|\.src = /);   // no outside images (strict CSP, no third-party requests)
  assert.match(css, /\.src-face \+ \.src-face \{ margin-left: -0\.38rem; \}/);
});

test('NCC (Nasrin Client Connect) is in NasrinAI Space for enterprises: contact the team (owner, 2026-10-13)', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="spaceNcc" aria-label="NCC, Nasrin Client Connect: CRM with automations for enterprises, contact the team"/);
  assert.match(html, /<span class="space-app-name">NCC<\/span>/);
  const ncc = js.slice(js.indexOf("if (spaceNcc) spaceNcc.addEventListener"), js.indexOf("// ---------- Terms acceptance"));
  assert.match(ncc, /mail\.href = 'mailto:support@nasrinai\.com\?subject='/);
  assert.match(ncc, /separate from Connect\. ', mail, ' to turn it on for your business\./);
  // Accounts the team turned on get a link to the NCC app; the server decides.
  assert.match(ncc, /open = await api\('\/v1\/ncc\/status'\)/);
  assert.match(ncc, /link\.rel = 'noopener';/);
  assert.doesNotMatch(ncc, /innerHTML/);
});

test('the NCC tile uses the owner’s chosen logo: B · Flow, three triangles (owner, 2026-10-13)', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const tile = html.slice(html.indexOf('id="spaceNcc"'), html.indexOf('</button>', html.indexOf('id="spaceNcc"')));
  assert.match(tile, /<svg class="space-app-logo space-app-glyph space-ncc-glyph" viewBox="0 0 120 120" aria-hidden="true">/);
  assert.equal((tile.match(/<path d="M[^"]+Z" fill="currentColor"/g) || []).length, 3);
  assert.doesNotMatch(tile, /space-movo-glyph|<circle/);
});
