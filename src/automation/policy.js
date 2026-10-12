// AI Automation policy primitives. Provider execution and OAuth callbacks are
// deliberately separate: a listed platform is not considered connected until
// its official OAuth/API setup is configured and the user authorizes it.
export const AUTOMATION_PROVIDERS = Object.freeze({
  gmail: Object.freeze({ family: 'email', status: 'phase_1', actions: ['email.read', 'email.draft', 'email.send'] }),
  google_calendar: Object.freeze({ family: 'productivity', status: 'planned', actions: ['calendar.read', 'calendar.event.create'] }),
  facebook: Object.freeze({ family: 'social', status: 'planned', actions: ['social.post.publish', 'social.comment.read', 'social.comment.reply'] }),
  instagram: Object.freeze({ family: 'social', status: 'planned', actions: ['social.post.publish', 'social.comment.read', 'social.comment.reply'] }),
  linkedin: Object.freeze({ family: 'social', status: 'planned', actions: ['social.post.publish', 'social.comment.read', 'social.comment.reply'] }),
  x: Object.freeze({ family: 'social', status: 'planned', actions: ['social.post.publish', 'social.comment.read', 'social.comment.reply'] }),
  tiktok: Object.freeze({ family: 'social', status: 'planned', actions: ['social.post.publish'] })
});

export const AUTOMATION_ACTIONS = Object.freeze({
  'email.read': Object.freeze({ risk: 'read', approval: false }),
  'email.draft': Object.freeze({ risk: 'draft', approval: false }),
  'email.send': Object.freeze({ risk: 'external_write', approval: true }),
  'social.post.publish': Object.freeze({ risk: 'external_write', approval: true }),
  'social.comment.read': Object.freeze({ risk: 'read', approval: false }),
  'social.comment.reply': Object.freeze({ risk: 'external_write', approval: true }),
  'calendar.read': Object.freeze({ risk: 'read', approval: false }),
  'calendar.event.create': Object.freeze({ risk: 'external_write', approval: true })
});

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const MAX_STEPS = 20;
const MAX_NAME = 100;

export function validateWorkflow(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Workflow must be an object.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > MAX_NAME) throw new TypeError('Workflow name must be 1–100 characters.');
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > MAX_STEPS) {
    throw new TypeError('Workflow must contain 1–20 steps.');
  }
  const steps = input.steps.map((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) throw new TypeError('Step ' + (index + 1) + ' must be an object.');
    if (!Object.hasOwn(AUTOMATION_PROVIDERS, step.provider)) throw new TypeError('Step ' + (index + 1) + ' uses an unsupported provider.');
    if (!ID.test(String(step.id || ''))) throw new TypeError('Step ' + (index + 1) + ' has an invalid id.');
    if (!Object.hasOwn(AUTOMATION_ACTIONS, step.action)) throw new TypeError('Step ' + (index + 1) + ' uses an unsupported action.');
    if (!AUTOMATION_PROVIDERS[step.provider].actions.includes(step.action)) {
      throw new TypeError('Step ' + (index + 1) + ': action is not supported by that provider.');
    }
    return Object.freeze({ id: step.id, provider: step.provider, action: step.action });
  });
  if (new Set(steps.map(s => s.id)).size !== steps.length) throw new TypeError('Step ids must be unique.');
  const autoAllowedActions = Array.isArray(input.autoAllowedActions)
    ? [...new Set(input.autoAllowedActions)]
    : [];
  if (autoAllowedActions.some(action => !Object.hasOwn(AUTOMATION_ACTIONS, action))) {
    throw new TypeError('Automatic action allowlist contains an unknown action.');
  }
  return Object.freeze({
    name,
    enabled: input.enabled === true,
    autoEnabled: input.autoEnabled === true,
    autoAllowedActions: Object.freeze(autoAllowedActions),
    steps: Object.freeze(steps)
  });
}

// External writes require approval unless the owner explicitly enabled this
// workflow and allow-listed the exact action. This is never inferred by AI.
export function actionDecision({ workflow, action, providerAuthorized = false, ownerConfirmed = false }) {
  if (!workflow || workflow.enabled !== true) return Object.freeze({ allowed: false, status: 'workflow_disabled', requiresApproval: false });
  if (!Object.hasOwn(AUTOMATION_ACTIONS, action)) return Object.freeze({ allowed: false, status: 'unsupported_action', requiresApproval: false });
  const spec = AUTOMATION_ACTIONS[action];
  if (!providerAuthorized) return Object.freeze({ allowed: false, status: 'provider_not_authorized', requiresApproval: false });
  const autoConfigured = workflow.autoEnabled === true && Array.isArray(workflow.autoAllowedActions)
    && workflow.autoAllowedActions.includes(action);
  if (spec.approval && !autoConfigured && !ownerConfirmed) {
    return Object.freeze({ allowed: false, status: 'approval_required', requiresApproval: true });
  }
  if (spec.approval && autoConfigured && !ownerConfirmed) {
    return Object.freeze({ allowed: true, status: 'auto_allowed', requiresApproval: false });
  }
  return Object.freeze({ allowed: true, status: ownerConfirmed ? 'owner_confirmed' : 'allowed', requiresApproval: false });
}
