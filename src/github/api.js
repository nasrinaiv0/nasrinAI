import { createHash } from 'node:crypto';

// A small GitHub REST client on built-in fetch (ADR-002: no Octokit).
// Reads public repositories (and the person's own, with their token) and
// opens pull requests on a new branch. It never writes to an existing
// branch, never force-updates a ref and never deletes anything.

const API = 'https://api.github.com';
export const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
export const REF = /^(?!.*\.\.)(?!\/)(?!.*\/\/)[A-Za-z0-9._/-]{1,200}$/;
export const MAX_PR_FILES = 20;
export const MAX_PR_BYTES = 500_000;

export class GithubError extends Error {
  // code: invalid | not_found | unauthorized | forbidden | rate_limited | no_push_access | not_installed | conflict | partial | failed
  constructor(code, message, status = 0) { super(message); this.name = 'GithubError'; this.code = code; this.status = status; }
}

export function checkRepo(repo) {
  const r = String(repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!REPO.test(r) || r.split('/').some((p) => p === '.' || p === '..')) throw new GithubError('invalid', 'Give the repository as owner/name.');
  return r;
}

export function checkPath(path, { allowEmpty = false } = {}) {
  const p = String(path ?? '').trim().replace(/^\.?\/+/, '').replace(/\/+$/, '');
  if (!p && allowEmpty) return '';
  if (!p || p.length > 300 || /[\0\\]/.test(p) || p.split('/').some((s) => !s || s === '.' || s === '..') || /^\.git(\/|$)/.test(p)) {
    throw new GithubError('invalid', 'That file path is not allowed.');
  }
  return p;
}

export function checkRef(ref) {
  if (ref === undefined || ref === null || ref === '') return '';
  const r = String(ref).trim();
  if (!REF.test(r) || r.endsWith('/') || r.endsWith('.lock')) throw new GithubError('invalid', 'That branch name is not allowed.');
  return r;
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const isBinary = (buf) => buf.subarray(0, 8000).includes(0);

export function createGithubApi({ fetchImpl = (...a) => fetch(...a), timeoutMs = 8000 } = {}) {
  async function call(method, path, { token = null, body } = {}) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'NasrinAI' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetchImpl(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new GithubError('failed', 'GitHub could not be reached. Try again soon.');
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.ok) return data;
    const msg = String(data?.message || '');
    if (res.status === 404) throw new GithubError('not_found', 'GitHub has no such repository, branch or file (or it is private).', 404);
    if (res.status === 401) throw new GithubError('unauthorized', 'GitHub did not accept the connection. Connect GitHub again.', 401);
    if ((res.status === 403 || res.status === 429) && (res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(msg))) {
      throw new GithubError('rate_limited', 'GitHub is limiting requests right now. Connect GitHub for a higher limit, or try again later.', res.status);
    }
    if (res.status === 403 && /not accessible by integration/i.test(msg)) throw new GithubError('not_installed', 'Install the NasrinAI GitHub App on this repository first.', 403);
    if (res.status === 403) throw new GithubError('forbidden', 'GitHub refused this request.', 403);
    if (res.status === 409 || res.status === 422) throw new GithubError('conflict', 'GitHub could not apply this (the branch may have changed, or the repository is empty).', res.status);
    throw new GithubError('failed', 'GitHub could not finish this request.', res.status);
  }

  async function repoInfo(token, repo) {
    const r = await call('GET', `/repos/${checkRepo(repo)}`, { token });
    return {
      repo: r.full_name, description: r.description ? String(r.description).slice(0, 300) : null,
      default_branch: r.default_branch, private: r.private === true, language: r.language || null,
      stars: r.stargazers_count ?? 0, forks: r.forks_count ?? 0, open_issues: r.open_issues_count ?? 0,
      pushed_at: r.pushed_at || null, url: r.html_url, can_push: r.permissions?.push === true
    };
  }

  // One folder's entries (files and folders), trimmed to fit a tool result.
  async function listFiles(token, repo, { path = '', ref = '', budget = 6000 } = {}) {
    const p = checkPath(path, { allowEmpty: true });
    const r = checkRef(ref);
    const data = await call('GET', `/repos/${checkRepo(repo)}/contents/${enc(p)}${r ? `?ref=${encodeURIComponent(r)}` : ''}`, { token });
    const list = Array.isArray(data) ? data : [data];
    const entries = [];
    let size = 0;
    for (const e of list.slice(0, 300)) {
      const item = { name: String(e.name), type: e.type === 'dir' ? 'dir' : 'file', ...(e.type === 'dir' ? {} : { size: e.size ?? 0 }) };
      size += JSON.stringify(item).length + 1;
      if (size > budget) break;
      entries.push(item);
    }
    return { path: p, entries, more: entries.length < list.length };
  }

  // A text file's lines from startLine, as many as fit; next_line pages on.
  async function readFile(token, repo, path, { ref = '', startLine = 1, budget = 6000 } = {}) {
    const p = checkPath(path);
    const r = checkRef(ref);
    const data = await call('GET', `/repos/${checkRepo(repo)}/contents/${enc(p)}${r ? `?ref=${encodeURIComponent(r)}` : ''}`, { token });
    if (Array.isArray(data) || data?.type !== 'file') throw new GithubError('invalid', 'That path is a folder, not a file.');
    if (data.encoding !== 'base64' || typeof data.content !== 'string') throw new GithubError('invalid', 'That file is too large to read here.');
    const buf = Buffer.from(data.content, 'base64');
    if (isBinary(buf)) throw new GithubError('invalid', 'That file is not text.');
    const lines = buf.toString('utf8').split('\n');
    const from = Math.max(1, Math.floor(startLine) || 1);
    let text = '';
    let i = from - 1;
    for (; i < lines.length; i++) {
      const next = lines[i] + (i < lines.length - 1 ? '\n' : '');
      if (text.length + next.length > budget) {
        if (!text) { text = next.slice(0, budget); i++; }
        break;
      }
      text += next;
    }
    return { path: p, size: data.size ?? buf.length, lines: lines.length, from_line: from, text, ...(i < lines.length ? { next_line: i + 1 } : {}) };
  }

  async function recentCommits(token, repo, { ref = '', path = '', limit = 10 } = {}) {
    const q = new URLSearchParams({ per_page: String(Math.min(20, Math.max(1, limit))) });
    const r = checkRef(ref);
    const p = checkPath(path, { allowEmpty: true });
    if (r) q.set('sha', r);
    if (p) q.set('path', p);
    const list = await call('GET', `/repos/${checkRepo(repo)}/commits?${q}`, { token });
    return {
      commits: (Array.isArray(list) ? list : []).map((c) => ({
        sha: String(c.sha).slice(0, 7),
        message: String(c.commit?.message || '').split('\n')[0].slice(0, 120),
        author: String(c.commit?.author?.name || c.author?.login || '').slice(0, 60),
        date: c.commit?.author?.date || null
      }))
    };
  }

  // The repositories the person's GitHub connection reaches, newest first.
  async function myRepos(token) {
    const list = await call('GET', '/user/repos?per_page=50&sort=pushed', { token });
    return (Array.isArray(list) ? list : []).map((r) => ({ repo: r.full_name, default_branch: r.default_branch, private: r.private === true, can_push: r.permissions?.push === true }));
  }

  // Code search inside one repository (GitHub allows it only when signed in).
  async function searchCode(token, repo, query) {
    const name = checkRepo(repo);
    // Search stays inside this repository: other scope words are dropped.
    const q = String(query || '').replace(/\b(repo|org|user|owner):\S*/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!q || q.length > 120 || /[\0\n]/.test(q)) throw new GithubError('invalid', 'Give a short search text.');
    if (!token) throw new GithubError('unauthorized', 'Connect GitHub (Plugins in the menu) to search code.');
    const data = await call('GET', `/search/code?${new URLSearchParams({ q: `${q} repo:${name}`, per_page: '20' })}`, { token });
    return { query: q, total: data?.total_count ?? 0, files: (data?.items || []).slice(0, 20).map((i) => String(i.path)) };
  }

  // A pull request as GitHub sees it now: state, changed files, and the
  // repository's own checks (CI) on its latest commit, when visible.
  async function prStatus(token, repo, number) {
    const name = checkRepo(repo);
    const n = Number(number);
    if (!Number.isInteger(n) || n < 1) throw new GithubError('invalid', 'Give the pull request number.');
    const pr = await call('GET', `/repos/${name}/pulls/${n}`, { token });
    const files = await call('GET', `/repos/${name}/pulls/${n}/files?per_page=50`, { token }).catch(() => []);
    const sha = pr?.head?.sha;
    let checks = null;
    try {
      const runs = await call('GET', `/repos/${name}/commits/${sha}/check-runs?per_page=30`, { token });
      checks = (runs?.check_runs || []).slice(0, 30).map((c) => ({ name: String(c.name).slice(0, 80), status: c.status, conclusion: c.conclusion || null }));
    } catch (err) { if (!(err instanceof GithubError)) throw err; checks = { unavailable: err.code }; }
    let statuses = null;
    try {
      const st = await call('GET', `/repos/${name}/commits/${sha}/status`, { token });
      statuses = { state: st?.state || null, count: st?.total_count ?? 0 };
    } catch (err) { if (!(err instanceof GithubError)) throw err; statuses = { unavailable: err.code }; }
    // Kept small: a tool result must stay under 8 KB, also for big pull requests.
    const all = Array.isArray(files) ? files : [];
    const out = {
      repo: name, number: n, title: String(pr.title || '').slice(0, 200), state: pr.merged ? 'merged' : pr.state,
      merged: pr.merged === true, merged_at: pr.merged_at || null, merged_by: pr.merged_by?.login || null,
      closed_at: pr.closed_at || null, draft: pr.draft === true,
      // The whole diff, as GitHub counts it: +additions / -deletions over changed_files.
      additions: Number.isInteger(pr.additions) ? pr.additions : all.reduce((t, f) => t + (f.additions ?? 0), 0),
      deletions: Number.isInteger(pr.deletions) ? pr.deletions : all.reduce((t, f) => t + (f.deletions ?? 0), 0),
      changed_files: Number.isInteger(pr.changed_files) ? pr.changed_files : all.length,
      commits: Number.isInteger(pr.commits) ? pr.commits : null,
      mergeable: pr.mergeable ?? null, mergeable_state: pr.mergeable_state || null,
      head: pr.head?.ref || null, base: pr.base?.ref || null, url: pr.html_url,
      files: all.slice(0, 20).map((f) => ({ path: String(f.filename).slice(-120), status: f.status, additions: f.additions ?? 0, deletions: f.deletions ?? 0 })),
      checks: Array.isArray(checks) ? checks.slice(0, 20) : checks, statuses
    };
    if (all.length > 20) out.more_files = all.length - 20;
    return out;
  }

  // Recent pull requests (newest first): number, title, open/merged/closed.
  async function listPulls(token, repo, { state = 'all', limit = 10 } = {}) {
    const name = checkRepo(repo);
    const st = ['open', 'closed', 'all'].includes(state) ? state : 'all';
    const n = Math.min(Math.max(Number(limit) || 10, 1), 20);
    const list = await call('GET', `/repos/${name}/pulls?state=${st}&sort=updated&direction=desc&per_page=${n}`, { token });
    return { repo: name, pull_requests: (Array.isArray(list) ? list : []).slice(0, n).map((p) => ({
      number: p.number, title: String(p.title || '').slice(0, 120),
      state: p.merged_at ? 'merged' : p.state, merged_at: p.merged_at || null,
      head: p.head?.ref || null, base: p.base?.ref || null, updated_at: p.updated_at || null
    })) };
  }

  // Checks a pull request's files: text only, safe paths, size limits.
  // A file is { path, content } (the whole new file) or { path, edits:
  // [{ search, replace }] } (exact parts of the current file to change).
  function checkFiles(files) {
    if (!Array.isArray(files) || !files.length) throw new GithubError('invalid', 'Add at least one file.');
    if (files.length > MAX_PR_FILES) throw new GithubError('invalid', `A pull request here can change up to ${MAX_PR_FILES} files.`);
    let total = 0;
    const seen = new Set();
    const text = (v) => typeof v === 'string' && !v.includes('\0');
    return files.map((f) => {
      const path = checkPath(f?.path);
      if (seen.has(path)) throw new GithubError('invalid', 'A file is listed twice.');
      seen.add(path);
      if (Array.isArray(f.edits)) {
        if (!f.edits.length || f.edits.length > 50) throw new GithubError('invalid', `${path}: give between 1 and 50 changes.`);
        const edits = f.edits.map((e) => {
          if (!text(e?.search) || !e.search || !text(e?.replace)) throw new GithubError('invalid', `${path}: every change needs the exact text to find and its replacement.`);
          total += Buffer.byteLength(e.search) + Buffer.byteLength(e.replace);
          return { search: e.search, replace: e.replace };
        });
        if (total > MAX_PR_BYTES) throw new GithubError('invalid', 'These changes are too large for one pull request.');
        return { path, edits };
      }
      if (!text(f.content)) throw new GithubError('invalid', 'Every file needs its text (text files only).');
      total += Buffer.byteLength(f.content);
      if (total > MAX_PR_BYTES) throw new GithubError('invalid', 'These files are too large for one pull request.');
      return { path, content: f.content };
    });
  }

  // The current text of a file on a commit, or null when it does not exist.
  async function fileAt(token, name, path, sha) {
    let data;
    try { data = await call('GET', `/repos/${name}/contents/${enc(path)}?ref=${sha}`, { token }); } catch (err) {
      if (err.code === 'not_found') return null;
      throw err;
    }
    if (Array.isArray(data) || data?.type !== 'file') throw new GithubError('invalid', `${path} is a folder, not a file.`);
    let buf;
    if (data.encoding === 'base64' && data.content) buf = Buffer.from(data.content, 'base64');
    else buf = Buffer.from((await call('GET', `/repos/${name}/git/blobs/${data.sha}`, { token })).content || '', 'base64');
    if (isBinary(buf)) throw new GithubError('invalid', `${path} is not a text file.`);
    return buf.toString('utf8');
  }

  // Each change must match exactly one place in the current file, so a
  // file that changed since Nasrin read it is never silently overwritten.
  function applyEdits(path, current, edits) {
    let out = current;
    for (const { search, replace } of edits) {
      const at = out.indexOf(search);
      if (at < 0) throw new GithubError('conflict', `${path}: a part to change was not found. The file may have changed since Nasrin read it; ask Nasrin to read it again.`);
      if (out.indexOf(search, at + 1) >= 0) throw new GithubError('conflict', `${path}: a part to change matches more than one place; it needs more surrounding lines.`);
      out = out.slice(0, at) + replace + out.slice(at + search.length);
    }
    return out;
  }

  // Git's own id for a file's content (what GitHub reports back), to check
  // that what was saved is exactly what was meant.
  const blobSha = (text) => {
    const body = Buffer.from(text, 'utf8');
    return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest('hex');
  };

  // New branch from base -> one commit with the files -> pull request.
  // The base branch itself is never changed. Steps that change GitHub come
  // last; the same request repeated (an uncertain answer, a double tap)
  // returns the pull request already opened instead of a second one.
  async function createPullRequest(token, { repo, base = '', title, body = '', files, now = Date.now() }) {
    const name = checkRepo(repo);
    const t = String(title || '').trim().replace(/\s+/g, ' ');
    if (!t || t.length > 200) throw new GithubError('invalid', 'Give the pull request a short title.');
    const text = String(body || '').slice(0, 10_000);
    const list = checkFiles(files);
    const info = await repoInfo(token, name);
    if (!info.can_push) throw new GithubError('no_push_access', 'Your GitHub account cannot add branches to this repository.');
    const baseRef = checkRef(base) || info.default_branch;
    const head = await call('GET', `/repos/${name}/git/ref/heads/${enc(baseRef)}`, { token });
    const baseSha = head?.object?.sha;
    const commit = await call('GET', `/repos/${name}/git/commits/${baseSha}`, { token });

    // The final text of every file, and which ones end up unchanged.
    const finals = [];
    for (const f of list) {
      const current = await fileAt(token, name, f.path, baseSha);
      if (f.edits && current === null) throw new GithubError('conflict', `${f.path} does not exist on ${baseRef}, so it cannot be edited.`);
      const content = f.edits ? applyEdits(f.path, current, f.edits) : f.content;
      finals.push({ path: f.path, content, created: current === null, unchanged: current === content });
    }
    const changed = finals.filter((f) => !f.unchanged);
    if (!changed.length) throw new GithubError('invalid', `Nothing to change: these files already match ${baseRef}.`);

    const tree = await call('POST', `/repos/${name}/git/trees`, {
      token, body: { base_tree: commit.tree.sha, tree: changed.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })) }
    });

    // Already opened (same title, same files on the same base)? Return it.
    const open = await call('GET', `/repos/${name}/pulls?state=open&base=${encodeURIComponent(baseRef)}&per_page=30`, { token }).catch(() => []);
    for (const pr of Array.isArray(open) ? open : []) {
      if (pr?.title !== t || !String(pr?.head?.ref || '').startsWith('nasrin/') || pr?.head?.repo?.full_name !== name) continue;
      const c = await call('GET', `/repos/${name}/git/commits/${pr.head.sha}`, { token }).catch(() => null);
      if (c?.tree?.sha === tree.sha) return { number: pr.number, url: pr.html_url, branch: pr.head.ref, base: baseRef, existing: true, files: report(finals), verified: true };
    }

    const made = await call('POST', `/repos/${name}/git/commits`, { token, body: { message: t, tree: tree.sha, parents: [baseSha] } });
    const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'change';
    const branch = `nasrin/${slug}-${Number(now).toString(36)}`;
    await call('POST', `/repos/${name}/git/refs`, { token, body: { ref: `refs/heads/${branch}`, sha: made.sha } });
    let pr;
    try {
      pr = await call('POST', `/repos/${name}/pulls`, { token, body: { title: t, head: branch, base: baseRef, body: text } });
    } catch (err) {
      // Say exactly what exists: the branch was made, the pull request was not.
      throw new GithubError('partial', `The branch ${branch} was saved on GitHub, but the pull request could not be opened (${err.message}) Open it from GitHub, or try again.`, err.status);
    }

    // Read back what GitHub saved on the new branch and compare it with what was meant.
    const checked = await Promise.all(changed.map(async (f) => {
      try {
        const got = await call('GET', `/repos/${name}/contents/${enc(f.path)}?ref=${encodeURIComponent(branch)}`, { token });
        return got?.sha === blobSha(f.content);
      } catch { return false; }
    }));
    const saved = report(finals).map((r) => (r.status === 'unchanged' ? r : { ...r, saved: checked[changed.findIndex((c) => c.path === r.path)] }));
    // A comment on the pull request with what was checked (best effort: the
    // pull request stands even if the comment cannot be added).
    const commented = await call('POST', `/repos/${name}/issues/${pr.number}/comments`, { token, body: { body: checkComment(saved) } }).then(() => true, () => false);
    return { number: pr.number, url: pr.html_url, branch, base: baseRef, files: saved, verified: checked.every(Boolean), commented };
  }
  const checkComment = (files) => [
    '**NasrinAI check after opening this pull request**', '',
    ...files.map((f) => `- \`${f.path}\` — ${f.status === 'unchanged' ? 'already matched, left as it is' : f.saved ? `${f.status === 'added' ? 'new file, ' : ''}saved exactly as written` : 'could not be confirmed; please look at it'}`),
    '', 'This comment confirms only that files were saved; it does not prove the code runs. Review the changes and this repository\'s checks before merging.'
  ].join('\n');
  const report = (finals) => finals.map((f) => ({ path: f.path, status: f.unchanged ? 'unchanged' : f.created ? 'added' : 'changed' }));


  async function downloadArchive(token, repo, ref) {
    const name=checkRepo(repo), branch=checkRef(ref);
    if(!branch)throw new GithubError('invalid','Choose a branch or commit to run.');
    let first;
    try{first=await fetchImpl(API+'/repos/'+name+'/tarball/'+enc(branch),{method:'GET',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'NasrinAI',Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(timeoutMs)});}
    catch{throw new GithubError('failed','GitHub could not provide a repository snapshot.');}
    if(first.status===404)throw new GithubError('not_found','The repository or branch was not found (or is private).');
    let response=first;
    if(first.status>=300&&first.status<400){
      let target;try{target=new URL(first.headers.get('location')||'');}catch{throw new GithubError('failed','GitHub returned an invalid archive redirect.');}
      if(target.protocol!=='https:'||target.hostname!=='codeload.github.com'||target.username||target.password)throw new GithubError('failed','GitHub returned an untrusted archive redirect.');
      try{response=await fetchImpl(target.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15_000),headers:{'User-Agent':'NasrinAI'}});}catch{throw new GithubError('failed','The repository snapshot could not be downloaded.');}
    }
    if(!response.ok||!response.body)throw new GithubError('failed','The repository snapshot could not be downloaded.');
    const chunks=[];let size=0,reader=response.body.getReader();
    try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>15*1024*1024){await reader.cancel();throw new GithubError('invalid','The repository snapshot exceeds 15 MB.');}chunks.push(Buffer.from(value));}}
    catch(e){if(e instanceof GithubError)throw e;throw new GithubError('failed','The repository snapshot download was interrupted.');}
    finally{reader.releaseLock();}
    return Buffer.concat(chunks,size);
  }

  return { call, repoInfo, listFiles, readFile, recentCommits, myRepos, searchCode, prStatus, listPulls, createPullRequest, checkFiles, applyEdits, blobSha, downloadArchive };
}
