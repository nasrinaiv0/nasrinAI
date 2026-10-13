import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createBrowserTestRunner } from '../src/github/browser-runner.js';

function tinyArchive() {
  const header = Buffer.alloc(512);
  header.write('repo-main/file.txt', 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write('00000000001\0', 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header[156] = 48;
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return gzipSync(Buffer.concat([header, Buffer.from('x'), Buffer.alloc(1535)]));
}

function setup(overrides = {}) {
  const events = [];
  const appSandbox = {
    async writeFiles(files) { events.push(['write', ...files.map(file => file.path)]); },
    async updateNetworkPolicy(policy) { events.push(['network', policy.allow]); },
    domain(port) { assert.equal(port, 3000); return 'https://preview-example.vercel.run'; },
    async stop() { events.push(['stop-app']); },
    async runCommand({ cmd, args = [], cwd }) {
      events.push(['app-run', cmd, args, cwd]);
      if (cmd === 'test') return { exitCode: 1, stdout: async () => '', stderr: async () => '' };
      if (cmd === 'npm' || cmd === 'tar' || cmd === 'mkdir' || cmd === 'node') return { exitCode: 0, stdout: async () => 'ok', stderr: async () => '' };
      throw Error('unexpected app command: ' + cmd);
    }
  };
  const browserSandbox = {
    async stop() { events.push(['stop-browser']); },
    async runCommand(cmd, args) {
      events.push(['browser-run', cmd, args]);
      return { exitCode: 0, stdout: async () => Buffer.from('fake-png').toString('base64'), stderr: async () => '' };
    }
  };
  const runner = createBrowserTestRunner({
    downloadArchive: async () => tinyArchive(),
    defaultBranch: async () => 'main',
    tokenFor: async () => 'github-token',
    store: { rateHit: async () => ({ allowed: true }) },
    createAppSandbox: async options => {
      events.push(['initial-network', options.networkPolicy.allow]);
      assert.deepEqual(options.networkPolicy, { allow: ['registry.npmjs.org'] });
      return appSandbox;
    },
    createBrowserSandbox: async options => {
      assert.ok(options.createOptions.networkPolicy.allow.includes('preview-example.vercel.run'));
      assert.ok(options.createOptions.networkPolicy.allow.includes('registry.npmjs.org'));
      return browserSandbox;
    },
    browserCommand: async (_sandbox, args) => {
      events.push(['browser', args]);
      if (args[0] === 'get') return { json: { data: { title: 'Demo app' } } };
      if (args[0] === 'snapshot') return { stdout: 'button "Save"' };
      if (args[0] === 'screenshot') return { json: { data: { path: '/tmp/page.png' } } };
      return { stdout: '' };
    },
    ...overrides
  });
  return { runner, events };
}

const user = { tenantId: 'tenant-1', actor: { type: 'user', id: 'user-1' } };
const input = { repo: 'owner/repo', test_command: 'npm test', start_command: 'npm run dev -- --host 0.0.0.0 --port 3000' };

test('browser runner rejects malformed arguments before creating sandboxes', async () => {
  let created = false;
  const { runner } = setup({ createAppSandbox: async () => { created = true; return {}; } });
  const result = await runner.run({ ...input, port: 80 }, user);
  assert.equal(result.error, 'invalid_arguments');
  assert.equal(created, false);
});

test('browser runner executes tests, opens temporary preview, and captures bounded screenshot evidence', async () => {
  const { runner, events } = setup();
  const result = await runner.run(input, user);
  assert.equal(result.ok, true);
  assert.equal(result.repo, 'owner/repo');
  assert.equal(result.ref, 'main');
  assert.equal(result.browser.title, 'Demo app');
  assert.match(result.browser.snapshot, /Save/);
  assert.equal(result.browser.screenshot.mime_type, 'image/png');
  assert.equal(Buffer.from(result.browser.screenshot.data, 'base64').toString(), 'fake-png');
  assert.ok(events.some(event => event[0] === 'initial-network' && event[1].includes('registry.npmjs.org')));
  assert.ok(events.some(event => event[0] === 'network' && event[1].length === 0));
  assert.ok(events.some(event => event[0] === 'browser' && event[1][0] === 'open'));
  assert.ok(events.some(event => event[0] === 'stop-app'));
  assert.ok(events.some(event => event[0] === 'stop-browser'));
});

test('browser runner reports failing test exit code instead of calling it success', async () => {
  const { runner } = setup({
    createAppSandbox: async () => ({
      async writeFiles() {},
      async updateNetworkPolicy() {},
      domain: () => 'https://preview-example.vercel.run',
      async stop() {},
      async runCommand({ cmd }) {
        const exitCode = cmd === 'npm' ? 1 : cmd === 'test' ? 1 : 0;
        return { exitCode, stdout: async () => 'failure output', stderr: async () => 'test failed' };
      }
    })
  });
  const result = await runner.run(input, user);
  assert.equal(result.ok, false);
  assert.equal(result.test.exit_code, 1);
  assert.match(result.message, /test command failed/);
});

test('browser runner requires a signed-in connected user', async () => {
  const { runner } = setup({ tokenFor: async () => null });
  const result = await runner.run(input, { tenantId: 'tenant-1', actor: { type: 'guest', id: 'guest-1' } });
  assert.equal(result.error, 'sign_in_required');
});
