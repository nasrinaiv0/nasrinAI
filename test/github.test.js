import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createGithub } from '../src/github/index.js';
import { createGithubApi, checkRepo, checkPath, checkRef, GithubError } from '../src/github/api.js';
import { createToolRegistry } from '../src/tools/registry.js';
import { PLATFORM_TENANT_ID } from '../src/tenants.js';
import { buildTestApp, serve, bearer, testConfig, USER_TOKEN } from './helpers.js';

const KEY_HEX = randomBytes(32).toString('hex');
const ENV = { CONNECTOR_SECRET_KEY: KEY_HEX, GITHUB_APP_CLIENT_ID: 'Iv23liABCDEF123456', GITHUB_APP_CLIENT_SECRET: 's'.repeat(40), GITHUB_APP_SLUG: 'nasrinai', SITE_URL: 'https://nasrinai.example' };
const b64 = (s) => Buffer.from(s).toString('base64');

// A tiny GitHub stand-in: route table of "METHOD path" -> (init) => [status, json].
function fakeGithub(table) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || 'GET'} ${u.host === 'api.github.com' ? u.pathname : u.host + u.pathname}`;
    calls.push({ key, url, init });
    const h = table[key];
    if (!h) return Response.json({ message: 'Not Found' }, { status: 404 });
    const [status, body, headers] = await h(init, u);
    return Response.json(body, { status, headers });
  };
  return { fetchImpl, calls };
}

test('github: repository, path and branch inputs are checked', () => {
  assert.equal(checkRepo('https://github.com/primusco20/nasrinAI.git'), 'primusco20/nasrinAI');
  assert.throws(() => checkRepo('../etc/passwd'), GithubError);
  assert.throws(() => checkRepo('a/b/c'), GithubError);
  assert.equal(checkPath('./src/app.js'), 'src/app.js');
  for (const bad of ['../x', 'a/../b', '.git/config', 'a//b', 'a\\b', '']) assert.throws(() => checkPath(bad), GithubError, bad);
  assert.equal(checkPath('', { allowEmpty: true }), '');
  assert.equal(checkRef('feature/x'), 'feature/x');
  for (const bad of ['a..b', '/main', 'a b', 'x.lock']) assert.throws(() => checkRef(bad), GithubError, bad);
});

test('github: files are read as text in parts; binary files and folders are refused', async () => {
  const text = Array.from({ length: 50 }, (_, i) => `line ${i + 1} ${'x'.repeat(40)}`).join('\n');
  const { fetchImpl, calls } = fakeGithub({
    'GET /repos/o/r/contents/src/a.js': () => [200, { type: 'file', encoding: 'base64', size: text.length, content: b64(text) }],
    'GET /repos/o/r/contents/bin': () => [200, { type: 'file', encoding: 'base64', size: 3, content: b64('a\0b') }],
    'GET /repos/o/r/contents/src': () => [200, [{ name: 'a.js', type: 'file', size: 9 }, { name: 'lib', type: 'dir' }]]
  });
  const api = createGithubApi({ fetchImpl });
  const first = await api.readFile(null, 'o/r', 'src/a.js', { budget: 500 });
  assert.equal(first.from_line, 1);
  assert.ok(first.text.startsWith('line 1 '));
  assert.ok(first.next_line > 1);
  const next = await api.readFile(null, 'o/r', 'src/a.js', { startLine: first.next_line, budget: 100_000 });
  assert.ok(next.text.endsWith('line 50 ' + 'x'.repeat(40)));
  assert.equal(next.next_line, undefined);
  await assert.rejects(api.readFile(null, 'o/r', 'bin'), /not text/);
  await assert.rejects(api.readFile(null, 'o/r', 'src'), /folder/);
  const list = await api.listFiles('tok', 'o/r', { path: 'src' });
  assert.deepEqual(list.entries.map((e) => e.name), ['a.js', 'lib']);
  assert.equal(calls[0].init.headers.Authorization, undefined, 'no token: no Authorization header');
  assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer tok');
  assert.equal(calls.at(-1).init.redirect, 'error');
});

test('github: a pull request goes on a new branch; the base branch is never changed', async () => {
  const { fetchImpl, calls } = fakeGithub({
    'GET /repos/o/r': () => [200, { full_name: 'o/r', default_branch: 'main', permissions: { push: true } }],
    'GET /repos/o/r/git/ref/heads/main': () => [200, { object: { sha: 'base1' } }],
    'GET /repos/o/r/git/commits/base1': () => [200, { tree: { sha: 'tree1' } }],
    'POST /repos/o/r/git/trees': () => [201, { sha: 'tree2' }],
    'POST /repos/o/r/git/commits': () => [201, { sha: 'commit2' }],
    'POST /repos/o/r/git/refs': () => [201, {}],
    'POST /repos/o/r/pulls': () => [201, { number: 7, html_url: 'https://github.com/o/r/pull/7' }]
  });
  const api = createGithubApi({ fetchImpl });
  const pr = await api.createPullRequest('tok', { repo: 'o/r', title: 'Add hello page', files: [{ path: 'web/index.html', content: '<h1>Hi</h1>\n' }], now: 1_700_000_000_000 });
  assert.equal(pr.number, 7);
  assert.equal(pr.base, 'main');
  assert.match(pr.branch, /^nasrin\/add-hello-page-[a-z0-9]+$/);
  const ref = calls.find((c) => c.key === 'POST /repos/o/r/git/refs');
  assert.deepEqual(JSON.parse(ref.init.body), { ref: `refs/heads/${pr.branch}`, sha: 'commit2' });
  const tree = JSON.parse(calls.find((c) => c.key === 'POST /repos/o/r/git/trees').init.body);
  assert.equal(tree.base_tree, 'tree1');
  assert.deepEqual(tree.tree, [{ path: 'web/index.html', mode: '100644', type: 'blob', content: '<h1>Hi</h1>\n' }]);
  assert.ok(calls.every((c) => !['PATCH', 'PUT', 'DELETE'].includes(c.init.method || 'GET')), 'no ref is updated or deleted');

  const noPush = createGithubApi({ fetchImpl: fakeGithub({ 'GET /repos/o/r': () => [200, { full_name: 'o/r', default_branch: 'main', permissions: { push: false } }] }).fetchImpl });
  await assert.rejects(noPush.createPullRequest('tok', { repo: 'o/r', title: 'x', files: [{ path: 'a', content: 'b' }] }), (e) => e.code === 'no_push_access');
  await assert.rejects(api.createPullRequest('tok', { repo: 'o/r', title: 'x', files: [{ path: '.git/hooks/pre-commit', content: 'b' }] }), (e) => e.code === 'invalid');
  await assert.rejects(api.createPullRequest('tok', { repo: 'o/r', title: 'x', files: Array.from({ length: 21 }, (_, i) => ({ path: `f${i}`, content: '' })) }), (e) => e.code === 'invalid');
});

test('settings: GitHub is on only with a client id, secret and connector key', () => {
  assert.equal(testConfig({}).github, null);
  assert.equal(testConfig({ ...ENV, CONNECTOR_SECRET_KEY: '' }).github, null);
  const on = testConfig(ENV).github;
  assert.equal(on.clientId, ENV.GITHUB_APP_CLIENT_ID);
  assert.equal(on.slug, 'nasrinai');
  assert.equal(testConfig({ ...ENV, GITHUB_APP_SLUG: 'https://github.com/apps/NasrinAI-Code/' }).github.slug, 'nasrinai-code', 'whole link or capitals are fine');
  assert.equal(testConfig({ ...ENV, GITHUB_APP_CLIENT_ID: '"Iv23liABCDEF123456"' }).github.clientId, 'Iv23liABCDEF123456', 'quotes are dropped');
  assert.equal(testConfig({}).githubOff, 'not_set');
  assert.equal(testConfig({ ...ENV, CONNECTOR_SECRET_KEY: '' }).githubOff, 'connector_key');
  assert.equal(testConfig({ ...ENV, GITHUB_APP_CLIENT_SECRET: 'short' }).githubOff, 'client_secret');
  assert.equal(testConfig(ENV).githubOff, null);
});

async function ghApp(table = {}) {
  const gh = fakeGithub({
    'POST github.com/login/oauth/access_token': (init) => {
      const p = new URLSearchParams(init.body);
      if (p.get('grant_type') === 'refresh_token') return [200, { access_token: 'ghu_new', expires_in: 28800, refresh_token: 'ghr_new', refresh_token_expires_in: 15897600 }];
      return p.get('code') === 'good' ? [200, { access_token: 'ghu_first', expires_in: 28800, refresh_token: 'ghr_first', refresh_token_expires_in: 15897600 }] : [200, { error: 'bad_verification_code' }];
    },
    'GET /user': () => [200, { login: 'octo-cat' }],
    'DELETE /applications/Iv23liABCDEF123456/grant': () => [204, {}],
    ...table
  });
  let clock = Date.parse('2026-10-12T00:00:00Z');
  const now = () => clock;
  const built = buildTestApp({ env: ENV });
  const github = createGithub({ config: built.config, store: built.store, fetchImpl: gh.fetchImpl, now });
  const app = buildTestApp({ env: ENV, store: built.store, extraRoutes: github.routes });
  const srv = await serve(app.app);
  return { ...srv, github, store: built.store, gh, tick: (ms) => { clock += ms; } };
}

test('github: connecting needs sign-in, a signed state and this browser\'s one-time cookie', async () => {
  const t = await ghApp();
  try {
    const guest = await fetch(t.url + '/v1/github/status');
    assert.equal(guest.status, 401);
    const st = await (await fetch(t.url + '/v1/github/status', { headers: bearer(USER_TOKEN) })).json();
    assert.deepEqual(st, { available: true, connected: false, login: null, accounts: [], max_accounts: 10, install_url: 'https://github.com/apps/nasrinai/installations/new' });

    const start = await fetch(t.url + '/v1/github/connect', { method: 'POST', headers: bearer(USER_TOKEN) });
    const { url } = await start.json();
    const cookie = start.headers.get('set-cookie').split(';')[0];
    assert.match(start.headers.get('set-cookie'), /HttpOnly; Secure/);
    const q = new URL(url).searchParams;
    assert.equal(new URL(url).origin + new URL(url).pathname, 'https://github.com/login/oauth/authorize');
    assert.equal(q.get('redirect_uri'), 'https://nasrinai.example/v1/github/callback');
    const state = q.get('state');

    const cb = (qs, c) => fetch(t.url + '/v1/github/callback?' + qs, { redirect: 'manual', headers: c ? { cookie: c } : {} });
    assert.equal((await cb(`code=good&state=${state}`)).headers.get('location'), '/?github=failed', 'no cookie');
    assert.equal((await cb(`code=good&state=${state}`, 'nasrin_gh=other')).headers.get('location'), '/?github=failed', 'wrong cookie');
    assert.equal((await cb(`code=good&state=${state.slice(0, -2)}xx`, cookie)).headers.get('location'), '/?github=failed', 'forged state');
    assert.equal((await cb('setup_action=install&installation_id=1')).headers.get('location'), '/?github=installed');
    assert.equal((await cb(`code=good&state=${state}`, cookie)).headers.get('location'), '/?github=connected');

    const row = await t.store.getGithubConnection({ tenantId: PLATFORM_TENANT_ID, userId: 'user-1' });
    assert.equal(row.login, 'octo-cat');
    assert.match(row.accessTokenEnc, /^v1\./);
    assert.ok(!JSON.stringify(row).includes('ghu_first') && !JSON.stringify(row).includes('ghr_first'), 'tokens are stored only sealed');
    const st2 = await (await fetch(t.url + '/v1/github/status', { headers: bearer(USER_TOKEN) })).json();
    assert.equal(st2.connected, true);
    assert.equal(st2.login, 'octo-cat');
  } finally { await t.close(); }
});

async function connected(t) {
  const start = await fetch(t.url + '/v1/github/connect', { method: 'POST', headers: bearer(USER_TOKEN) });
  const state = new URL((await start.json()).url).searchParams.get('state');
  const cookie = start.headers.get('set-cookie').split(';')[0];
  await fetch(t.url + '/v1/github/callback?code=good&state=' + state, { redirect: 'manual', headers: { cookie } });
}
const ctx = { tenantId: PLATFORM_TENANT_ID, actor: { type: 'user', id: 'user-1' } };

test('github: an expiring token is refreshed; disconnecting revokes and deletes it', async () => {
  const t = await ghApp();
  try {
    await connected(t);
    assert.equal(await t.github.tokenFor(ctx), 'ghu_first');
    assert.equal(await t.github.tokenFor({ tenantId: PLATFORM_TENANT_ID, actor: { type: 'guest', id: 'g' } }), null);
    t.tick(8 * 3600 * 1000);
    assert.equal(await t.github.tokenFor(ctx), 'ghu_new');
    const row = await t.store.getGithubConnection({ tenantId: PLATFORM_TENANT_ID, userId: 'user-1' });
    assert.ok(!JSON.stringify(row).includes('ghu_new'));
    const del = await fetch(t.url + '/v1/github', { method: 'DELETE', headers: bearer(USER_TOKEN) });
    assert.equal(del.status, 200);
    assert.ok(t.gh.calls.some((c) => c.key === 'DELETE /applications/Iv23liABCDEF123456/grant'));
    assert.equal(await t.store.getGithubConnection({ tenantId: PLATFORM_TENANT_ID, userId: 'user-1' }), null);
  } finally { await t.close(); }
});

test('github: pull requests open only after Confirm, with the person\'s own token', async () => {
  const t = await ghApp({
    'GET /repos/o/r': (init) => [200, { full_name: 'o/r', default_branch: 'main', permissions: { push: init.headers.Authorization === 'Bearer ghu_first' } }],
    'GET /repos/o/r/git/ref/heads/main': () => [200, { object: { sha: 'b' } }],
    'GET /repos/o/r/git/commits/b': () => [200, { tree: { sha: 't' } }],
    'POST /repos/o/r/git/trees': () => [201, { sha: 't2' }],
    'POST /repos/o/r/git/commits': () => [201, { sha: 'c2' }],
    'POST /repos/o/r/git/refs': () => [201, {}],
    'POST /repos/o/r/pulls': () => [201, { number: 3, html_url: 'https://github.com/o/r/pull/3' }]
  });
  try {
    const post = (body) => fetch(t.url + '/v1/github/pull-requests', { method: 'POST', headers: { ...bearer(USER_TOKEN), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const pr = { repo: 'o/r', title: 'Fix', files: [{ path: 'a.txt', content: 'hi' }] };
    assert.equal((await post({ ...pr, confirm: true })).status, 409, 'not connected');
    await connected(t);
    assert.equal((await post(pr)).status, 400, 'no confirm');
    const ok = await post({ ...pr, confirm: true });
    assert.equal(ok.status, 201);
    assert.equal((await ok.json()).url, 'https://github.com/o/r/pull/3');
    const guest = await fetch(t.url + '/v1/github/pull-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pr, confirm: true }) });
    assert.equal(guest.status, 401);
  } finally { await t.close(); }
});

test('github: the model gets read-only tools, and repository text is marked as data', async () => {
  const t = await ghApp({ 'GET /repos/o/r': () => [200, { full_name: 'o/r', default_branch: 'main', stargazers_count: 5 }] });
  try {
    assert.ok(t.github.tools.every((x) => x.risk === 'read' && x.name.startsWith('github_')));
    const reg = createToolRegistry({ tools: t.github.tools, timeoutMs: 10_000 });
    const out = await reg.run({ tenantId: PLATFORM_TENANT_ID, actor: { type: 'guest', id: 'g' } }, 'github_repo_info', { repo: 'https://github.com/o/r' });
    assert.equal(out.repo, 'o/r');
    assert.equal(out.stars, 5);
    assert.match(out.note, /not instructions/);
    const missing = await reg.run({ tenantId: PLATFORM_TENANT_ID, actor: { type: 'guest', id: 'g' } }, 'github_read_file', { repo: 'o/r', path: 'nope.js' });
    assert.equal(missing.error, 'not_found');
  } finally { await t.close(); }
});

// A small in-memory GitHub repository: one base commit, files by path.
function fakeRepo({ files = {}, openPulls = [], failPull = false } = {}) {
  const branches = { main: 'base1' };
  const commits = { base1: { tree: 'tree0', files } };
  const trees = {};
  let n = 0;
  const made = [];
  const comments = [];
  const blob = (t) => createGithubApi().blobSha(t);
  const table = {
    'GET /repos/o/r': () => [200, { full_name: 'o/r', default_branch: 'main', permissions: { push: true } }],
    'GET /repos/o/r/git/ref/heads/main': () => [200, { object: { sha: branches.main } }],
    'POST /repos/o/r/git/trees': (init) => {
      const b = JSON.parse(init.body);
      const id = 'tree' + (++n);
      const base = Object.values(commits).find((c) => c.tree === b.base_tree);
      trees[id] = { ...base.files, ...Object.fromEntries(b.tree.map((e) => [e.path, e.content])) };
      return [201, { sha: id }];
    },
    'POST /repos/o/r/git/commits': (init) => { const b = JSON.parse(init.body); const id = 'c' + (++n); commits[id] = { tree: b.tree, files: trees[b.tree] }; return [201, { sha: id }]; },
    'POST /repos/o/r/git/refs': (init) => { const b = JSON.parse(init.body); branches[b.ref.replace('refs/heads/', '')] = b.sha; made.push(b.ref); return [201, {}]; },
    'POST /repos/o/r/pulls': (init) => (failPull ? [422, { message: 'Validation Failed' }] : [201, { number: 9, html_url: 'https://github.com/o/r/pull/9', head: JSON.parse(init.body).head }]),
    'GET /repos/o/r/pulls': () => [200, openPulls],
    'POST /repos/o/r/issues/9/comments': (init) => { comments.push(JSON.parse(init.body).body); return [201, {}]; }
  };
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || 'GET'} ${u.pathname}`;
    if (key.startsWith('GET /repos/o/r/git/commits/')) {
      const c = commits[u.pathname.split('/').pop()];
      return c ? Response.json({ tree: { sha: c.tree } }) : Response.json({ message: 'Not Found' }, { status: 404 });
    }
    if (key.startsWith('GET /repos/o/r/contents/')) {
      const path = decodeURIComponent(u.pathname.slice('/repos/o/r/contents/'.length));
      const ref = u.searchParams.get('ref');
      const c = commits[ref] || commits[branches[ref]];
      const text = c?.files[path];
      return text === undefined ? Response.json({ message: 'Not Found' }, { status: 404 }) : Response.json({ type: 'file', encoding: 'base64', content: b64(text), sha: blob(text), size: text.length });
    }
    const h = table[key];
    if (!h) return Response.json({ message: 'Not Found' }, { status: 404 });
    const [status, body] = h(init, u);
    return Response.json(body, { status });
  };
  return { fetchImpl, made, branches, commits, comments };
}

test('github: changes apply only where the text still matches, and saved files are read back', async () => {
  const repo = fakeRepo({ files: { 'src/a.js': 'const a = 1;\nfoo();\n', 'README.md': 'hi\n' } });
  const api = createGithubApi({ fetchImpl: repo.fetchImpl });
  const pr = await api.createPullRequest('tok', { repo: 'o/r', title: 'Bump a', now: 1, files: [
    { path: 'src/a.js', edits: [{ search: 'const a = 1;', replace: 'const a = 2;' }] },
    { path: 'README.md', content: 'hi\n' },
    { path: 'new.txt', content: 'new\n' }
  ] });
  assert.equal(pr.verified, true);
  assert.deepEqual(pr.files, [
    { path: 'src/a.js', status: 'changed', saved: true },
    { path: 'README.md', status: 'unchanged' },
    { path: 'new.txt', status: 'added', saved: true }
  ]);
  const head = repo.commits[repo.branches[pr.branch]];
  assert.equal(head.files['src/a.js'], 'const a = 2;\nfoo();\n', 'only the matched part changed');
  assert.equal(repo.branches.main, 'base1', 'the base branch is untouched');
  assert.equal(pr.commented, true);
  assert.match(repo.comments[0], /`src\/a\.js` — saved exactly as written/);
  assert.match(repo.comments[0], /`README\.md` — already matched/);
  assert.match(repo.comments[0], /cannot run this code/);

  await assert.rejects(api.createPullRequest('tok', { repo: 'o/r', title: 'x', files: [{ path: 'src/a.js', edits: [{ search: 'const a = 9;', replace: 'y' }] }] }), (e) => e.code === 'conflict' && /may have changed/.test(e.message), 'stale text is refused');
  const twice = fakeRepo({ files: { 'a.js': 'x();\nx();\n' } });
  await assert.rejects(createGithubApi({ fetchImpl: twice.fetchImpl }).createPullRequest('tok', { repo: 'o/r', title: 'x', files: [{ path: 'a.js', edits: [{ search: 'x();', replace: 'y();' }] }] }), (e) => e.code === 'conflict' && /more than one place/.test(e.message));
  await assert.rejects(api.createPullRequest('tok', { repo: 'o/r', title: 'x', files: [{ path: 'missing.js', edits: [{ search: 'a', replace: 'b' }] }] }), (e) => e.code === 'conflict');
  await assert.rejects(api.createPullRequest('tok', { repo: 'o/r', title: 'x', files: [{ path: 'README.md', content: 'hi\n' }] }), /Nothing to change/);
});

test('github: a repeated request returns the open pull request instead of a second one', async () => {
  const first = fakeRepo({ files: { 'a.txt': 'old\n' } });
  const api = createGithubApi({ fetchImpl: first.fetchImpl });
  const pr = await api.createPullRequest('tok', { repo: 'o/r', title: 'Update a', now: 5, files: [{ path: 'a.txt', content: 'new\n' }] });
  const again = fakeRepo({ files: { 'a.txt': 'old\n' }, openPulls: [{ number: 9, title: 'Update a', html_url: 'https://github.com/o/r/pull/9', head: { ref: pr.branch, sha: 'prhead', repo: { full_name: 'o/r' } } }] });
  // The open pull request's head commit has the same tree the repeat builds (tree1).
  const orig = again.fetchImpl;
  const fetchImpl = async (url, init) => (new URL(url).pathname === '/repos/o/r/git/commits/prhead' ? Response.json({ tree: { sha: 'tree1' } }) : orig(url, init));
  const dup = await createGithubApi({ fetchImpl }).createPullRequest('tok', { repo: 'o/r', title: 'Update a', now: 6, files: [{ path: 'a.txt', content: 'new\n' }] });
  assert.equal(dup.existing, true);
  assert.equal(dup.number, 9);
  assert.equal(again.made.length, 0, 'no second branch');
});

test('github: when the branch is saved but the pull request fails, the answer says so', async () => {
  const repo = fakeRepo({ files: { 'a.txt': 'old\n' }, failPull: true });
  const api = createGithubApi({ fetchImpl: repo.fetchImpl });
  await assert.rejects(api.createPullRequest('tok', { repo: 'o/r', title: 'T', now: 7, files: [{ path: 'a.txt', content: 'new\n' }] }),
    (e) => e.code === 'partial' && e.message.includes(repo.made[0].replace('refs/heads/', '')));
});

test('github: pull request status reports files and the repository checks, or why checks are not visible', async () => {
  const { fetchImpl } = fakeGithub({
    'GET /repos/o/r/pulls/4': () => [200, { title: 'T', state: 'open', merged: false, mergeable: true, mergeable_state: 'clean', head: { ref: 'nasrin/t', sha: 'h1' }, base: { ref: 'main' }, html_url: 'https://github.com/o/r/pull/4' }],
    'GET /repos/o/r/pulls/4/files': () => [200, [{ filename: 'a.js', status: 'modified', additions: 2, deletions: 1 }]],
    'GET /repos/o/r/commits/h1/check-runs': () => [403, { message: 'Resource not accessible by integration' }],
    'GET /repos/o/r/commits/h1/status': () => [200, { state: 'success', total_count: 1 }]
  });
  const st = await createGithubApi({ fetchImpl }).prStatus('tok', 'o/r', 4);
  assert.equal(st.state, 'open');
  assert.deepEqual(st.files, [{ path: 'a.js', status: 'modified', additions: 2, deletions: 1 }]);
  assert.deepEqual(st.checks, { unavailable: 'not_installed' });
  assert.deepEqual(st.statuses, { state: 'success', count: 1 });
  await assert.rejects(createGithubApi({ fetchImpl }).searchCode(null, 'o/r', 'foo'), (e) => e.code === 'unauthorized');
  let asked = '';
  const search = createGithubApi({ fetchImpl: async (url) => { asked = new URL(url).searchParams.get('q'); return Response.json({ total_count: 1, items: [{ path: 'src/a.js' }] }); } });
  assert.deepEqual(await search.searchCode('tok', 'o/r', 'signIn repo:evil/x org:evil'), { query: 'signIn', total: 1, files: ['src/a.js'] });
  assert.equal(asked, 'signIn repo:o/r', 'search stays in the chosen repository');
});

test('github: automatic pull requests only for people who turned them on', async () => {
  const { createGithub } = await import('../src/github/index.js');
  for (const autoPr of [false, true]) {
    const repo = fakeRepo({ files: { 'a.txt': 'old\n' } });
    const gh = fakeGithub({
      'POST github.com/login/oauth/access_token': () => [200, { access_token: 'ghu_first', expires_in: 28800, refresh_token: 'ghr_first', refresh_token_expires_in: 15897600 }],
      'GET /user': () => [200, { login: 'octo-cat' }]
    });
    const fetchImpl = async (url, init) => (/github\.com\/login|api\.github\.com\/user$/.test(url) ? gh.fetchImpl(url, init) : repo.fetchImpl(url, init));
    const verifyUser = async (t) => (t === USER_TOKEN ? { id: 'user-1', prefs: { autoPr } } : null);
    const built = buildTestApp({ env: ENV, verifyUser });
    const github = createGithub({ config: built.config, store: built.store, fetchImpl });
    const app = buildTestApp({ env: ENV, store: built.store, verifyUser, extraRoutes: github.routes });
    const srv = await serve(app.app);
    try {
      await connected(srv);
      const res = await fetch(srv.url + '/v1/github/pull-requests', { method: 'POST', headers: { ...bearer(USER_TOKEN), 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, auto: true, repo: 'o/r', title: 'Auto', body: '## Summary\nx', files: [{ path: 'a.txt', content: 'new\n' }] }) });
      assert.equal(res.status, autoPr ? 201 : 403, `autoPr ${autoPr}`);
      if (!autoPr) assert.equal((await res.json()).error.code, 'auto_pr_off');
    } finally { await srv.close(); }
  }
});

test('settings: automatic pull requests are off unless turned on, and saved with the account', async () => {
  const { readPrefs } = await import('../src/settings.js');
  assert.equal(readPrefs(undefined).autoPr, false);
  assert.equal(readPrefs({ nasrin_prefs: { autoPr: 'yes' } }).autoPr, false);
  assert.equal(readPrefs({ nasrin_prefs: { autoPr: true } }).autoPr, true);
});

test('coding chat page: PR description from the reply, many-file card, automatic pull requests only for fresh replies', async () => {
  const { readFile } = await import('node:fs/promises');
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="autoPrOn"/);
  for (const h of ["'## Summary'", "'## Files'", "'## Steps needed'", "'## Check before merging'"]) assert.ok(js.includes(h), h);
  assert.match(js, /const MANY_FILES = 5;/);
  assert.match(js, /const many = sources\.length > MANY_FILES && codingProject && github\.available;/);
  assert.match(js, /if \(fresh && codingProject && github\.autoPr\)/);
  assert.match(js, /show\('assistant', data\.message\.content, \{ id: data\.message\.id, animate: !live\.text\(\), fresh: true \}\)/);
  assert.match(js, /data\.messages\.forEach\(\(m, i\) => show\([^)]*\{ animate: false, id: m\.id/, 'history replies are not fresh');
});

test('plugins: more apps are listed as Coming soon, never as connected', async () => {
  const { readFile } = await import('node:fs/promises');
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const name of ['Outlook', 'OneDrive', 'Teams', 'Excel', 'PowerPoint', 'Canva', 'Gmail', 'Google Cloud', 'Google Meet', 'Google Calendar', 'Facebook', 'Instagram', 'Threads', "'X'", 'Messenger', 'WhatsApp']) {
    assert.ok(js.includes(name.startsWith("'") ? name : `'${name}'`), name);
  }
  assert.match(js, /mk\('span', 'plugins-soon', 'Coming soon'\)/);
});

test('plugins: connected plugins are listed first, under Connected', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="pluginsConnected"') < html.indexOf('id="pluginsDev"') && html.indexOf('id="pluginsDev"') < html.indexOf('id="pluginsMore"'));
  assert.match(js, /\$\(on \? 'pluginsConnected' : 'pluginsDev'\)\.appendChild\(\$\('ghCard'\)\);/);
});

test('github: up to 10 accounts, one main; removing the main one promotes the next', async () => {
  // Each code is a different GitHub account: code "acct-N" -> token "ghu_acct-N" -> login "acct-N".
  const t = await ghApp({
    'POST github.com/login/oauth/access_token': (init) => {
      const code = new URLSearchParams(init.body).get('code');
      return [200, { access_token: 'ghu_' + code, expires_in: 28800, refresh_token: 'ghr_' + code, refresh_token_expires_in: 15897600 }];
    },
    'GET /user': (init) => [200, { login: String(init.headers.Authorization).replace('Bearer ghu_', '') }]
  });
  const json = (r) => r.json();
  const status = () => fetch(t.url + '/v1/github/status', { headers: bearer(USER_TOKEN) }).then(json);
  const link = async (code, add) => {
    const start = await fetch(t.url + '/v1/github/connect' + (add ? '?add=1' : ''), { method: 'POST', headers: bearer(USER_TOKEN) });
    if (start.status !== 200) return { status: start.status, body: await start.json() };
    const { url } = await start.json();
    const cookie = start.headers.get('set-cookie').split(';')[0];
    const back = await fetch(t.url + '/v1/github/callback?code=' + code + '&state=' + new URL(url).searchParams.get('state'), { redirect: 'manual', headers: { cookie } });
    return { url, location: back.headers.get('location') };
  };
  try {
    const first = await link('acct-1', false);
    assert.equal(new URL(first.url).searchParams.get('prompt'), null);
    const second = await link('acct-2', true);
    assert.equal(new URL(second.url).searchParams.get('prompt'), 'select_account', 'adding asks GitHub to let the person pick an account');
    assert.equal((await link('acct-1', false)).location, '/?github=connected', 'the same account again just refreshes it');
    let st = await status();
    assert.deepEqual(st.accounts, [{ login: 'acct-1', main: true }, { login: 'acct-2', main: false }]);
    assert.equal(st.login, 'acct-1');
    assert.equal(await t.github.tokenFor(ctx), 'ghu_acct-1', 'the main account is used');

    const main = await fetch(t.url + '/v1/github/main', { method: 'POST', headers: { ...bearer(USER_TOKEN), 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'acct-2' }) });
    assert.equal(main.status, 200);
    assert.equal(await t.github.tokenFor(ctx), 'ghu_acct-2');
    assert.equal((await fetch(t.url + '/v1/github/main', { method: 'POST', headers: { ...bearer(USER_TOKEN), 'Content-Type': 'application/json' }, body: JSON.stringify({ login: 'stranger' }) })).status, 404);

    for (let i = 3; i <= 10; i++) await link('acct-' + i, true);
    st = await status();
    assert.equal(st.accounts.length, 10);
    const eleventh = await link('acct-11', true);
    assert.equal(eleventh.status, 409, 'no eleventh account');
    assert.equal(eleventh.body.error.code, 'github_accounts_limit');

    const del = await fetch(t.url + '/v1/github?login=acct-2', { method: 'DELETE', headers: bearer(USER_TOKEN) });
    assert.equal(del.status, 200);
    st = await status();
    assert.equal(st.accounts.length, 9);
    assert.equal(st.accounts.filter((a) => a.main).length, 1, 'exactly one main after removing the main one');
    assert.equal(st.accounts.some((a) => a.login === 'acct-2'), false);
    assert.equal((await fetch(t.url + '/v1/github?login=bad%20name', { method: 'DELETE', headers: bearer(USER_TOKEN) })).status, 400);

    await fetch(t.url + '/v1/github', { method: 'DELETE', headers: bearer(USER_TOKEN) });
    assert.deepEqual((await status()).accounts, [], 'Disconnect without a name removes every account');
  } finally { await t.close(); }
});
