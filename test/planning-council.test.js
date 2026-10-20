import test from 'node:test';
import assert from 'node:assert/strict';
import { planningCouncilEligible, runPlanningCouncil } from '../src/ai/planning-council.js';

test('planning council is opt-in and only eligible for non-sensitive Max/Ultra planning work', () => {
  const base = { enabled: true, tier: 'ultra', task: 'design' };
  assert.equal(planningCouncilEligible(base), true);
  assert.equal(planningCouncilEligible({ ...base, enabled: false }), false);
  assert.equal(planningCouncilEligible({ ...base, tier: 'pro' }), false);
  assert.equal(planningCouncilEligible({ ...base, sensitive: true }), false);
  assert.equal(planningCouncilEligible({ ...base, attachments: [{ kind: 'pdf' }] }), false);
  assert.equal(planningCouncilEligible({ ...base, tools: [{ name: 'write_file' }] }), false);
  assert.equal(planningCouncilEligible({ ...base, currentFactsRequired: true }), false);
});

test('council is bounded, serial, policy-injected, and returns one synthesis packet', async () => {
  const calls = [];
  const result = await runPlanningCouncil({
    enabled: true, tier: 'max', task: 'planning', goal: 'Design a secure service',
    context: 'constraints', maxCalls: 2,
    runCandidate: async (req) => {
      calls.push(req);
      return { text: req.role + ' proposal', spec: { provider: 'openrouter', model: 'configured-model' }, costUsd: 0.001 };
    }
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((x) => x.role), ['brainstorm', 'architect']);
  assert.equal(result.used, true);
  assert.equal(result.findings.length, 2);
  assert.equal(result.costUsd, 0.002);
  assert.match(result.synthesis.messages[0].content, /brainstorm proposal/);
  assert.ok(calls.every((x) => x.maxTokens <= 1200));
});

test('council does not fail the task when all specialists fail and never exposes error messages', async () => {
  const result = await runPlanningCouncil({
    enabled: true, tier: 'ultra', task: 'analysis', goal: 'Compare options',
    runCandidate: async () => { throw new Error('secret provider detail'); }
  });
  assert.equal(result.used, false);
  assert.equal(result.reason, 'council_unavailable');
  assert.ok(result.findings.every((x) => x.unavailable === true));
  assert.equal(JSON.stringify(result).includes('secret provider detail'), false);
});

test('council rejects empty goal and bounds context and role output', async () => {
  await assert.rejects(() => runPlanningCouncil({
    enabled: true, tier: 'max', task: 'planning', goal: '  ', runCandidate: async () => ({ text: 'x' })
  }), /goal is required/);
  const result = await runPlanningCouncil({
    enabled: true, tier: 'max', task: 'planning', goal: 'Plan',
    context: 'x'.repeat(30000), maxInputChars: 200,
    runCandidate: async (req) => {
      assert.ok(req.messages[0].content.length < 1000);
      return { text: 'ok'.repeat(10000) };
    }
  });
  assert.equal(result.findings[0].text.length, 10000);
});

test('council falls back instead of using one model as a fake committee', async () => {
  let calls = 0;
  const result = await runPlanningCouncil({
    enabled: true, tier: 'max', task: 'planning', goal: 'Plan securely',
    runCandidate: async () => {
      calls += 1;
      if (calls > 1) throw new Error('no distinct route');
      return { text: 'Only one model answered', spec: { provider: 'openrouter', model: 'one-model' }, costUsd: 0.001 };
    }
  });
  assert.equal(result.used, false);
  assert.equal(result.reason, 'insufficient_diversity');
  assert.equal(result.findings.filter((x) => x.text).length, 1);
});
