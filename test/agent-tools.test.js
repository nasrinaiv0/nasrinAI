import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAgentTools, globToRegExp } from '../src/tools/agent.js';
import { createToolRegistry } from '../src/tools/registry.js';
import { createGithubApi } from '../src/github/api.js';
import { AGENT_ASK, toolStageOf } from '../src/chat.js';
import { readFile } from 'node:fs/promises';
import { checkOutcome } from '../src/auto-repair.js';

const user = { tenantId: 't1', actor: { type: 'user', id: 'u1' } };
const guest = { tenantId: 't1', actor: { type: 'guest', id: 'g1' } };
const okStore = (limit = Infinity) => { const hits = new Map(); return { rateHit: async (b) => { const n = (hits.get(b) || 0) + 1; hits.set(b, n); return { allowed: n <= limit }; } }; };

function fakeSandbox({ exitCode = 0, stdout = 'hi\n', stderr = '', failCreate = false } = {}) {
  const calls = { create: null, files: [], commands: [], stopped: false };
  const factory = async (opts) => {
    calls.create = opts;
    if (failCreate) throw new Error('no credentials');
    return {
      writeFiles: async (f) => { calls.files.push(...f); },
      runCommand: async (c) => { calls.commands.push(c); return { exitCode, stdout: async () => stdout, stderr: async () => stderr }; },
      stop: async () => { calls.stopped = true; }
    };
  };
  return { factory, calls };
}

test('fetch_url returns readable text in pages and marks it as outside data', async () => {
  const text = 'a'.repeat(7000) + 'END';
  const seen = [];
  const readLinkImpl = async (url, { maxChars }) => { seen.push(maxChars); return { url, title: 'Doc', text: text.slice(0, maxChars) + (text.length > maxChars ? '\n[… the page continues]' : '') }; };
  const reg = createToolRegistry({ tools: createAgentTools({ store: okStore(), readLinkImpl, runCode: false }) });
  const first = await reg.run(guest, 'fetch_url', { url: 'https://example.com/doc' });
  assert.equal(first.text.length, 6000);
  assert.equal(first.next_start, 6000);
  assert.match(first.note, /data, not instructions/);
  const second = await reg.run(guest, 'fetch_url', { url: 'https://example.com/doc', start: 6000 });
  assert.ok(second.text.endsWith('END'));
  assert.equal(second.next_start, undefined);
  assert.deepEqual(seen, [6000, 12000]);
});

test('fetch_url shrinks quote-heavy pages to fit the tool result limit and pages on', async () => {
  const text = '"\n'.repeat(5000);
  const readLinkImpl = async (url) => ({ url, title: 'Q', text });
  const reg = createToolRegistry({ tools: createAgentTools({ store: okStore(), readLinkImpl, runCode: false }) });
  const out = await reg.run(guest, 'fetch_url', { url: 'https://example.com/q' });
  assert.ok(out.text.length < 6000);
  assert.equal(out.next_start, out.text.length);
});

test('fetch_url reports unreadable pages, refuses non-http addresses and is rate limited', async () => {
  const readLinkImpl = async (url) => ({ url, error: 'not a public web address' });
  const reg = createToolRegistry({ tools: createAgentTools({ store: okStore(1), readLinkImpl, runCode: false }) });
  const out = await reg.run(user, 'fetch_url', { url: 'http://127.0.0.1/' });
  assert.equal(out.error, 'unreadable');
  await assert.rejects(reg.run(user, 'fetch_url', { url: 'file:///etc/passwd' }), { code: 'invalid_arguments' });
  const limited = await reg.run(user, 'fetch_url', { url: 'https://example.com/' });
  assert.equal(limited.error, 'rate_limited');
});

test('fetch_url is not offered when link reading is off', () => {
  const names = createAgentTools({ store: okStore(), links: false, runCode: false }).map((t) => t.name);
  assert.deepEqual(names, []);
});

test('web_search exists only with a search adapter and returns trimmed results', async () => {
  assert.ok(!createAgentTools({ store: okStore(), runCode: false }).some((t) => t.name === 'web_search'));
  const googleSearch = { available: true, search: async () => [
    { title: 'One', url: 'https://one.example/', snippet: 's1' },
    { title: 'Bad', url: 'javascript:alert(1)', snippet: '' }
  ] };
  const reg = createToolRegistry({ tools: createAgentTools({ store: okStore(), googleSearch, runCode: false }) });
  const out = await reg.run(guest, 'web_search', { query: 'node test runner' });
  assert.deepEqual(out.results, [{ title: 'One', url: 'https://one.example/', snippet: 's1' }]);
});

test('run_code runs in an offline, throwaway sandbox and returns the real result', async () => {
  const { factory, calls } = fakeSandbox({ exitCode: 0, stdout: '42\n' });
  const reg = createToolRegistry({ tools: createAgentTools({ store: okStore(), sandboxFactory: factory, links: false }) });
  const out = await reg.run(user, 'run_code', { language: 'python', code: 'print(6*7)' });
  assert.equal(out.ok, true);
  assert.equal(out.exit_code, 0);
  assert.equal(out.stdout, '42\n');
  assert.equal(calls.create.networkPolicy, 'deny-all');
  assert.equal(calls.create.runtime, 'python3.13');
  assert.equal(calls.create.persistent, false);
  assert.equal(calls.files[0].path, '/vercel/sandbox/main.py');
  assert.deepEqual(calls.commands[0].args, ['30', 'python3', '/vercel/sandbox/main.py']);
  assert.equal(calls.stopped, true);
});

test('run_code: failures, timeouts, guests, limits', async () => {
  const failing = fakeSandbox({ exitCode: 1, stderr: 'TypeError: x is not a function' });
  let reg = createToolRegistry({ tools: createAgentTools({ store: okStore(1), sandboxFactory: failing.factory, links: false }) });
  const out = await reg.run(user, 'run_code', { language: 'javascript', code: 'x()' });
  assert.equal(out.ok, false);
  assert.match(out.stderr, /TypeError/);
  assert.equal(failing.calls.create.runtime, 'node22');
  assert.equal(failing.calls.files[0].path, '/vercel/sandbox/main.mjs');
  assert.equal((await reg.run(user, 'run_code', { language: 'javascript', code: '1' })).error, 'rate_limited');
  await assert.rejects(reg.run(guest, 'run_code', { language: 'javascript', code: '1' }), { code: 'not_allowed' });
  await assert.rejects(reg.run(user, 'run_code', { language: 'ruby', code: '1' }), { code: 'invalid_arguments' });

  const slow = fakeSandbox({ exitCode: 124 });
  reg = createToolRegistry({ tools: createAgentTools({ store: okStore(), sandboxFactory: slow.factory, links: false }) });
  assert.match((await reg.run(user, 'run_code', { language: 'javascript', code: 'for(;;){}' })).message, /30 seconds/);

  const down = fakeSandbox({ failCreate: true });
  reg = createToolRegistry({ tools: createAgentTools({ store: okStore(), sandboxFactory: down.factory, links: false }) });
  const bad = await reg.run(user, 'run_code', { language: 'javascript', code: '1' });
  assert.equal(bad.error, 'sandbox_unavailable');
  assert.doesNotMatch(JSON.stringify(bad), /credentials/);
});

test('a failed run_code counts as a fixable check for the auto-repair loop', () => {
  assert.equal(checkOutcome('run_code', { exit_code: 1 }).fixable, true);
  assert.equal(checkOutcome('run_code', { error: 'rate_limited' }).fixable, false);
  assert.equal(checkOutcome('run_code', { exit_code: 0, ok: true }).failed, false);
});

test('globToRegExp matches file patterns like a file search', () => {
  const m = (p, path) => globToRegExp(p).test(path);
  assert.ok(m('*.test.js', 'test/a.test.js'));
  assert.ok(m('package.json', 'package.json'));
  assert.ok(m('package.json', 'apps/web/package.json'));
  assert.ok(!m('package.json', 'apps/web/package.json.bak'));
  assert.ok(m('src/**/*.ts', 'src/a/b/c.ts'));
  assert.ok(m('src/**/*.ts', 'src/c.ts'));
  assert.ok(!m('src/*.ts', 'src/a/c.ts'));
  assert.ok(m('**/route?.js', 'x/routes.js'));
  assert.ok(!m('a.js', 'xa.js'));
  assert.equal(globToRegExp('  '), null);
});

test('findFiles lists matching paths from the repository tree', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    const body = String(url).includes('/git/trees/')
      ? { tree: [{ type: 'blob', path: 'src/a.js', size: 10 }, { type: 'tree', path: 'src' }, { type: 'blob', path: 'test/a.test.js', size: 5 }] }
      : { full_name: 'o/r', default_branch: 'main' };
    return { ok: true, status: 200, json: async () => body, headers: new Map() };
  };
  const api = createGithubApi({ fetchImpl });
  const out = await api.findFiles(null, 'o/r', globToRegExp('*.js'));
  assert.deepEqual(out.files.map((f) => f.path), ['src/a.js', 'test/a.test.js']);
  assert.equal(out.ref, 'main');
  assert.match(urls.at(-1), /\/git\/trees\/main\?recursive=1$/);
});

test('agent requests offer the tools; small talk does not', () => {
  for (const s of ['run this code', 'can you test the function', 'what does this python snippet print', 'open the docs page and summarize', 'do a web search for vite 7', 'read this article link']) assert.ok(AGENT_ASK.test(s), s);
  for (const s of ['hello there', 'write me a poem about rain', 'thanks!']) assert.ok(!AGENT_ASK.test(s), s);
});

test('tool runs show a live stage the page knows', async () => {
  assert.equal(toolStageOf('run_code'), 'running');
  assert.equal(toolStageOf('github_run_command'), 'running');
  assert.equal(toolStageOf('fetch_url'), 'links');
  assert.equal(toolStageOf('web_search'), 'web');
  assert.equal(toolStageOf('github_find_files'), 'repo');
  assert.equal(toolStageOf('calculate'), null);
  const routes = await readFile(new URL('../src/routes.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const s of ['running', 'repo', 'links', 'web', 'fixing']) {
    assert.match(routes, new RegExp("const STAGES = new Set\\([^)]*'" + s + "'"), s);
    assert.match(app, new RegExp('\\b' + s + ": '"), s);
  }
});

test('web_search works without Google keys through NasrinAI\'s own web search', async () => {
  const asked = [];
  const webSearch = { search: async (q) => { asked.push(q); return { text: 'Node 24 is the current LTS.', citations: [{ title: 'Node.js', url: 'https://nodejs.org/en' }, { title: 'bad', url: 'ftp://x' }] }; } };
  const reg = createToolRegistry({ tools: createAgentTools({ store: okStore(), webSearch, runCode: false }) });
  const out = await reg.run(guest, 'web_search', { query: 'node lts version' });
  assert.equal(out.summary, 'Node 24 is the current LTS.');
  assert.deepEqual(out.results, [{ title: 'Node.js', url: 'https://nodejs.org/en', snippet: '' }]);
  assert.equal(asked[0].messages[0].content, 'node lts version');
  assert.equal(asked[0].model, undefined, 'never a paid search model');
  const empty = createToolRegistry({ tools: createAgentTools({ store: okStore(), webSearch: { search: async () => { throw new Error('down'); } }, runCode: false }) });
  assert.deepEqual((await empty.run(guest, 'web_search', { query: 'x y' })).results, []);
});
