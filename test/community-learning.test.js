import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommunityLearning, buildCommunityExample, COMMUNITY_LEARNING_CONSENT_VERSION } from '../src/knowledge/community-learning.js';
import { createMemoryStore } from '../src/store/memory-store.js';
import { PLATFORM_TENANT_ID } from '../src/tenants.js';

const caller = (type = 'guest', id = 'guest-session-1', tenantId = PLATFORM_TENANT_ID) => ({
  tenantId, actor: { type, id }
});

test('community examples are bounded and reject secrets, contact details, and sensitive topics', () => {
  assert.equal(buildCommunityExample({ question: 'How do I set my password?', answer: 'Here are steps that might help you reset the password safely.' }), null);
  assert.equal(buildCommunityExample({ question: 'Email me at nas@example.com for help', answer: 'Here is a sufficiently detailed response for this question.' }), null);
  assert.equal(buildCommunityExample({ question: 'What is my diagnosis?', answer: 'Here is a sufficiently detailed response with general information only.' }), null);
  assert.equal(buildCommunityExample({ question: 'How do I learn JavaScript basics?', answer: 'Start with variables, functions, arrays, and small projects. Practice each concept before combining them.' }).startsWith('Question: '), true);
  assert.equal(buildCommunityExample({ question: 'hi', answer: 'hello' }), null);
});

test('capture is off without current explicit consent and records pending-review examples only', async () => {
  const store = createMemoryStore();
  const learning = createCommunityLearning({ store, logger: { warn() {} } });
  const sample = { question: 'How do I learn JavaScript basics?', answer: 'Start with variables, functions, arrays, and small projects. Practice each concept before combining them.' };
  assert.equal(await learning.capture({ caller: caller(), ...sample }), false);
  await store.recordImprovementConsent({ tenantId: PLATFORM_TENANT_ID, subjectType: 'guest', subjectId: 'guest-session-1', version: COMMUNITY_LEARNING_CONSENT_VERSION, decision: 'granted' });
  assert.equal(await learning.capture({ caller: caller(), ...sample }), true);
  assert.equal(store.improvementExamples.length, 1);
  assert.equal(store.improvementExamples[0].status, 'pending_review');
  assert.equal(store.improvementExamples[0].consentVersion, COMMUNITY_LEARNING_CONSENT_VERSION);
  assert.equal(await learning.capture({ caller: caller('guest', 'guest-session-2'), ...sample }), false);
});

test('withdrawal deletes contributed examples and approved retrieval is platform-scoped', async () => {
  const store = createMemoryStore();
  const learning = createCommunityLearning({ store, logger: { warn() {} } });
  const sample = { question: 'How do I learn JavaScript basics?', answer: 'Start with variables, functions, arrays, and small projects. Practice each concept before combining them.' };
  await store.recordImprovementConsent({ tenantId: PLATFORM_TENANT_ID, subjectType: 'user', subjectId: 'user-1', version: COMMUNITY_LEARNING_CONSENT_VERSION, decision: 'granted' });
  await learning.capture({ caller: caller('user', 'user-1'), ...sample });
  store.improvementExamples[0].status = 'approved';
  assert.match(await learning.context({ tenantId: PLATFORM_TENANT_ID, query: 'learn JavaScript basics' }), /Approved community learning examples/);
  assert.equal(await learning.context({ tenantId: '00000000-0000-0000-0000-000000000002', query: 'learn JavaScript basics' }), null);
  await store.recordImprovementConsent({ tenantId: PLATFORM_TENANT_ID, subjectType: 'user', subjectId: 'user-1', version: COMMUNITY_LEARNING_CONSENT_VERSION, decision: 'withdrawn' });
  await store.deleteImprovementExamplesForSubject({ tenantId: PLATFORM_TENANT_ID, subjectType: 'user', subjectId: 'user-1', reasonCode: 'consent_withdrawal' });
  assert.equal(store.improvementExamples.length, 0);
  assert.equal(await learning.context({ tenantId: PLATFORM_TENANT_ID, query: 'learn JavaScript basics' }), null);
});

test('learning capture refuses non-platform tenants and never breaks chat on storage failure', async () => {
  const learning = createCommunityLearning({ store: { getImprovementConsent: async () => { throw new Error('offline'); } }, logger: { warn() {} } });
  const sample = { question: 'How do I learn JavaScript basics?', answer: 'Start with variables, functions, arrays, and small projects. Practice each concept before combining them.' };
  assert.equal(await learning.capture({ caller: caller('user', 'user-1', '00000000-0000-0000-0000-000000000002'), ...sample }), false);
  assert.equal(await learning.capture({ caller: caller('guest'), ...sample }), false);
});
