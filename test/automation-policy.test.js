import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTOMATION_PROVIDERS, actionDecision, validateWorkflow } from '../src/automation/policy.js';

const workflow = (overrides = {}) => validateWorkflow({
  name: 'Customer follow-up',
  enabled: true,
  steps: [{ id: 'draft', provider: 'gmail', action: 'email.draft' }],
  ...overrides
});

test('declares requested providers while keeping social integrations planned', () => {
  for (const id of ['gmail', 'facebook', 'instagram', 'linkedin', 'x', 'tiktok']) assert.ok(AUTOMATION_PROVIDERS[id], id);
  assert.equal(AUTOMATION_PROVIDERS.gmail.status, 'phase_1');
  for (const id of ['facebook', 'instagram', 'linkedin', 'x', 'tiktok']) assert.equal(AUTOMATION_PROVIDERS[id].status, 'planned');
});

test('validates step count, provider/action compatibility, unique ids and auto allowlists', () => {
  assert.throws(() => workflow({ steps: [] }), /1–20 steps/);
  assert.throws(() => workflow({ steps: [{ id: 'send', provider: 'gmail', action: 'social.post.publish' }] }), /not supported/);
  assert.throws(() => workflow({ steps: [{ id: 'same', provider: 'gmail', action: 'email.read' }, { id: 'same', provider: 'gmail', action: 'email.draft' }] }), /unique/);
  assert.throws(() => workflow({ autoAllowedActions: ['account.delete'] }), /unknown action/);
});

test('defaults external writes to approval even if an AI proposes them', () => {
  assert.deepEqual(actionDecision({ workflow: workflow(), action: 'email.send', providerAuthorized: true }), {
    allowed: false, status: 'approval_required', requiresApproval: true
  });
});

test('automatic external writes require explicit enablement and an exact action allowlist', () => {
  const notEnabled = workflow({ autoAllowedActions: ['email.send'] });
  assert.equal(actionDecision({ workflow: notEnabled, action: 'email.send', providerAuthorized: true }).status, 'approval_required');
  const enabled = workflow({ autoEnabled: true, autoAllowedActions: ['email.send'] });
  assert.equal(actionDecision({ workflow: enabled, action: 'email.send', providerAuthorized: true }).status, 'auto_allowed');
  assert.equal(actionDecision({ workflow: enabled, action: 'social.post.publish', providerAuthorized: true }).status, 'approval_required');
});

test('blocks disabled workflows and providers without authorization', () => {
  const w = workflow({ autoEnabled: true, autoAllowedActions: ['email.send'] });
  assert.equal(actionDecision({ workflow: w, action: 'email.send' }).status, 'provider_not_authorized');
  assert.equal(actionDecision({ workflow: { ...w, enabled: false }, action: 'email.read', providerAuthorized: true }).status, 'workflow_disabled');
});

test('read and draft actions do not require approval, but still require provider authorization', () => {
  assert.equal(actionDecision({ workflow: workflow(), action: 'email.draft', providerAuthorized: true }).status, 'allowed');
  assert.equal(actionDecision({ workflow: workflow(), action: 'email.read' }).status, 'provider_not_authorized');
});
