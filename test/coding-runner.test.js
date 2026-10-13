import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCodingRunner, parseCodingCommand, validateCodingPatch } from '../src/github/runner.js';
import { createGithubApi } from '../src/github/api.js';

const patch = [
  'diff --git a/src/example.js b/src/example.js',
  '--- a/src/example.js',
  '+++ b/src/example.js',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  ''
].join('\n');

test('runner rejects shell composition and remote writes', () => {
  assert.deepEqual(parseCodingCommand('npm test'), { executable: 'npm', args: ['test'], runtime: 'node22' });
  assert.deepEqual(parseCodingCommand('python -m pytest'), { executable: 'python', args: ['-m', 'pytest'], runtime: 'python3.13' });
  for (const command of ['npm test && curl evil', 'node -e "x"; echo nope', 'bash -c whoami', 'git push origin main', 'npm install']) {
    assert.throws(() => parseCodingCommand(command));
  }
});

test('patch validator allows text diffs but rejects traversal and secret paths', () => {
  assert.equal(validateCodingPatch(patch), patch);
  for (const unsafe of [
    patch.replaceAll('src/example.js', '../../outside.js'),
    patch.replaceAll('src/example.js', '.env'),
    patch.replaceAll('src/example.js', 'node_modules/pkg/index.js'),
    patch.replaceAll('src/example.js', '.git/config')
  ]) assert.throws(() => validateCodingPatch(unsafe));
  assert.throws(() => validateCodingPatch('GIT binary patch'));
});

test('archive download never forwards the GitHub bearer token to codeload', async () => {
  const calls = [], archive = Buffer.from('archive');
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith('https://api.github.com/')) {
      return new Response(null, { status: 302, headers: { location: 'https://codeload.github.com/o/r/legacy.tar.gz/refs/heads/main' } });
    }
    return new Response(archive, { status: 200 });
  };
  const api = createGithubApi({ fetchImpl });
  assert.deepEqual(await api.downloadArchive('secret', 'o/r', 'main'), archive);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret');
  assert.equal(calls[1].init.headers.Authorization, undefined);
  const bad = createGithubApi({ fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/a' } }) });
  await assert.rejects(bad.downloadArchive('secret', 'o/r', 'main'), e => e.code === 'failed');
});

test('runner applies proposed patch, returns real command output, disables network, and stops sandbox', async () => {
  const events = [];
  const sandbox = {
    async writeFiles(files) { events.push(['write', ...files.map(f => f.path)]); },
    async updateNetworkPolicy(policy) { events.push(['network', policy.allow.length]); },
    async runCommand({ cmd, args = [] }) {
      if (cmd === 'git') { events.push(['git', ...args]); return { exitCode: 0, stdout: async () => '', stderr: async () => '' }; }
      if (['test', 'npm', 'mkdir', 'tar'].includes(cmd)) return { exitCode: 0, stdout: async () => '', stderr: async () => '' };
      if (cmd === 'node') return { exitCode: 0, stdout: async () => 'passed', stderr: async () => '' };
      throw Error('unexpected command');
    },
    async stop() { events.push(['stop']); }
  };
  const runner = createCodingRunner({
    downloadArchive: async (token, repo, ref) => {
      assert.equal(token, 'token'); assert.equal(repo, 'o/r'); assert.equal(ref, 'main');
      return Buffer.from('archive');
    },
    defaultBranch: async () => 'main',
    tokenFor: async () => 'token',
    store: { rateHit: async () => ({ allowed: true }) },
    sandboxFactory: async options => {
      assert.equal(options.persistent, false); assert.equal(options.timeout, 70000);
      assert.equal(options.networkPolicy.allow.includes('registry.npmjs.org'), true);
      return sandbox;
    }
  });
  const out = await runner.run({ repo: 'o/r', command: 'node --test', patch }, { tenantId: 't', actor: { type: 'user', id: 'u' } });
  assert.equal(out.ok, true);
  assert.equal(out.exit_code, 0);
  assert.equal(out.stdout, 'passed');
  assert.equal(out.patch_applied, true);
  assert.ok(events.some(e => e[0] === 'write' && e.includes('repo/changes.patch')));
  assert.ok(events.some(e => e[0] === 'git' && e[1] === 'apply' && e[2] === '--check'));
  assert.ok(events.some(e => e[0] === 'network' && e[1] === 0));
  assert.deepEqual(events.at(-1), ['stop']);
  assert.equal((await runner.run({ repo: 'o/r', command: 'node --test' }, { tenantId: 't', actor: { type: 'guest', id: 'g' } })).error, 'sign_in_required');
});

test('runner fails closed on rate limit and source-fetch errors', async () => {
  const base = {
    tokenFor: async () => 'token',
    store: { rateHit: async () => ({ allowed: false }) },
    downloadArchive: async () => { throw Error('must not run'); },
    sandboxFactory: async () => { throw Error('must not create'); }
  };
  const ctx = { tenantId: 't', actor: { type: 'user', id: 'u' } };
  assert.equal((await createCodingRunner(base).run({ repo: 'o/r', command: 'npm test' }, ctx)).error, 'rate_limited');
  const bad = createCodingRunner({ ...base, store: { rateHit: async () => ({ allowed: true }) } });
  assert.equal((await bad.run({ repo: 'o/r', ref: 'main', command: 'npm test' }, ctx)).error, 'source_unavailable');
});
