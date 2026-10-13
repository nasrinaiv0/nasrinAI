import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createCodingRunner, parseCodingCommand, validateCodingPatch } from '../src/github/runner.js';
import { createGithubApi } from '../src/github/api.js';


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
    async writeFiles(files) { events.push(['write', ...files.map(f => f.path)]); for (const f of files) assert.ok(f.path.startsWith('/vercel/sandbox/')); },
    async updateNetworkPolicy(policy) { events.push(['network', policy.allow.length]); },
    async runCommand({ cmd, args = [], cwd }) {
      if (cwd) assert.equal(cwd, '/vercel/sandbox/repo');
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
      return tinyArchive();
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
  assert.ok(events.some(e => e[0] === 'write' && e.includes('/vercel/sandbox/repo/changes.patch')));
  assert.ok(events.some(e => e[0] === 'git' && e[1] === 'apply' && e[2] === '--check' && e[3] === '/vercel/sandbox/repo/changes.patch'));
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


function executionSandbox({runCommand, updateNetworkPolicy, stop}={}) {
  return {
    async writeFiles() {},
    async updateNetworkPolicy(policy) {
      if (updateNetworkPolicy) return updateNetworkPolicy(policy);
    },
    async runCommand({cmd,args=[],cwd}) {
      if (cwd) assert.equal(cwd,'/vercel/sandbox/repo');
      if (runCommand) return runCommand({cmd,args,cwd});
      if (cmd==='mkdir'||cmd==='tar') return {exitCode:0,stdout:async()=>'',stderr:async()=>''};
      if (cmd==='test') return {exitCode:1,stdout:async()=>'',stderr:async()=>''};
      if (cmd==='node') return {exitCode:0,stdout:async()=> 'v22.0.0',stderr:async()=>''};
      throw Error('unexpected command');
    },
    async stop() { if (stop) return stop(); }
  };
}
function executionRunner({sandboxFactory, sandbox, store={rateHit:async()=>({allowed:true})}, logger=null}) {
  return createCodingRunner({
    downloadArchive:async()=>tinyArchive(),
    defaultBranch:async()=> 'main',
    tokenFor:async()=> 'token',
    store,
    logger,
    sandboxFactory:sandboxFactory|| (async()=>sandbox)
  });
}
const signedIn={tenantId:'tenant',actor:{type:'user',id:'user'}};

test('runner reports a sanitized sandbox creation failure with its stage', async()=>{
  const runner=executionRunner({sandboxFactory:async()=>{throw new Error('failed for https://private.example/path?token=secretvalue');}});
  const out=await runner.run({repo:'owner/repo',ref:'main',command:'node --version'},signedIn);
  assert.equal(out.error,'sandbox_create_failed');
  assert.equal(out.stage,'sandbox_create');
  assert.equal(out.stage_detail.stage,'sandbox_create');
  assert.match(out.stage_detail.message,/\[url redacted\]/);
  assert.equal(JSON.stringify(out).includes('private.example'),false);
  assert.equal(JSON.stringify(out).includes('secretvalue'),false);
});

test('runner reports network restriction failures instead of masking them', async()=>{
  const sandbox=executionSandbox({updateNetworkPolicy:async policy=>{if(policy.allow.length===0)throw new Error('policy denied');}});
  const out=await executionRunner({sandbox}).run({repo:'owner/repo',ref:'main',command:'node --version'},signedIn);
  assert.equal(out.error,'sandbox_network_policy_failed');
  assert.equal(out.stage,'network_restrict');
});

test('runner reports command execution failures and still stops the sandbox', async()=>{
  let stopped=false;
  const sandbox=executionSandbox({runCommand:async({cmd,cwd})=>{
    if(cwd)assert.equal(cwd,'/vercel/sandbox/repo');
    if(cmd==='mkdir'||cmd==='tar')return {exitCode:0,stdout:async()=>'',stderr:async()=>''};
    if(cmd==='test')return {exitCode:1,stdout:async()=>'',stderr:async()=>''};
    if(cmd==='node')throw new Error('runtime process failed');
    throw Error('unexpected command');
  },stop:async()=>{stopped=true;}});
  const out=await executionRunner({sandbox}).run({repo:'owner/repo',ref:'main',command:'node --version'},signedIn);
  assert.equal(out.error,'sandbox_exec_failed');
  assert.equal(out.stage,'command_execute');
  assert.equal(stopped,true);
});

test('runner preserves dependency install failure when network restriction also fails', async()=>{
  const sandbox=executionSandbox({
    runCommand:async({cmd,args=[],cwd})=>{
      if(cwd)assert.equal(cwd,'/vercel/sandbox/repo');
      if(cmd==='mkdir'||cmd==='tar')return {exitCode:0,stdout:async()=>'',stderr:async()=>''};
      if(cmd==='test')return {exitCode:args[1]==='package.json'?0:1,stdout:async()=>'',stderr:async()=>''};
      if(cmd==='npm')return {exitCode:1,stdout:async()=>'',stderr:async()=> 'registry unavailable'};
      throw Error('unexpected command');
    },
    updateNetworkPolicy:async policy=>{if(policy.allow.length===0)throw new Error('network policy unavailable');}
  });
  const out=await executionRunner({sandbox}).run({repo:'owner/repo',ref:'main',command:'node --version'},signedIn);
  assert.equal(out.error,'dependency_install_failed');
  assert.equal(out.stage,'dependency_install');
  assert.equal(out.cleanup_error.stage,'network_restrict');
});

test('runner reports cleanup failure without masking a successful command', async()=>{
  const sandbox=executionSandbox({stop:async()=>{throw new Error('stop failed');}});
  const out=await executionRunner({sandbox}).run({repo:'owner/repo',ref:'main',command:'node --version'},signedIn);
  assert.equal(out.ok,true);
  assert.equal(out.stdout,'v22.0.0');
  assert.equal(out.cleanup_error.stage,'sandbox_cleanup');
});
