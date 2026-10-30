import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createCodingRunner, parseCodingCommand, parseCodingCommands } from '../src/github/runner.js';
import { createToolRegistry } from '../src/tools/registry.js';
import { checkOutcome } from '../src/auto-repair.js';

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

// A fake sandbox: commands answer from `script` ("cmd arg" -> exit code / output).
function harness({ script = {}, clock = null, slow = null } = {}) {
  const log = { created: [], stopped: 0, commands: [], writes: [], downloads: 0, rate: [] };
  const runner = createCodingRunner({
    downloadArchive: async () => { log.downloads++; return tinyArchive(); },
    defaultBranch: async () => 'main', tokenFor: async () => 'token',
    store: { rateHit: async (bucket, win, limit) => { log.rate.push(limit); return { allowed: true }; } },
    runsPerHour: 99,
    ...(clock ? { now: () => clock.t } : {}),
    sandboxFactory: async (opts) => {
      log.created.push(opts);
      return {
        async writeFiles(files) { for (const f of files) log.writes.push([f.path, f.content.toString()]); },
        async updateNetworkPolicy() {},
        async runCommand({ cmd, args = [], signal }) {
          const line = [cmd, ...args].join(' ');
          if (['mkdir', 'tar', 'rm'].includes(cmd)) return { exitCode: 0, stdout: async () => '', stderr: async () => '' };
          if (cmd === 'test') return { exitCode: args[1] === 'package.json' ? 0 : 1, stdout: async () => '', stderr: async () => '' };
          if (cmd === 'npm' && (args[0] === 'ci' || args[0] === 'install')) return { exitCode: 0, stdout: async () => '', stderr: async () => '' };
          log.commands.push(line);
          if (slow && line === slow) {
            if (clock) clock.t += 60_000;
            if (signal) { await new Promise((r) => setTimeout(r, 5)); const e = new Error('aborted'); e.name = 'AbortError'; Object.defineProperty(signal, 'aborted', { value: true }); throw e; }
          }
          const s = script[line] ?? { exitCode: 0, stdout: 'ok ' + line };
          return { exitCode: s.exitCode ?? 0, stdout: async () => s.stdout || '', stderr: async () => s.stderr || '' };
        },
        async stop() { log.stopped++; }
      };
    }
  });
  return { runner, log };
}
const chatCtx = { tenantId: 't', actor: { type: 'user', id: 'u' }, conversationId: 'c1' };

test('commands: a batch is up to 10 lines, each checked like a single command, one runtime', () => {
  assert.equal(parseCodingCommands({ commands: 'ls\n\ngit log -3 --oneline\nnpm test' }).length, 3);
  assert.throws(() => parseCodingCommands({ commands: Array(11).fill('ls').join('\n') }), /between 1 and 10/);
  assert.throws(() => parseCodingCommands({ commands: 'ls\nrm -rf /' }), /not allowed/);
  assert.throws(() => parseCodingCommands({ commands: 'ls; curl x' }), /shell operators/);
  assert.throws(() => parseCodingCommands({ commands: 'npm test\npytest' }), /separate calls/);
  assert.deepEqual(parseCodingCommand('npx vitest run').args, ['--no', 'vitest', 'run'], 'npx never downloads');
  assert.throws(() => parseCodingCommand('npx -y cowsay'), /installs/);
  assert.throws(() => parseCodingCommand('pip install requests'), /list, show/);
  assert.equal(parseCodingCommand('pip list').executable, 'pip');
  for (const ok of ['head -n 5 README.md', 'wc -l src/a.js', 'diff a b', 'make test', 'git diff --stat']) assert.ok(parseCodingCommand(ok));
  assert.throws(() => parseCodingCommand('git push origin main'), /disabled/);
  assert.throws(() => parseCodingCommand('bash -c ls'), /not allowed/);
});

test('a batch runs in order, stops at the first failure, and keep_going runs the rest', async () => {
  const { runner, log } = harness({ script: { 'npm run lint': { exitCode: 1, stderr: 'lint error at a.js:3' } } });
  const out = await runner.run({ repo: 'o/r', commands: 'npm run lint\nnpm test' }, { tenantId: 't', actor: { type: 'user', id: 'u' } });
  assert.equal(out.ok, false);
  assert.equal(out.exit_code, 1);
  assert.equal(out.skipped, 1);
  assert.deepEqual(out.results.map((r) => r.command), ['npm run lint']);
  assert.match(out.results[0].stderr, /a\.js:3/);
  assert.equal(checkOutcome('github_run_command', out).fixable, true, 'a failed batch triggers the repair loop');
  assert.equal(log.rate[0], 99, 'the hourly limit is configurable');

  const all = await runner.run({ repo: 'o/r', commands: 'npm run lint\nnpm test', keep_going: true }, { tenantId: 't', actor: { type: 'user', id: 'u' } });
  assert.deepEqual(all.results.map((r) => [r.command, r.exit_code]), [['npm run lint', 1], ['npm test', 0]]);
});

test('within one reply the sandbox stays open: later runs skip download and install, then the reply closes it', async () => {
  const { runner, log } = harness();
  const first = await runner.run({ repo: 'o/r', command: 'npm test' }, chatCtx, { files: [{ path: 'src/a.js', content: 'v1' }] });
  assert.equal(first.reused_sandbox, false);
  assert.equal(log.created[0].timeout, 115_000);
  const second = await runner.run({ repo: 'o/r', commands: 'npm test\nnpm run lint' }, chatCtx, { files: [{ path: 'src/a.js', content: 'v2' }, { path: 'src/b.js', content: 'new' }] });
  assert.equal(second.reused_sandbox, true);
  assert.equal(log.created.length, 1);
  assert.equal(log.downloads, 1);
  assert.deepEqual(log.writes.filter(([p]) => p.includes('/repo/src/')).map(([p, c]) => [p.replace('/vercel/sandbox/repo/', ''), c]), [['src/a.js', 'v1'], ['src/a.js', 'v2'], ['src/b.js', 'new']], 'only changed files are written again');
  // A reverted file is restored from GitHub's version, a reverted new file removed.
  const third = await runner.run({ repo: 'o/r', command: 'npm test' }, chatCtx, { files: [], baseFor: async (p) => (p === 'src/a.js' ? 'original' : null) });
  assert.equal(third.ok, true);
  assert.ok(log.writes.some(([p, c]) => p.endsWith('/src/a.js') && c === 'original'));
  assert.equal(log.stopped, 0);
  // Another chat never shares it.
  await runner.run({ repo: 'o/r', command: 'npm test' }, { ...chatCtx, conversationId: 'c2' });
  assert.equal(log.created.length, 2);
  await runner.release(chatCtx);
  assert.equal(log.stopped, 1);
  await runner.release({ ...chatCtx, conversationId: 'c2' });
  assert.equal(log.stopped, 2);
});

test('changed dependency files and patches get a fresh sandbox', async () => {
  const { runner, log } = harness();
  await runner.run({ repo: 'o/r', command: 'npm test' }, chatCtx, { files: [] });
  await runner.run({ repo: 'o/r', command: 'npm test' }, chatCtx, { files: [{ path: 'package.json', content: '{"name":"x"}' }] });
  assert.equal(log.created.length, 2, 'new dependencies need a new install');
  assert.equal(log.stopped, 1);
  const patch = 'diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-x\n+y\n';
  const sandboxes = log.created.length;
  await runner.run({ repo: 'o/r', command: 'npm test', patch }, chatCtx, { files: [] }).catch(() => null);
  assert.equal(log.created.length, sandboxes + 1);
  await runner.release(chatCtx);
});

test('a batch stops before the reply runs out of time and says so', async () => {
  const clock = { t: 1_000_000 };
  const { runner } = harness({ clock, slow: 'npm test' });
  const out = await runner.run({ repo: 'o/r', commands: 'ls\nnpm test\nnpm run build' }, { ...chatCtx, deadline: clock.t + 30_000 });
  assert.equal(out.error, 'out_of_time');
  assert.deepEqual(out.results.map((r) => r.command), ['ls', 'npm test']);
  assert.equal(out.results[1].exit_code, 124);
  assert.match(out.message, /ran out of time/);
});

test('the registry passes the deadline to the tool and ends its time limit by then', async () => {
  let seen = null;
  let clock = 1000;
  const reg = createToolRegistry({ now: () => clock, tools: [{
    name: 'slow_tool', description: 'x', risk: 'read', who: ['user'], timeoutMs: 80_000, longRunning: true, deadlineAware: true,
    parameters: { properties: {}, required: [] },
    async run(args, ctx) { seen = ctx; return { ok: true }; }
  }] });
  assert.equal(reg.get('slow_tool').deadlineAware, true);
  await reg.run({ tenantId: 't', actor: { type: 'user', id: 'u' } }, 'slow_tool', {}, { deadline: 50_000, conversationId: 'c' });
  assert.equal(seen.deadline, 50_000);
  assert.equal(seen.conversationId, 'c');
});

test('chat: the coding runner may start with a short slice of time left, and gets the reply deadline', async () => {
  const { createFakeProvider } = await import('../src/ai/fake.js');
  const { buildTestApp, serve, bearer, postJson, USER_TOKEN } = await import('./helpers.js');
  const { TURN_TIME_LIMIT_MS } = await import('../src/chat.js');
  const clock = { t: 5_000_000 };
  const seen = [];
  const tool = {
    name: 'github_run_command', description: 'Run commands in the repository sandbox.', risk: 'read', who: ['user'], timeoutMs: 85_000, longRunning: true, deadlineAware: true,
    parameters: { properties: { repo: { type: 'string' }, commands: { type: 'string' } }, required: ['repo'] },
    async run(args, ctx) { seen.push(ctx.deadline - clock.t); clock.t += 40_000; return { ok: true, exit_code: 0, results: [] }; }
  };
  const provider = createFakeProvider({ reply: (req) => (req.tools?.length ? { toolCalls: [{ id: 'r' + seen.length, name: 'github_run_command', arguments: '{"repo":"o/r","commands":"ls\\nnpm test"}' }] } : 'Ran the checks.') });
  const built = buildTestApp({ provider, env: { ROUTING: 'smart', OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30) }, extraTools: [tool], chatNow: () => clock.t });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'check my repo o/r', coding: true }, bearer(USER_TOKEN))).json();
    assert.match(r.message.content, /Ran the checks/);
    assert.equal(seen[0], TURN_TIME_LIMIT_MS, 'the deadline is the reply limit');
    assert.equal(seen.length, 3, 'runs at 0 s, 40 s and 80 s fit; a fixed 85 s reservation would have allowed only one');
  } finally { await srv.close(); }
});
