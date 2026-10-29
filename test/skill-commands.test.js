import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSkillCommands } from '../scripts/build-skill-commands.js';
import { resolveSkillCommand, skillCommandPrompt, skillCatalog, skillCommandCount } from '../src/skill-commands.js';
import { createFakeProvider } from '../src/ai/fake.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

const CORE = ['clone', 'blur', 'remove-background', 'upscale', 'image', 'video', 'rewrite', 'translate', 'summarize', 'shorten', 'expand', 'proofread', 'explain', 'debug', 'review', 'research', 'compare', 'plan', 'brainstorm', 'email', 'code', 'analyze', 'automate', 'search', 'browse', 'remember', 'recall', 'library', 'file', 'document', 'connect'];

test('the skill command catalog is generated from the skills list and is up to date', () => {
  const fresh = buildSkillCommands(readFileSync(new URL('../docs/NASRINAI_SKILLS.md', import.meta.url), 'utf8'));
  assert.deepEqual(skillCatalog().commands, fresh, 'run: node scripts/build-skill-commands.js');
  assert.ok(skillCommandCount() >= 650, 'every skill and professional has a command');
});

test('every command is unique, well formed, and never shadows a core command', () => {
  const names = skillCatalog().commands.map((c) => c.command);
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.match(n, /^[a-z0-9][a-z0-9-]{0,47}$/);
  for (const core of CORE) assert.equal(names.includes(core), false, core);
});

test('commands resolve case-insensitively with their text; unknown commands do not', () => {
  const sql = resolveSkillCommand('/SQL-Query-Writing find duplicate emails');
  assert.equal(sql.title, 'SQL query writing');
  assert.equal(sql.rest, 'find duplicate emails');
  assert.equal(resolveSkillCommand('/as-ceo').kind, 'profession');
  assert.equal(resolveSkillCommand('/not-a-real-command hi'), null);
  assert.equal(resolveSkillCommand('please /sql-query-writing'), null, 'only a leading command counts');
  assert.match(skillCommandPrompt(sql), /\/sql-query-writing \(skill: SQL query writing; area: Database Engineering\)/);
  assert.match(skillCommandPrompt({ ...sql, rest: '' }), /say what this skill does/);
  assert.equal(skillCommandPrompt(resolveSkillCommand('/as-ceo')), '', 'professions use Professional AI, not a note');
});

test('chat applies a skill command as a system note and /as-<role> as the chosen professional', async () => {
  const seen = [];
  const provider = createFakeProvider({ models: ['gpt-6-luna'], reply: (req) => { seen.push(req.system); return 'OK'; } });
  const built = buildTestApp({ verifyUser: async (t) => (t === USER_TOKEN ? { id: 'user-1' } : null), provider });
  const srv = await serve(built.app);
  try {
    assert.equal((await postJson(srv.url + '/v1/chat', { message: '/sql-query-writing list customers who ordered twice' }, bearer(USER_TOKEN))).status, 200);
    assert.match(seen.at(-1), /slash command \/sql-query-writing \(skill: SQL query writing/);
    assert.doesNotMatch(seen.at(-1), /\bCEO\b/, 'no professional without /as-ceo');
    assert.equal((await postJson(srv.url + '/v1/chat', { message: '/as-ceo should we open a second branch?' }, bearer(USER_TOKEN))).status, 200);
    assert.match(seen.at(-1), /\bCEO\b/);
    const list = await (await fetch(srv.url + '/v1/commands')).json();
    assert.equal(list.commands.length, skillCommandCount(), 'the catalog is public for the composer menu');
  } finally { await srv.close(); }
});

test('the composer menu script is CSP-safe and loaded by the app', () => {
  const js = readFileSync(new URL('../public/slash-menu.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
  assert.match(html, /<script src="\/slash-menu\.js" defer><\/script>/);
  for (const core of CORE) assert.match(js, new RegExp("'?" + core + "'?: '"), core + ' has a menu label');
});
