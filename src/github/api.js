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
  // code: invalid | not_found | unauthorized | forbidden | rate_limited | no_push_access | not_installed | conflict | failed
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

  // Checks a pull request's files: text only, safe paths, size limits.
  function checkFiles(files) {
    if (!Array.isArray(files) || !files.length) throw new GithubError('invalid', 'Add at least one file.');
    if (files.length > MAX_PR_FILES) throw new GithubError('invalid', `A pull request here can change up to ${MAX_PR_FILES} files.`);
    let total = 0;
    const seen = new Set();
    return files.map((f) => {
      const path = checkPath(f?.path);
      if (seen.has(path)) throw new GithubError('invalid', 'A file is listed twice.');
      seen.add(path);
      if (typeof f.content !== 'string') throw new GithubError('invalid', 'Every file needs its text.');
      total += Buffer.byteLength(f.content);
      if (total > MAX_PR_BYTES) throw new GithubError('invalid', 'These files are too large for one pull request.');
      if (f.content.includes('\0')) throw new GithubError('invalid', 'Only text files can be added.');
      return { path, content: f.content };
    });
  }

  // New branch from base -> one commit with the files -> pull request.
  // The base branch itself is never changed.
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
    const tree = await call('POST', `/repos/${name}/git/trees`, {
      token, body: { base_tree: commit.tree.sha, tree: list.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })) }
    });
    const made = await call('POST', `/repos/${name}/git/commits`, { token, body: { message: t, tree: tree.sha, parents: [baseSha] } });
    const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'change';
    const branch = `nasrin/${slug}-${Number(now).toString(36)}`;
    await call('POST', `/repos/${name}/git/refs`, { token, body: { ref: `refs/heads/${branch}`, sha: made.sha } });
    const pr = await call('POST', `/repos/${name}/pulls`, { token, body: { title: t, head: branch, base: baseRef, body: text } });
    return { number: pr.number, url: pr.html_url, branch, base: baseRef };
  }

  return { call, repoInfo, listFiles, readFile, recentCommits, myRepos, createPullRequest, checkFiles };
}
