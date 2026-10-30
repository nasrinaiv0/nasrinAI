import { checkPath, checkRef, checkRepo, GithubError } from './api.js';

// The coding workspace: Nasrin edits a repository's files the way a developer
// does (exact find-and-replace, or a whole new file), reads its own edited
// version back, and runs tests against it in the isolated runner. Nothing is
// written to GitHub here. At the end of the reply the changes are attached as
// [[file]] blocks (SEARCH/REPLACE parts, or whole files), so the person sees
// exactly what changed and can open a pull request with the usual Confirm.
//
// State lives for one chat turn (keyed by tenant, person and chat). The next
// turn picks the changes up again from the last reply that carried them
// (response_metadata.code_workspace names its repository), so a fix can grow
// over several messages. Bounded: 20 files, 200 KB per file, 500 KB in all.

export const MAX_FILES = 20;
const MAX_FILE_BYTES = 200_000;
const MAX_TOTAL_BYTES = 500_000;
const TTL_MS = 15 * 60_000;
const MARKER = /^(<{7} SEARCH|={7}|>{7} REPLACE)[ \t]*$/m;

const FILE_BLOCK = /\[\[file\s+name\s*=\s*"([^"\n]{1,300})"\s*\]\][ \t]*\n?([\s\S]*?)(?:\n?[ \t]*\[\[\/file\]\]|$)/gi;
const EDIT = /^<{7} SEARCH[ \t]*\n([\s\S]*?)\n?^={7}[ \t]*\n([\s\S]*?)\n?^>{7} REPLACE[ \t]*$/gm;

// [[file name="path"]] blocks in a reply: whole files or SEARCH/REPLACE parts.
export function parseFileBlocks(text) {
  const out = [];
  for (const [, name, body] of String(text || '').matchAll(FILE_BLOCK)) {
    if (/^<{7} SEARCH/m.test(body)) {
      const edits = [...body.matchAll(EDIT)].map(([, search, replace]) => ({ search, replace }));
      if (edits.length) out.push({ path: name.trim(), edits });
    } else out.push({ path: name.trim(), content: body });
  }
  return out;
}

const count = (text, part) => {
  let n = 0;
  for (let at = text.indexOf(part); at >= 0 && n < 2; at = text.indexOf(part, at + 1)) n++;
  return n;
};

export function createCodeWorkspace({ fetchFile, defaultBranch, onFinish = null, now = () => Date.now() }) {
  const turns = new Map();
  const keyOf = (ctx) => `${ctx.tenantId}:${ctx.actor.type}:${ctx.actor.id}:${ctx.conversationId || '-'}`;
  const sweep = () => { for (const [k, s] of turns) if (now() - s.at > TTL_MS) turns.delete(k); };

  function stateFor(ctx) {
    sweep();
    const k = keyOf(ctx);
    let s = turns.get(k);
    if (!s) { s = { repo: '', ref: '', files: new Map(), seeds: [], touched: false, notes: [], at: now() }; turns.set(k, s); }
    s.at = now();
    return s;
  }
  const changed = (s) => [...s.files.values()].filter((f) => f.content !== f.base || f.whole);
  const size = (s) => changed(s).reduce((n, f) => n + Buffer.byteLength(f.content || ''), 0);

  async function useRepo(s, token, repo, ref) {
    const name = checkRepo(repo);
    const r = checkRef(ref || '');
    if (s.repo && s.repo.toLowerCase() !== name.toLowerCase()) {
      if (changed(s).length || s.seeds.length) throw new GithubError('invalid', `The workspace holds changes for ${s.repo}. Finish with that repository (or code_revert its files) first.`);
      s.files.clear(); s.ref = '';
    }
    if (!s.repo || s.repo.toLowerCase() !== name.toLowerCase()) s.repo = name;
    if (r && !s.ref) s.ref = r;
    if (!s.ref) s.ref = await defaultBranch(token, name);
    // Changes carried over from an earlier reply are applied on first use.
    if (s.seeds.length) {
      const seeds = s.seeds; s.seeds = [];
      for (const seed of seeds) {
        try {
          if (seed.content !== undefined) {
            const base = await fetchFile(token, s.repo, seed.path, s.ref);
            s.files.set(seed.path, { base, content: seed.content, whole: true, edits: [] });
          } else {
            const base = await fetchFile(token, s.repo, seed.path, s.ref);
            if (base === null) throw new Error('missing');
            let content = base;
            for (const e of seed.edits) {
              if (count(content, e.search) !== 1) throw new Error('stale');
              content = content.replace(e.search, () => e.replace);
            }
            s.files.set(seed.path, { base, content, whole: false, edits: seed.edits.slice() });
          }
        } catch { s.notes.push(`Earlier changes to ${seed.path} no longer apply to ${s.repo} and were dropped.`); }
      }
    }
    return s;
  }

  async function load(s, token, path) {
    const p = checkPath(path);
    if (!s.files.has(p)) {
      if (s.files.size >= MAX_FILES * 3) throw new GithubError('invalid', 'Too many files are open in this workspace.');
      const base = await fetchFile(token, s.repo, p, s.ref);
      s.files.set(p, { base, content: base, whole: false, edits: [] });
    }
    return { path: p, file: s.files.get(p) };
  }

  function checkLimits(s, path, content) {
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new GithubError('invalid', `${path} would be larger than 200 KB.`);
    const files = changed(s);
    if (files.length > MAX_FILES) throw new GithubError('invalid', `A change here can touch up to ${MAX_FILES} files.`);
    if (size(s) > MAX_TOTAL_BYTES) throw new GithubError('invalid', 'These changes are larger than 500 KB in all.');
  }

  return {
    // Turn start: remember changes from the last reply that carried them.
    begin(ctx, history = []) {
      const s = stateFor(ctx);
      s.touched = false; s.notes = [];
      if (s.files.size || s.seeds.length) return;
      const last = [...history].reverse().find((m) => m.role === 'assistant' && m.responseMetadata?.code_workspace?.repo);
      if (!last) return;
      const meta = last.responseMetadata.code_workspace;
      try { s.repo = checkRepo(meta.repo); s.ref = meta.ref ? checkRef(meta.ref) : ''; } catch { s.repo = ''; s.ref = ''; return; }
      s.seeds = parseFileBlocks(last.content).filter((b) => { try { checkPath(b.path); return true; } catch { return false; } }).slice(0, MAX_FILES);
    },

    // The file as Nasrin has edited it (null when it is not in the workspace).
    async read(ctx, token, repo, path, ref) {
      const s = stateFor(ctx);
      if (!s.repo && !s.seeds.length) return null;
      if (s.repo && s.repo.toLowerCase() !== String(repo || '').toLowerCase()) return null;
      await useRepo(s, token, repo, ref);
      const p = checkPath(path);
      const f = s.files.get(p);
      if (!f || (f.content === f.base && !f.whole)) return null;
      if (f.content === null) throw new GithubError('not_found', `${p} was deleted in the workspace.`);
      return f.content;
    },

    async edit(ctx, token, { repo, ref, path, old_string: oldText, new_string: newText, replace_all: all }) {
      const s = await useRepo(stateFor(ctx), token, repo, ref);
      const { path: p, file } = await load(s, token, path);
      if (file.content === null) throw new GithubError('not_found', `${p} does not exist on ${s.ref}. Use code_write to create it.`);
      if (!oldText) throw new GithubError('invalid', 'old_string is empty. Use code_write for a new file.');
      if (oldText === newText) throw new GithubError('invalid', 'old_string and new_string are the same.');
      const n = count(file.content, oldText);
      if (n === 0) throw new GithubError('invalid', `old_string was not found in ${p}. Read the file again and copy the exact text, including spaces and indentation.`);
      if (n > 1 && !all) throw new GithubError('invalid', `old_string matches more than one place in ${p}. Add surrounding lines so it matches exactly one, or set replace_all.`);
      const next = n > 1 ? file.content.split(oldText).join(newText) : file.content.replace(oldText, () => newText);
      checkLimits(s, p, next);
      file.content = next;
      if (n > 1 || MARKER.test(oldText) || MARKER.test(newText)) file.whole = true;
      else if (!file.whole) file.edits.push({ search: oldText, replace: newText });
      s.touched = true;
      checkLimits(s, p, next);
      return { path: p, replaced: n > 1 ? 'all' : 1, lines: next.split('\n').length, note: 'Edited in the workspace (not on GitHub). Run the tests with github_run_command; the change is attached to your reply for a pull request.' };
    },

    async write(ctx, token, { repo, ref, path, content }) {
      const s = await useRepo(stateFor(ctx), token, repo, ref);
      const { path: p, file } = await load(s, token, path);
      checkLimits(s, p, content);
      file.content = content; file.whole = true; file.edits = [];
      s.touched = true;
      checkLimits(s, p, content);
      return { path: p, created: file.base === null, lines: content.split('\n').length, note: 'Saved in the workspace (not on GitHub).' };
    },

    async revert(ctx, token, { repo, path }) {
      const s = stateFor(ctx);
      if (!s.repo) return { reverted: [] };
      await useRepo(s, token, repo, '');
      const targets = path ? [checkPath(path)] : [...s.files.keys()];
      const reverted = [];
      for (const p of targets) {
        const f = s.files.get(p);
        if (f && (f.content !== f.base || f.whole)) reverted.push(p);
        s.files.delete(p);
      }
      s.touched = true;
      return { reverted };
    },

    async status(ctx, token, { repo }) {
      const s = stateFor(ctx);
      if (!s.repo && !s.seeds.length) return { repo: repo || null, files: [], note: 'No changes yet.' };
      await useRepo(s, token, repo, '');
      const files = changed(s).map((f) => {
        const [path] = [...s.files.entries()].find(([, v]) => v === f);
        const before = f.base === null ? 0 : f.base.split('\n').length;
        return { path, status: f.base === null ? 'new' : 'changed', lines_before: before, lines_after: f.content.split('\n').length, edits: f.whole ? 'whole file' : f.edits.length };
      });
      return { repo: s.repo, ref: s.ref, files, ...(s.notes.length ? { notes: s.notes.slice(0, 5) } : {}) };
    },

    // A file's text on GitHub (null for a new file), for the runner to restore
    // a file whose changes were reverted.
    async base(ctx, path) {
      const s = stateFor(ctx);
      const f = s.files.get(checkPath(path));
      return f ? f.base : null;
    },

    // Final file contents for the runner ([{ path, content }]), or [].
    async files(ctx, token, repo) {
      const s = stateFor(ctx);
      if (!s.repo && !s.seeds.length) return [];
      if (s.repo && s.repo.toLowerCase() !== String(repo || '').toLowerCase()) return [];
      await useRepo(s, token, repo, '');
      return changed(s).map((f) => ({ path: [...s.files.entries()].find(([, v]) => v === f)[0], content: f.content }));
    },

    // Turn end: when this turn changed code, the whole change set is attached
    // as [[file]] blocks (replacing any the model wrote for the same paths).
    // Returns { text, meta } — meta goes in the reply's response_metadata.
    // maxChars keeps the reply inside its stored size: blocks that do not fit
    // are left out whole (never cut) and named, so nothing is half-attached.
    finish(ctx, reply, { maxChars = 18_500 } = {}) {
      if (onFinish) Promise.resolve().then(() => onFinish(ctx)).catch(() => {});
      const k = keyOf(ctx);
      const s = turns.get(k);
      turns.delete(k);
      if (!s || !s.touched) return { text: reply, meta: null };
      const blocks = [];
      const paths = new Set();
      for (const [path, f] of s.files) {
        if (f.content === f.base && !f.whole) continue;
        paths.add(path);
        if (f.whole || !f.edits.length) blocks.push(`[[file name="${path}"]]\n${f.content}\n[[/file]]`);
        else blocks.push(`[[file name="${path}"]]\n` + f.edits.map((e) => `<<<<<<< SEARCH\n${e.search}\n=======\n${e.replace}\n>>>>>>> REPLACE`).join('\n') + '\n[[/file]]');
      }
      for (const seed of s.seeds) {
        if (paths.has(seed.path)) continue;
        paths.add(seed.path);
        blocks.push(seed.content !== undefined ? `[[file name="${seed.path}"]]\n${seed.content}\n[[/file]]`
          : `[[file name="${seed.path}"]]\n` + seed.edits.map((e) => `<<<<<<< SEARCH\n${e.search}\n=======\n${e.replace}\n>>>>>>> REPLACE`).join('\n') + '\n[[/file]]');
      }
      let text = String(reply || '').replace(FILE_BLOCK, (whole, name) => (paths.has(name.trim()) ? '' : whole)).replace(/\n{3,}/g, '\n\n').trimEnd();
      if (!blocks.length) return { text, meta: null };
      const fitted = [];
      const left = [];
      let room = maxChars - text.length - 300;
      for (const b of blocks) {
        if (b.length + 2 <= room) { fitted.push(b); room -= b.length + 2; } else left.push(/^\[\[file name="([^"]+)"/.exec(b)[1]);
      }
      if (fitted.length) text += '\n\n' + fitted.join('\n\n');
      if (left.length) text += `\n\nNot attached (too large for one reply): ${left.slice(0, 10).join(', ')}. Ask me to continue with ${left.length === 1 ? 'that file' : 'those files'}.`;
      return { text, meta: fitted.length ? { repo: s.repo, ...(s.ref ? { ref: s.ref } : {}), files: fitted.length } : null };
    },

    // Test hook.
    _size: () => turns.size
  };
}
