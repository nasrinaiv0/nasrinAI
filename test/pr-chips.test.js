import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prChipOf, PR_CHIP_LINES } from '../src/github/chips.js';
import { createFakeProvider } from '../src/ai/fake.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

test('pull request chips are made only from GitHub answers, with the diff and merged or not', () => {
  const pr = { repo: 'o/r', number: 336, state: 'closed', merged: true, draft: false, additions: 2555, deletions: 40 };
  assert.deepEqual(prChipOf('github_pr_status', pr), { key: 'o/r#336', line: '[pr:o/r#336 merged +2555 -40]' });
  assert.equal(prChipOf('github_pr_status', { ...pr, merged: false, state: 'open', draft: true }).line, '[pr:o/r#336 draft +2555 -40]');
  assert.equal(prChipOf('github_pr_status', { ...pr, merged: false, state: 'closed' }).line, '[pr:o/r#336 closed +2555 -40]');
  assert.equal(prChipOf('github_list_pull_requests', { repo: 'o/r', pull_requests: [{}, {}, {}] }).line, '[prs:o/r 3]');
  assert.equal(prChipOf('github_pr_status', { error: 'not_found', message: 'x' }), null);
  assert.equal(prChipOf('github_pr_status', { ...pr, repo: 'o/r] [image:x' }), null, 'a strange repo name makes no chip');
  assert.equal(prChipOf('github_pr_status', { ...pr, additions: -1 }), null);
  assert.equal(prChipOf('github_read_file', pr), null, 'other tools make no chip');
  assert.equal('[pr:o/r#1 merged +1 -0]\nDone.\n[prs:o/r 2]\n'.replace(PR_CHIP_LINES, ''), 'Done.\n');
});

test('chat: a chip the model writes itself is dropped (it could claim a merge that never happened)', async () => {
  const provider = createFakeProvider({ models: ['gpt-6-luna'], reply: (req) => (req.messages.at(-1).role === 'tool'
    ? '[pr:o/r#9 merged +100 -0]\nIt is merged.'
    : { text: '', toolCalls: [{ id: 'c1', name: 'calculate', arguments: '{"expression":"2+2"}' }] }) });
  const built = buildTestApp({ provider, env: { ROUTING: 'smart', OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30) } });
  const srv = await serve(built.app);
  try {
    const out = await postJson(srv.url + '/v1/chat', { message: 'calculate 2+2 and check pr 9' }, bearer(USER_TOKEN)).then((r) => r.json());
    assert.equal(out.message.content, 'It is merged.');
  } finally { await srv.close(); }
});

test('the app shows the chips, and New chat in the coding chat stays in Code and the same project', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /const PR_CHIP = /);
  assert.match(app, /if \(chips\.length\) el\.appendChild\(prChips\(chips\)\)/);
  assert.match(app, /\$\('newChat'\)\.addEventListener\('click', \(\) => \(codingProject \? enterCoding\(codingProject\) : startNewChat\(\)\)\)/);
  assert.match(app, /\$\('codingExit'\)\.addEventListener\('click', \(\) => \{ setCoding\(null\); startNewChat\(\); \}\)/, 'leaving Code is still the leave button');
  const chat = await readFile(new URL('../src/chat.js', import.meta.url), 'utf8');
  assert.match(chat, /ownChips\.has\(line\.trim\(\)\)/);
  const { CODING_CHAT_RULE } = await import('../src/coding.js');
  assert.match(CODING_CHAT_RULE, /Every reply in this chat ends with this Summary block/);
});
