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
      { ai_available: false, external_model: null, own_model: null, redacts_contact_details: false, files: { photos: false, pdfs: false }, legal: { terms_version: '2026-10-12b', privacy_version: '2026-10-12h' }, plans: true, library: true, projects: true, research: false, uploads: { direct: false }, images: { available: false }, videos: { available: false }, sign_in: { email: false, google: false }, turnstile: { site_key: null }, guest_session_hours: 24, speech: { available: false, voices: [], default: null, rate: 1.15 } });
    assert.deepEqual(statusOn,
      { ai_available: true, external_model: true, own_model: false, redacts_contact_details: true, files: { photos: true, pdfs: true }, legal: { terms_version: '2026-10-12b', privacy_version: '2026-10-12h' }, plans: true, library: true, projects: true, research: false, uploads: { direct: false }, images: { available: false }, videos: { available: false }, sign_in: { email: false, google: false }, turnstile: { site_key: null }, guest_session_hours: 24, speech: { available: false, voices: [], default: null, rate: 1.15 } });
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
  assert.match(html, /id="spaceCoding">\s*<span class="space-app-logo code-logo"/);
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
