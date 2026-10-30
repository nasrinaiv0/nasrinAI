import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createCodeWorkspace, parseFileBlocks } from '../src/github/workspace.js';
import { createCodingRunner } from '../src/github/runner.js';
import { createGithubApi } from '../src/github/api.js';
import { createFakeProvider } from '../src/ai/fake.js';
import { TURN_TIME_LIMIT_MS } from '../src/chat.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

const REPO = {
  'src/sum.js': 'export function sum(a, b) {\n  return a - b;\n}\n',
  'src/util.js': 'const x = 1;\nconst y = 1;\n'
};
const ws = (files = REPO) => {
  const fetched = [];
  const w = createCodeWorkspace({
    fetchFile: async (token, repo, path, ref) => { fetched.push(`${repo}@${ref}:${path}`); return files[path] ?? null; },
    defaultBranch: async () => 'main'
  });
  return { w, fetched };
};
const ctx = { tenantId: 't', actor: { type: 'user', id: 'u' }, conversationId: 'c1' };
const applyLikePr = (base, edits) => edits.reduce((out, e) => {
  assert.equal(out.split(e.search).length, 2, 'each part matches exactly one place, as the pull request requires');
  return out.replace(e.search, () => e.replace);
}, base);

test('edits are exact, unique and readable back; nothing else changes', async () => {
  const { w, fetched } = ws();
  w.begin(ctx, []);
  const out = await w.edit(ctx, null, { repo: 'o/r', path: 'src/sum.js', old_string: 'return a - b;', new_string: 'return a + b;' });
  assert.equal(out.path, 'src/sum.js');
  assert.match(await w.read(ctx, null, 'o/r', 'src/sum.js'), /return a \+ b;/);
  assert.equal(await w.read(ctx, null, 'o/r', 'src/util.js'), null, 'untouched files come from GitHub');
  await assert.rejects(w.edit(ctx, null, { repo: 'o/r', path: 'src/sum.js', old_string: 'nope', new_string: 'x' }), /not found/);
  await assert.rejects(w.edit(ctx, null, { repo: 'o/r', path: 'src/util.js', old_string: ' = 1;', new_string: ' = 2;' }), /more than one place/);
  await assert.rejects(w.edit(ctx, null, { repo: 'o/r', path: 'missing.js', old_string: 'a', new_string: 'b' }), /does not exist/);
  await assert.rejects(w.edit(ctx, null, { repo: 'o/r', path: '../etc/passwd', old_string: 'a', new_string: 'b' }), /not allowed/);
  await assert.rejects(w.edit(ctx, null, { repo: 'other/repo', path: 'a.js', old_string: 'a', new_string: 'b' }), /holds changes for o\/r/);
  assert.ok(fetched.every((f) => f.startsWith('o/r@main:')));
  const status = await w.status(ctx, null, { repo: 'o/r' });
  assert.deepEqual(status.files.map((f) => [f.path, f.status, f.edits]), [['src/sum.js', 'changed', 1]]);
});

test('finish attaches SEARCH/REPLACE parts that apply to the base like a pull request, and replaces the model\'s own blocks', async () => {
  const { w } = ws();
  w.begin(ctx, []);
  await w.edit(ctx, null, { repo: 'o/r', path: 'src/sum.js', old_string: 'return a - b;', new_string: 'return a + b;' });
  await w.edit(ctx, null, { repo: 'o/r', path: 'src/sum.js', old_string: 'export function sum', new_string: '// Adds two numbers.\nexport function sum' });
  await w.edit(ctx, null, { repo: 'o/r', path: 'src/util.js', old_string: ' = 1;', new_string: ' = 2;', replace_all: true });
  await w.write(ctx, null, { repo: 'o/r', path: 'test/sum.test.js', content: 'import "./x";\n' });
  const { text, meta } = w.finish(ctx, 'Fixed it.\n\n[[file name="src/sum.js"]]\nwrong guess\n[[/file]]');
  assert.deepEqual(meta, { repo: 'o/r', ref: 'main', files: 3 });
  assert.ok(text.startsWith('Fixed it.'));
  assert.doesNotMatch(text, /wrong guess/);
  const blocks = parseFileBlocks(text);
  const byPath = Object.fromEntries(blocks.map((b) => [b.path, b]));
  assert.equal(applyLikePr(REPO['src/sum.js'], byPath['src/sum.js'].edits), '// Adds two numbers.\nexport function sum(a, b) {\n  return a + b;\n}\n');
  assert.equal(byPath['src/util.js'].content, 'const x = 2;\nconst y = 2;\n', 'replace_all becomes a whole file');
  assert.equal(byPath['test/sum.test.js'].content, 'import "./x";\n');
  assert.equal(w._size(), 0, 'turn state is cleared');
  assert.deepEqual(w.finish(ctx, 'plain'), { text: 'plain', meta: null });
});

test('the next turn picks up the changes from the last reply that carried them; stale ones are dropped with a note', async () => {
  const first = ws();
  first.w.begin(ctx, []);
  await first.w.edit(ctx, null, { repo: 'o/r', path: 'src/sum.js', old_string: 'return a - b;', new_string: 'return a + b;' });
  const done = first.w.finish(ctx, 'Done.');
  const history = [{ role: 'user', content: 'fix sum' }, { role: 'assistant', content: done.text, responseMetadata: { code_workspace: done.meta } }];

  const { w } = ws();
  w.begin(ctx, history);
  const files = await w.files(ctx, null, 'o/r');
  assert.deepEqual(files, [{ path: 'src/sum.js', content: 'export function sum(a, b) {\n  return a + b;\n}\n' }]);
  await w.edit(ctx, null, { repo: 'o/r', path: 'src/util.js', old_string: 'const y = 1;', new_string: 'const y = 3;' });
  const next = w.finish(ctx, 'More.');
  assert.deepEqual(parseFileBlocks(next.text).map((b) => b.path).sort(), ['src/sum.js', 'src/util.js'], 'the latest reply holds the whole change set');

  const merged = ws({ ...REPO, 'src/sum.js': 'export function sum(a, b) {\n  return a + b;\n}\n' });
  merged.w.begin(ctx, history);
  const status = await merged.w.status(ctx, null, { repo: 'o/r' });
  assert.equal(status.files.length, 0);
  assert.match(status.notes[0], /no longer apply/);
});

test('untouched turns attach nothing, and replies without workspace metadata are never seeded', async () => {
  const { w } = ws();
  w.begin(ctx, [{ role: 'assistant', content: '[[file name="src/sum.js"]]\nanything\n[[/file]]' }]);
  assert.deepEqual(await w.files(ctx, null, 'o/r'), []);
  assert.equal(w.finish(ctx, 'Hi').meta, null);
});

function tinyArchive() {
  const header = Buffer.alloc(512);
  header.write('repo-main/file.txt', 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii'); header.write('0000000\0', 108, 8, 'ascii'); header.write('0000000\0', 116, 8, 'ascii');
  header.write('00000000001\0', 124, 12, 'ascii'); header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156); header[156] = 48;
  header.write('ustar\0', 257, 6, 'ascii'); header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return gzipSync(Buffer.concat([header, Buffer.from('x'), Buffer.alloc(1535)]));
}
const runnerWith = (events) => createCodingRunner({
  downloadArchive: async () => tinyArchive(), defaultBranch: async () => 'main', tokenFor: async () => 'token',
  store: { rateHit: async () => ({ allowed: true }) },
  sandboxFactory: async () => ({
    async writeFiles(files) { for (const f of files) events.push(['write', f.path, f.content.toString()]); },
    async updateNetworkPolicy() {},
    async runCommand({ cmd, args = [] }) {
      events.push([cmd, ...args]);
      if (cmd === 'test') return { exitCode: 1, stdout: async () => '', stderr: async () => '' };
      return { exitCode: 0, stdout: async () => 'ok', stderr: async () => '' };
    },
    async stop() {}
  })
});

test('the runner writes workspace files into the repository before the command, and refuses unsafe paths', async () => {
  const events = [];
  const user = { tenantId: 't', actor: { type: 'user', id: 'u' } };
  const out = await runnerWith(events).run({ repo: 'o/r', command: 'node --test' }, user, { files: [{ path: 'src/a/b.js', content: 'x=1' }] });
  assert.equal(out.ok, true);
  assert.equal(out.workspace_files, 1);
  const mk = events.findIndex((e) => e[0] === 'mkdir' && e.includes('/vercel/sandbox/repo/src/a'));
  const write = events.findIndex((e) => e[0] === 'write' && e[1] === '/vercel/sandbox/repo/src/a/b.js' && e[2] === 'x=1');
  const cmd = events.findIndex((e) => e[0] === 'node');
  assert.ok(mk >= 0 && write > mk && cmd > write);
  for (const path of ['.env', 'node_modules/x.js', '.git/config', '../x', '/abs']) {
    const r = await runnerWith([]).run({ repo: 'o/r', command: 'node --test' }, user, { files: [{ path, content: 'x' }] });
    assert.equal(r.error, 'invalid_workspace', path);
  }
});

test('api.fileAt reads whole files for the workspace (null when missing)', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('missing')) return { ok: false, status: 404, json: async () => ({}), headers: new Map() };
    return { ok: true, status: 200, json: async () => ({ type: 'file', encoding: 'base64', content: Buffer.from('hello\n').toString('base64') }), headers: new Map() };
  };
  const api = createGithubApi({ fetchImpl });
  assert.equal(await api.fileAt(null, 'o/r', 'a.txt', 'main'), 'hello\n');
  assert.equal(await api.fileAt(null, 'o/r', 'missing.txt', 'main'), null);
});

// Chat: the model edits, tests with its edits, and the reply carries them.
const ENV = { ROUTING: 'smart', OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30) };
function chatTools(w, seenFiles, clock = null) {
  return [
    { name: 'code_edit', description: 'Edit a file.', risk: 'read', who: ['user'], maxArgs: 20000,
      parameters: { properties: { repo: { type: 'string' }, path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['repo', 'path', 'old_string', 'new_string'] },
      run: (a, c) => w.edit(c, null, a) },
    { name: 'github_run_command', description: 'Run tests in the repository sandbox.', risk: 'read', who: ['user'], timeoutMs: 80_000, longRunning: true,
      parameters: { properties: { repo: { type: 'string' }, command: { type: 'string' } }, required: ['repo', 'command'] },
      async run(a, c) { if (clock) clock.t += 30_000; const files = await w.files(c, null, a.repo); seenFiles.push(files); return { exit_code: files.some((f) => /a \+ b/.test(f.content)) ? 0 : 1, stdout: 'done' }; } }
  ];
}

test('coding chat: edits are tested and attached to the reply, then carried into the next message', async () => {
  const { w } = ws();
  const seenFiles = [];
  let turn = 0;
  const provider = createFakeProvider({ reply: (req) => {
    const last = req.messages.at(-1);
    if (last.role === 'user' && /fix/.test(last.content)) { turn = 1; return { toolCalls: [{ id: 'e1', name: 'code_edit', arguments: JSON.stringify({ repo: 'o/r', path: 'src/sum.js', old_string: 'return a - b;', new_string: 'return a + b;' }) }] }; }
    if (last.role === 'user' && /again/.test(last.content)) { turn = 2; return { toolCalls: [{ id: 'r2', name: 'github_run_command', arguments: '{"repo":"o/r","command":"npm test"}' }] }; }
    if (last.role === 'tool' && /src\/sum\.js/.test(last.content) && turn === 1) return { toolCalls: [{ id: 'r1', name: 'github_run_command', arguments: '{"repo":"o/r","command":"npm test"}' }] };
    return 'Fixed sum; npm test passes.';
  } });
  const built = buildTestApp({ provider, env: ENV, extraTools: chatTools(w, seenFiles), codeWorkspace: w });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'fix the sum bug in o/r', coding: true }, bearer(USER_TOKEN))).json();
    assert.match(r.message.content, /Fixed sum/);
    assert.match(r.message.content, /\[\[file name="src\/sum\.js"\]\]\n<<<<<<< SEARCH\nreturn a - b;\n=======\nreturn a \+ b;\n>>>>>>> REPLACE\n\[\[\/file\]\]/);
    assert.deepEqual(r.response_metadata.code_workspace, { repo: 'o/r', ref: 'main', files: 1 });
    assert.match(seenFiles[0][0].content, /a \+ b/, 'the test run used the edited file');

    const r2 = await (await postJson(srv.url + '/v1/chat', { message: 'run the tests again in o/r', coding: true, conversation_id: r.conversation_id }, bearer(USER_TOKEN))).json();
    assert.match(seenFiles[1][0].content, /a \+ b/, 'the next message still has the edit');
    assert.equal(r2.response_metadata.code_workspace, undefined, 'nothing new to attach');
  } finally { await srv.close(); }
});

test('time guard: a long tool that cannot finish in time is not started, and the model answers', async () => {
  const { w } = ws();
  const seenFiles = [];
  const clock = { t: 1_000_000 };
  let calls = 0;
  const provider = createFakeProvider({ reply: (req) => {
    calls++;
    const last = req.messages.at(-1);
    if (req.tools?.length) return { toolCalls: [{ id: 'r' + calls, name: 'github_run_command', arguments: '{"repo":"o/r","command":"npm test"}' }] };
    return /out_of_time/.test(JSON.stringify(req.messages)) ? 'Stopped: out of time; say continue.' : 'Answered.';
  } });
  const built = buildTestApp({ provider, env: ENV, extraTools: chatTools(w, seenFiles, clock), codeWorkspace: w, chatNow: () => clock.t });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'run the tests in o/r', coding: true }, bearer(USER_TOKEN))).json();
    assert.ok(seenFiles.length * 30_000 + 80_000 <= TURN_TIME_LIMIT_MS + 30_000, 'runs stop before the limit');
    assert.ok(seenFiles.length >= 1 && seenFiles.length < 12);
    assert.equal(seenFiles.length, 2, 'two 30-second runs fit; the third would not');
    assert.equal(calls, 4, 'after a skipped run the model answers instead of retrying');
    assert.match(r.message.content, /out of time/);
  } finally { await srv.close(); }
});

test('large change sets never get cut: blocks that do not fit are left out and named', async () => {
  const { w } = ws({ 'big.txt': 'x\n' });
  w.begin(ctx, []);
  await w.write(ctx, null, { repo: 'o/r', path: 'a.txt', content: 'a'.repeat(9500) });
  await w.write(ctx, null, { repo: 'o/r', path: 'b.txt', content: 'b'.repeat(9500) });
  await w.write(ctx, null, { repo: 'o/r', path: 'c.txt', content: 'c' });
  const { text, meta } = w.finish(ctx, 'Done.', { maxChars: 18_500 });
  assert.ok(text.length <= 18_500);
  assert.deepEqual(parseFileBlocks(text).map((b) => b.path), ['a.txt', 'c.txt']);
  assert.match(text, /Not attached \(too large for one reply\): b\.txt/);
  assert.equal(meta.files, 2);
});
