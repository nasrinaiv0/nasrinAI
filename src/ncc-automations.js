import { HttpError } from './http/errors.js';
import { cleanField } from './projects.js';

// NCC automations (docs/ncc.md): "when this happens, if these all match, do
// these". The business builds them step by step; the server checks every
// part against the lists below and never runs anything else. The AI cannot
// create, change or start an automation.
//
// The actions only change the business's own NCC records (tags, tasks,
// notes, deals). Posting or sending to Facebook, Instagram, Messenger,
// Threads or WhatsApp is listed as planned: it needs each business's Meta
// connection and Meta's app review first, and is refused until then.

export const STAGES = Object.freeze(['lead', 'qualified', 'proposal', 'won', 'lost']);

export const TRIGGERS = Object.freeze({
  contact_created: { label: 'A contact is added' },
  tag_added: { label: 'A tag is added to a contact', param: 'tag' },
  deal_created: { label: 'A deal is added' },
  deal_stage: { label: 'A deal moves to a stage', param: 'stage' },
  task_done: { label: 'A task is completed' }
});

// field -> the comparisons it allows. Deal fields only match when the event has a deal.
export const FIELDS = Object.freeze({
  'contact.tags': ['has', 'not_has'],
  'contact.company': ['equals', 'contains', 'is_set', 'not_set'],
  'contact.email': ['is_set', 'not_set'],
  'contact.phone': ['is_set', 'not_set'],
  'contact.source': ['equals'],
  'deal.value': ['gte', 'lte'],
  'deal.stage': ['equals']
});

export const ACTIONS = Object.freeze({
  add_tag: { label: 'Add a tag', params: ['tag'] },
  remove_tag: { label: 'Remove a tag', params: ['tag'] },
  create_task: { label: 'Create a task', params: ['title', 'due_days'] },
  add_note: { label: 'Add a note to the timeline', params: ['text'] },
  create_deal: { label: 'Add a deal', params: ['title', 'value'] },
  move_deal: { label: 'Move the deal to a stage', params: ['stage'], needsDeal: true }
});

// Outward actions the business asked for (owner, 2026-10-13). Shown as
// planned; refused by the server until the Meta connection is built.
export const PLANNED_ACTIONS = Object.freeze({
  facebook_post: 'Post on a Facebook Page',
  instagram_post: 'Post on Instagram',
  threads_post: 'Post on Threads',
  messenger_send: 'Send a Messenger message',
  whatsapp_send: 'Send a WhatsApp message'
});

export const LIMITS = Object.freeze({ automations: 50, conditions: 10, actions: 10, depth: 2, perRequest: 25 });

const bad = (msg) => new HttpError(400, 'invalid_automation', msg);
const obj = (b) => (b && typeof b === 'object' && !Array.isArray(b) ? b : null);
const tagOf = (raw, label) => {
  const t = cleanField(raw, 30, { required: true, label }).toLowerCase();
  if (t.includes(',')) throw bad(`${label} cannot contain a comma.`);
  return t;
};
const stageOf = (raw) => {
  if (!STAGES.includes(raw)) throw bad('Choose lead, qualified, proposal, won or lost.');
  return raw;
};

function readTrigger(raw) {
  const t = obj(raw);
  if (!t || !Object.hasOwn(TRIGGERS, t.type)) throw bad('Choose what starts the automation.');
  if (t.type === 'tag_added') return { type: t.type, tag: tagOf(t.tag, 'The tag') };
  if (t.type === 'deal_stage') return { type: t.type, stage: stageOf(t.stage) };
  return { type: t.type };
}

function readCondition(raw, i) {
  const c = obj(raw);
  if (!c || !Object.hasOwn(FIELDS, c.field)) throw bad(`Condition ${i + 1}: choose a field.`);
  if (!FIELDS[c.field].includes(c.op)) throw bad(`Condition ${i + 1}: that comparison does not fit the field.`);
  if (c.op === 'is_set' || c.op === 'not_set') return { field: c.field, op: c.op };
  if (c.field === 'contact.tags') return { field: c.field, op: c.op, value: tagOf(c.value, `Condition ${i + 1}: the tag`) };
  if (c.field === 'deal.stage') return { field: c.field, op: c.op, value: stageOf(c.value) };
  if (c.field === 'contact.source') {
    if (c.value !== 'manual' && c.value !== 'import') throw bad(`Condition ${i + 1}: choose added by hand or imported.`);
    return { field: c.field, op: c.op, value: c.value };
  }
  if (c.field === 'deal.value') {
    const n = Number(c.value);
    if (!Number.isFinite(n) || n < 0 || n >= 1e12) throw bad(`Condition ${i + 1}: the value must be a number from 0 up.`);
    return { field: c.field, op: c.op, value: n };
  }
  return { field: c.field, op: c.op, value: cleanField(c.value, 120, { required: true, label: `Condition ${i + 1}: the text` }) };
}

function readAction(raw, i) {
  const a = obj(raw);
  if (a && Object.hasOwn(PLANNED_ACTIONS, a.type)) throw bad(`Step ${i + 1}: "${PLANNED_ACTIONS[a.type]}" is not available yet. It needs your Meta connection first.`);
  if (!a || !Object.hasOwn(ACTIONS, a.type)) throw bad(`Step ${i + 1}: choose what to do.`);
  const label = `Step ${i + 1}`;
  switch (a.type) {
    case 'add_tag':
    case 'remove_tag':
      return { type: a.type, tag: tagOf(a.tag, `${label}: the tag`) };
    case 'create_task': {
      const days = a.due_days === undefined || a.due_days === '' ? 1 : Number(a.due_days);
      if (!Number.isInteger(days) || days < 0 || days > 365) throw bad(`${label}: due in 0 to 365 days.`);
      return { type: a.type, title: cleanField(a.title, 200, { required: true, label: `${label}: the task` }), due_days: days };
    }
    case 'add_note':
      return { type: a.type, text: cleanField(a.text, 1000, { required: true, lines: true, label: `${label}: the note` }) };
    case 'create_deal': {
      const v = a.value === undefined || a.value === '' ? 0 : Number(a.value);
      if (!Number.isFinite(v) || v < 0 || v >= 1e12) throw bad(`${label}: the value must be a number from 0 up.`);
      return { type: a.type, title: cleanField(a.title, 120, { required: true, label: `${label}: the deal name` }), value: Math.round(v * 100) / 100 };
    }
    case 'move_deal':
      return { type: a.type, stage: stageOf(a.stage) };
    default:
      throw bad(`${label}: choose what to do.`);
  }
}

// The checked automation, or a 400 that says what to fix.
export function readAutomation(body, creating) {
  const b = obj(body) || {};
  const out = {};
  if (creating || 'name' in b) out.name = cleanField(b.name, 100, { required: true, label: 'The name' });
  if (creating || 'enabled' in b) {
    if (b.enabled !== undefined && typeof b.enabled !== 'boolean') throw bad('Turn it on or off.');
    out.enabled = b.enabled === true;
  }
  if (creating || 'trigger' in b) out.trigger = readTrigger(b.trigger);
  if (creating || 'conditions' in b) {
    const list = b.conditions === undefined ? [] : b.conditions;
    if (!Array.isArray(list) || list.length > LIMITS.conditions) throw bad(`Use at most ${LIMITS.conditions} conditions.`);
    out.conditions = list.map(readCondition);
  }
  if (creating || 'actions' in b) {
    if (!Array.isArray(b.actions) || !b.actions.length || b.actions.length > LIMITS.actions) throw bad(`Add 1 to ${LIMITS.actions} steps.`);
    out.actions = b.actions.map(readAction);
  }
  const trigger = out.trigger;
  const actions = out.actions;
  if (trigger && actions) {
    const hasDeal = trigger.type === 'deal_created' || trigger.type === 'deal_stage';
    if (!hasDeal && actions.some((a) => ACTIONS[a.type].needsDeal)) throw bad('"Move the deal" works only when a deal starts the automation.');
    // An automation that undoes its own start would run in circles.
    if (trigger.type === 'tag_added' && actions.some((a) => a.type === 'remove_tag' && a.tag === trigger.tag)) throw bad('An automation cannot remove the tag that starts it.');
  }
  if (!creating && !Object.keys(out).length) throw bad('Nothing to change.');
  return out;
}

// Does this automation start for this event?
export function matches(auto, event) {
  if (!auto.enabled || auto.trigger.type !== event.type) return false;
  if (auto.trigger.type === 'tag_added' && auto.trigger.tag !== event.tag) return false;
  if (auto.trigger.type === 'deal_stage' && auto.trigger.stage !== event.deal?.stage) return false;
  const c = event.contact || {};
  const d = event.deal || null;
  for (const cond of auto.conditions || []) {
    const [scope, key] = cond.field.split('.');
    if (scope === 'deal' && !d) return false;
    const v = scope === 'deal' ? d[key] : c[key];
    const text = String(v ?? '').toLowerCase();
    const want = typeof cond.value === 'string' ? cond.value.toLowerCase() : cond.value;
    const ok = cond.op === 'has' ? (c.tags || []).includes(want)
      : cond.op === 'not_has' ? !(c.tags || []).includes(want)
        : cond.op === 'equals' ? text === String(want)
          : cond.op === 'contains' ? text.includes(String(want))
            : cond.op === 'is_set' ? text !== ''
              : cond.op === 'not_set' ? text === ''
                : cond.op === 'gte' ? Number(v) >= want
                  : cond.op === 'lte' ? Number(v) <= want : false;
    if (!ok) return false;
  }
  return true;
}

// {{contact.name}} and friends in task names and notes. Only these fields.
export function fill(template, { contact = {}, deal = null } = {}) {
  const first = String(contact.name || '').split(/\s+/)[0] || '';
  const values = {
    'contact.name': contact.name, 'contact.first_name': first, 'contact.company': contact.company,
    'contact.email': contact.email, 'contact.phone': contact.phone,
    'deal.title': deal?.title, 'deal.value': deal ? String(deal.value) : '', 'deal.stage': deal?.stage
  };
  return String(template).replace(/\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/g, (m, k) => (Object.hasOwn(values, k) ? String(values[k] ?? '') : m));
}

// What the page needs to build the editor.
export function catalog() {
  return {
    triggers: Object.entries(TRIGGERS).map(([type, t]) => ({ type, label: t.label, param: t.param || null })),
    fields: Object.entries(FIELDS).map(([field, ops]) => ({ field, ops })),
    actions: Object.entries(ACTIONS).map(([type, a]) => ({ type, label: a.label, params: a.params, needs_deal: Boolean(a.needsDeal) })),
    planned: Object.entries(PLANNED_ACTIONS).map(([type, label]) => ({ type, label })),
    limits: { automations: LIMITS.automations, conditions: LIMITS.conditions, actions: LIMITS.actions }
  };
}
