import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeProvider } from '../src/ai/fake.js';
import { checkOutcome, repairNote, MAX_REPAIR_ROUNDS } from '../src/auto-repair.js';
import { buildTestApp, serve, bearer, postJson, USER_TOKEN } from './helpers.js';

const ENV = { ROUTING: 'smart', OPENAI_API_KEY: 'sk-test-' + 'k'.repeat(30) };
const runTool = (results) => {
  const seen = [];
  return { seen, tool: {
    name: 'github_run_command', description: 'Run one command in the isolated repository sandbox.', risk: 'read', who: ['user'],
    parameters: { properties: { command: { type: 'string', maxLength: 300 } }, required: ['command'] },
    async run(args) { seen.push(args.command); return results[Math.min(seen.length - 1, results.length - 1)]; }
  } };
};
const isRepairNote = (m) => m.role === 'user' && /\[NasrinAI automatic check/.test(m.content || '');

test('classifies check results: real failures are fixable, environment problems are not', () => {
  assert.deepEqual(checkOutcome('github_run_command', { exit_code: 1, stage: 'command' }), { tool: 'github_run_command', failed: true, fixable: true, exitCode: 1, stage: 'command', error: null });
  assert.equal(checkOutcome('github_run_command', { exit_code: 0 }).failed, false);
  assert.equal(checkOutcome('github_run_command', { error: 'patch_rejected', exit_code: 1 }).fixable, true);
  assert.equal(checkOutcome('github_run_command', { error: 'rate_limited' }).fixable, false);
  assert.equal(checkOutcome('github_run_command', { error: 'github_not_connected' }).fixable, false);
  assert.equal(checkOutcome('github_render_test_screenshot', { test: { exit_code: 2 } }).fixable, true);
  assert.equal(checkOutcome('calculate', { exit_code: 1 }), null, 'only check tools count');
  assert.match(repairNote({ tool: 'github_run_command', exitCode: 1, stage: 'command', error: null }, 1), /automatic check 1\/2\].*exit code 1.*run the failing check again/);
});

test('coding chat: a failed check is detected and the model is sent back to fix and re-run before answering', async () => {
  const { tool, seen } = runTool([{ exit_code: 1, stage: 'command', stderr: 'TypeError at src/a.js:3' }, { exit_code: 0 }]);
  let modelCalls = 0;
  const provider = createFakeProvider({ reply: (req) => {
    modelCalls++;
    const last = req.messages.at(-1);
    if (modelCalls === 1) return { toolCalls: [{ id: 't1', name: 'github_run_command', arguments: '{"command":"npm test"}' }] };
    if (isRepairNote(last)) return { toolCalls: [{ id: 't2', name: 'github_run_command', arguments: '{"command":"npm test"}' }] };
    if (last.role === 'tool' && /"exit_code":0/.test(last.content)) return 'Fixed: npm test now passes.';
    return 'All done, everything works.';
  } });
  const built = buildTestApp({ provider, env: ENV, extraTools: [tool] });
  const srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'fix the failing tests in my repo', coding: true }, bearer(USER_TOKEN))).json();
    assert.equal(r.message.content.includes('Fixed: npm test now passes.'), true, r.message.content);
    assert.equal(seen.length, 2, 'the check ran again after the fix');
    assert.ok(provider.calls.some((c) => c.messages.some(isRepairNote)), 'the automatic check note was sent');
  } finally { await srv.close(); }
});

test('repair rounds are bounded, and failures code cannot fix never trigger one', async () => {
  const always = runTool([{ exit_code: 1, stage: 'command' }]);
  let notes = 0;
  const stubborn = createFakeProvider({ reply: (req) => {
    const last = req.messages.at(-1);
    if (isRepairNote(last)) notes++;
    if (last.role === 'user' && !isRepairNote(last)) return { toolCalls: [{ id: 'a', name: 'github_run_command', arguments: '{"command":"npm test"}' }] };
    if (isRepairNote(last)) return { toolCalls: [{ id: 'b' + notes, name: 'github_run_command', arguments: '{"command":"npm test"}' }] };
    return 'I could not fix it: the test still fails.';
  } });
  let built = buildTestApp({ provider: stubborn, env: ENV, extraTools: [always.tool] });
  let srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'fix my tests', coding: true }, bearer(USER_TOKEN))).json();
    assert.equal(notes, MAX_REPAIR_ROUNDS);
    assert.match(r.message.content, /could not fix it/);
  } finally { await srv.close(); }

  const limited = runTool([{ error: 'rate_limited', message: 'Try again later.' }]);
  const plain = createFakeProvider({ reply: (req) => (req.messages.at(-1).role === 'user' ? { toolCalls: [{ id: 'x', name: 'github_run_command', arguments: '{"command":"npm test"}' }] } : 'The runner is rate limited right now.') });
  built = buildTestApp({ provider: plain, env: ENV, extraTools: [limited.tool] });
  srv = await serve(built.app);
  try {
    const r = await (await postJson(srv.url + '/v1/chat', { message: 'run my tests', coding: true }, bearer(USER_TOKEN))).json();
    assert.match(r.message.content, /rate limited/);
    assert.equal(plain.calls.some((c) => c.messages.some(isRepairNote)), false);
  } finally { await srv.close(); }

  const ordinary = runTool([{ exit_code: 1 }]);
  const chatOnly = createFakeProvider({ reply: (req) => (req.messages.at(-1).role === 'user' ? { toolCalls: [{ id: 'y', name: 'github_run_command', arguments: '{"command":"npm test"}' }] } : 'It failed.') });
  built = buildTestApp({ provider: chatOnly, env: ENV, extraTools: [ordinary.tool] });
  srv = await serve(built.app);
  try {
    await postJson(srv.url + '/v1/chat', { message: 'check 2 things' }, bearer(USER_TOKEN));
    assert.equal(chatOnly.calls.some((c) => c.messages.some(isRepairNote)), false, 'only the coding chat auto-repairs');
  } finally { await srv.close(); }
});
