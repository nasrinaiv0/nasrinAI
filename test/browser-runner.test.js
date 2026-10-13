import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { createBrowserTestRunner } from '../src/github/browser-runner.js';
import { createToolRegistry } from '../src/tools/registry.js';

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

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(300, 2)]);

function setup(overrides = {}, { recordFails = false } = {}) {
  const events = [];
  const saved = { images: [], videos: [] };
  const appSandbox = {
    async writeFiles(files) { events.push(['write', ...files.map((file) => file.path)]); },
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
      const file = args[2];
      const bytes = file.endsWith('.jpg') ? JPEG : WEBM;
      return { exitCode: 0, stdout: async () => bytes.toString('base64') + '\n', stderr: async () => '' };
    }
  };
  const store = {
    rateHit: async () => ({ allowed: true }),
    addImage: async (row) => { saved.images.push(row); return '11111111-1111-4111-8111-111111111111'; },
    addVideo: async (row) => { saved.videos.push(row); return '22222222-2222-4222-8222-222222222222'; }
  };
  const runner = createBrowserTestRunner({
    downloadArchive: async () => tinyArchive(),
    defaultBranch: async () => 'main',
    tokenFor: async () => 'github-token',
    store,
    createAppSandbox: async (options) => {
      events.push(['initial-network', options.networkPolicy.allow]);
      assert.deepEqual(options.networkPolicy, { allow: ['registry.npmjs.org'] });
      return appSandbox;
    },
    createBrowserSandbox: async (options) => {
      assert.deepEqual(options.createOptions.networkPolicy.allow, ['preview-example.vercel.run'], 'the browser may reach only the preview');
      return browserSandbox;
    },
    browserCommand: async (_sandbox, args) => {
      events.push(['browser', args]);
      if (args[0] === 'record' && recordFails) throw Error('ffmpeg not found');
      if (args[0] === 'get') return { json: { data: { title: 'Demo app' } } };
      if (args[0] === 'snapshot') return { stdout: 'button "Save"' };
      return { stdout: '' };
    },
    ...overrides
  });
  return { runner, events, saved };
}

const user = { tenantId: 'tenant-1', actor: { type: 'user', id: 'user-1' }, conversationId: '33333333-3333-4333-8333-333333333333' };
const input = { repo: 'owner/repo', test_command: 'npm test', start_command: 'npm run dev -- --host 0.0.0.0 --port 3000' };

test('browser runner rejects malformed arguments before creating sandboxes', async () => {
  let created = false;
  const { runner } = setup({ createAppSandbox: async () => { created = true; return {}; } });
  const result = await runner.run({ ...input, port: 80 }, user);
  assert.equal(result.error, 'invalid_arguments');
  assert.equal(created, false);
});

test('without a prepared browser snapshot it refuses at once and runs nothing', async () => {
  const runner = createBrowserTestRunner({ downloadArchive: async () => { throw Error('should not download'); }, defaultBranch: async () => 'main', tokenFor: async () => 'x', store: { rateHit: async () => ({ allowed: true }) } });
  const result = await runner.run(input, user);
  assert.equal(result.error, 'browser_not_set_up');
});

test('renders, tests, records and screenshots; saves both for the person in this chat', async () => {
  const { runner, events, saved } = setup();
  const result = await runner.run({ ...input, viewport: 'phone' }, user);
  assert.equal(result.ok, true);
  assert.equal(result.browser.title, 'Demo app');
  assert.match(result.browser.snapshot, /Save/);
  assert.deepEqual(result.media, [{ type: 'image', id: '11111111-1111-4111-8111-111111111111' }, { type: 'video', id: '22222222-2222-4222-8222-222222222222' }]);
  assert.ok(JSON.stringify(result).length < 8192, 'only small text goes back to the model');
  assert.deepEqual([saved.images[0].mime, saved.images[0].conversationId, saved.images[0].ownerId], ['image/jpeg', user.conversationId, 'user-1']);
  assert.deepEqual(saved.images[0].bytes, JPEG);
  assert.deepEqual([saved.videos[0].mime, saved.videos[0].status, saved.videos[0].provider], ['video/webm', 'completed', 'browser']);
  assert.ok(events.some((e) => e[0] === 'browser' && e[1].join(' ') === 'set viewport 390 844'));
  assert.ok(events.some((e) => e[0] === 'browser' && e[1][0] === 'record' && e[1][1] === 'start'));
  assert.ok(events.some((e) => e[0] === 'network' && e[1].length === 0), 'network closed before tests');
  assert.ok(events.some((e) => e[0] === 'stop-app') && events.some((e) => e[0] === 'stop-browser'));
});

test('a recording that cannot be made is skipped; the screenshot still comes', async () => {
  const { runner, saved } = setup({}, { recordFails: true });
  const result = await runner.run(input, user);
  assert.equal(result.ok, true);
  assert.deepEqual(result.media.map((m) => m.type), ['image']);
  assert.equal(saved.videos.length, 0);
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
  const result = await runner.run({ ...input, record_video: false }, user);
  assert.equal(result.ok, false);
  assert.equal(result.test.exit_code, 1);
  assert.match(result.message, /test command failed/);
});

test('browser runner requires a signed-in connected user', async () => {
  const { runner } = setup({ tokenFor: async () => null });
  const result = await runner.run(input, { tenantId: 'tenant-1', actor: { type: 'guest', id: 'guest-1' } });
  assert.equal(result.error, 'sign_in_required');
});

test('only tools marked media may put pictures and videos under the reply; the chat context comes from the server', async () => {
  let seen;
  const reg = createToolRegistry({ tools: [
    { name: 'shows', risk: 'read', who: ['user'], media: true, parameters: { properties: {} }, run: async (_a, ctx) => { seen = ctx; return { media: [{ type: 'image', id: '11111111-1111-4111-8111-111111111111' }, { type: 'script', id: 'x' }] }; } },
    { name: 'plain', risk: 'read', who: ['user'], parameters: { properties: {} }, run: async () => ({ media: [{ type: 'image', id: '11111111-1111-4111-8111-111111111111' }] }) }
  ] });
  const caller = { tenantId: 't', actor: { type: 'user', id: 'u' } };
  await assert.rejects(reg.run(caller, 'shows', '{"conversationId":"evil"}', { conversationId: 'conv-1' }), /not expected|unknown|not allowed|invalid/i, 'the model cannot pass a chat id');
  const out = await reg.run(caller, 'shows', '{}', { conversationId: 'conv-1' });
  assert.equal(seen.conversationId, 'conv-1');
  assert.deepEqual(reg.mediaOf('shows', out), [{ type: 'image', id: '11111111-1111-4111-8111-111111111111' }]);
  assert.deepEqual(reg.mediaOf('plain', await reg.run(caller, 'plain', '{}')), []);
  const chat = await readFile(new URL('../src/chat.js', import.meta.url), 'utf8');
  assert.match(chat, /reg\.run\(caller, c\.name, c\.arguments, \{ conversationId: conv\.id \}\)/);
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /fetch\('\/v1\/recordings\/' \+ encodeURIComponent\(videoId\)/);
});
