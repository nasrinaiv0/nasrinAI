import { HttpError } from './http/errors.js';
import { UUID } from './tenants.js';
import { cleanField } from './projects.js';
import { STAGES, LIMITS as AUTO_LIMITS, readAutomation, matches, fill, catalog } from './ncc-automations.js';

// NCC (Nasrin Client Connect): the enterprise CRM (docs/ncc.md), its own app
// at ncc.nasrinai.com. Contacts, a deal pipeline, tasks, each contact's
// timeline, and automations that change only these records. Nothing is sent
// anywhere and the AI never sees these records.
//
// Access: only signed-in accounts the NasrinAI team turned on (their sign-in
// email in NCC_ACCOUNTS, with NCC_ENABLED=true). Every record is scoped to the
// caller's tenant and user id from their token; the browser is never trusted.
// The data belongs to the business (NasrinAI processes it for them) and is
// kept until they delete it or their account.

export { STAGES };
const LIMITS = { name: 120, email: 254, phone: 40, company: 120, notes: 4000, tag: 30, tags: 10, title: 120, task: 200, note: 2000, importRows: 500, tasks: 5000, timeline: 100 };
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,63}$/;
const PHONE = /^\+?[0-9 ().-]{3,40}$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_VALUE = 1e12;

const bad = (msg) => new HttpError(400, 'invalid_ncc', msg);
const contactMissing = () => new HttpError(404, 'not_found', 'That contact was not found.');
const dealMissing = () => new HttpError(404, 'not_found', 'That deal was not found.');
const taskMissing = () => new HttpError(404, 'not_found', 'That task was not found.');
const automationMissing = () => new HttpError(404, 'not_found', 'That automation was not found.');
const obj = (b) => (b && typeof b === 'object' && !Array.isArray(b) ? b : {});

export function cleanEmail(raw) {
  const t = cleanField(raw, LIMITS.email, { label: 'The email' }).toLowerCase();
  if (t && !EMAIL.test(t)) throw bad('That email address does not look right.');
  return t;
}

export function cleanPhone(raw) {
  const t = cleanField(raw, LIMITS.phone, { label: 'The phone number' });
  if (t && (!PHONE.test(t) || (t.match(/[0-9]/g) || []).length < 3)) throw bad('That phone number does not look right.');
  return t;
}

// Up to 10 short tags, lower case, no repeats. Accepts a list or "a, b, c".
export function cleanTags(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : null;
  if (!list) throw bad('Tags are not valid.');
  const out = [];
  for (const t of list) {
    const tag = cleanField(t, LIMITS.tag, { label: 'A tag' }).toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  if (out.length > LIMITS.tags) throw bad(`Use at most ${LIMITS.tags} tags.`);
  return out;
}

export function cleanValue(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*\d+(\.\d{1,2})?\s*$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0 || n >= MAX_VALUE) throw bad('The value must be a number from 0 up.');
  return Math.round(n * 100) / 100;
}

// The contact fields a request may set. creating: name is required.
export function readContact(body, creating) {
  const b = obj(body);
  const patch = {};
  if (creating || 'name' in b) patch.name = cleanField(b.name, LIMITS.name, { required: true, label: 'The name' });
  if ('email' in b) patch.email = cleanEmail(b.email);
  if ('phone' in b) patch.phone = cleanPhone(b.phone);
  if ('company' in b) patch.company = cleanField(b.company, LIMITS.company, { label: 'The company' });
  if ('tags' in b) patch.tags = cleanTags(b.tags);
  if ('notes' in b) patch.notes = cleanField(b.notes, LIMITS.notes, { lines: true, label: 'The notes' });
  if (!creating && !Object.keys(patch).length) throw bad('Nothing to change.');
  return patch;
}

export function readDeal(body, creating, defaultCurrency = 'PHP') {
  const b = obj(body);
  const patch = {};
  if (creating || 'title' in b) patch.title = cleanField(b.title, LIMITS.title, { required: true, label: 'The deal name' });
  if (creating) {
    if (!UUID.test(String(b.contact_id))) throw contactMissing();
    patch.contactId = String(b.contact_id);
  }
  if (creating || 'stage' in b) {
    const stage = b.stage === undefined && creating ? 'lead' : b.stage;
    if (!STAGES.includes(stage)) throw bad('Choose lead, qualified, proposal, won or lost.');
    patch.stage = stage;
  }
  if (creating || 'value' in b) patch.value = cleanValue(b.value);
  if (creating || 'currency' in b) {
    const c = b.currency === undefined || b.currency === '' ? defaultCurrency : String(b.currency).trim().toUpperCase();
    if (!CURRENCY.test(c)) throw bad('Use a three-letter currency code, like PHP or USD.');
    patch.currency = c;
  }
  if (!creating && !Object.keys(patch).length) throw bad('Nothing to change.');
  return patch;
}

// A task: name, an optional due time (ISO date or date-time), done, and an
// optional contact and deal.
export function readTask(body, creating) {
  const b = obj(body);
  const patch = {};
  if (creating || 'title' in b) patch.title = cleanField(b.title, LIMITS.task, { required: true, label: 'The task' });
  if (creating || 'due_at' in b) {
    if (b.due_at === undefined || b.due_at === null || b.due_at === '') patch.dueAt = null;
    else {
      const t = typeof b.due_at === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(b.due_at) ? Date.parse(b.due_at) : NaN;
      if (!Number.isFinite(t)) throw bad('Choose a due date.');
      patch.dueAt = new Date(t).toISOString();
    }
  }
  if ('done' in b) {
    if (typeof b.done !== 'boolean') throw bad('Use done or not done.');
    patch.done = b.done;
  }
  if (creating) {
    for (const [k, out] of [['contact_id', 'contactId'], ['deal_id', 'dealId']]) {
      if (b[k] === undefined || b[k] === null || b[k] === '') patch[out] = null;
      else if (!UUID.test(String(b[k]))) throw k === 'contact_id' ? contactMissing() : dealMissing();
      else patch[out] = String(b[k]);
    }
  }
  if (!creating && !Object.keys(patch).length) throw bad('Nothing to change.');
  return patch;
}

const publicContact = (c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, company: c.company, tags: c.tags, notes: c.notes, source: c.source, created_at: c.createdAt, updated_at: c.updatedAt });
const publicDeal = (d) => ({ id: d.id, contact_id: d.contactId, title: d.title, stage: d.stage, value: d.value, currency: d.currency, created_at: d.createdAt, updated_at: d.updatedAt });
const publicTask = (t) => ({ id: t.id, title: t.title, due_at: t.dueAt, done: t.done, contact_id: t.contactId, deal_id: t.dealId, origin: t.origin, created_at: t.createdAt, updated_at: t.updatedAt });
const publicActivity = (a) => ({ id: a.id, kind: a.kind, text: a.text, created_at: a.createdAt });
const publicAutomation = (a) => ({ id: a.id, name: a.name, enabled: a.enabled, trigger: a.trigger, conditions: a.conditions, actions: a.actions, runs: a.runs, last_run_at: a.lastRunAt, last_result: a.lastResult, created_at: a.createdAt, updated_at: a.updatedAt });
const STAGE_NAME = { lead: 'Lead', qualified: 'Qualified', proposal: 'Proposal', won: 'Won', lost: 'Lost' };
const DAY = 86_400_000;

export function createNcc({ store, limiter, config, logger, now = () => Date.now() }) {
  const settings = () => config.ncc || { enabled: false, accounts: [] };
  // Turned on for this caller? Signed in, NCC on, and their verified sign-in email listed.
  const allowed = (caller) => {
    const s = settings();
    return caller?.actor?.type === 'user' && s.enabled === true && Boolean(caller.actor.email) && s.accounts.includes(String(caller.actor.email).toLowerCase());
  };
  const need = (caller) => {
    if (caller.actor.type !== 'user') throw new HttpError(403, 'sign_in_required', 'Sign in to use NCC.');
    if (!allowed(caller)) throw new HttpError(403, 'ncc_not_enabled', 'NCC is for enterprises. Contact the NasrinAI team to turn it on for your business.');
  };
  const who = (caller) => ({ tenantId: caller.tenantId, userId: caller.actor.id });
  // The NCC tables may not exist yet (migration 040 not run): say so plainly.
  const guard = async (fn) => {
    try { return await fn(); } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err?.code === 'duplicate') throw new HttpError(409, 'duplicate_contact', 'A contact already has that email address.');
      logger.warn('ncc unavailable', { error: err?.message });
      throw new HttpError(503, 'ncc_unavailable', 'NCC is not available right now. Please try again later.');
    }
  };
  const duplicate = (existing) => new HttpError(409, 'duplicate_contact', `${existing.name} already has that email address.`);

  async function ownContact(caller, id) {
    if (!UUID.test(String(id))) throw contactMissing();
    const c = await guard(() => store.getNccContact({ ...who(caller), id }));
    if (!c) throw contactMissing();
    return c;
  }
  async function ownDeal(caller, id) {
    if (!UUID.test(String(id))) throw dealMissing();
    const d = (await guard(() => store.listNccDeals(who(caller)))).find((x) => x.id === id);
    if (!d) throw dealMissing();
    return d;
  }
  async function findByEmail(caller, email) {
    if (!email) return null;
    const all = await guard(() => store.listNccContacts(who(caller)));
    return all.find((c) => c.email && c.email.toLowerCase() === email) || null;
  }
  // The timeline never blocks the change it describes.
  async function log(caller, contactId, kind, text) {
    if (!contactId) return;
    try { await store.addNccActivity({ ...who(caller), contactId, kind, text: String(text).slice(0, LIMITS.note) }); } catch (err) { logger.warn('ncc timeline write failed', { error: err?.message }); }
  }

  // ---------- automations: the runner ----------
  // Runs the account's matching automations for one event. An automation's
  // own changes start other automations only up to depth 2, and one request
  // runs at most 25 steps, so nothing can loop. A failing step stops that
  // automation and is recorded; it never fails the person's own change.
  async function fire(caller, event, budget = { steps: AUTO_LIMITS.perRequest }) {
    const depth = event.depth || 0;
    if (depth >= AUTO_LIMITS.depth || budget.steps <= 0) return;
    let autos;
    try { autos = await store.listNccAutomations(who(caller)); } catch (err) { logger.warn('ncc automations unavailable', { error: err?.message }); return; }
    for (const auto of autos.filter((a) => matches(a, event))) {
      const done = [];
      let result = '';
      for (const step of auto.actions) {
        if (budget.steps <= 0) { result = 'Stopped: too many steps at once.'; break; }
        budget.steps--;
        try {
          done.push(await runStep(caller, step, event, depth, budget));
        } catch (err) {
          result = 'Stopped: ' + (err instanceof HttpError ? err.publicMessage : 'a step could not finish.');
          logger.warn('ncc automation step failed', { step: step.type, error: err?.message });
          break;
        }
      }
      const summary = done.filter(Boolean).join('; ');
      result = (result ? result + (summary ? ' Done before that: ' + summary : '') : 'Done: ' + (summary || 'nothing to change')).slice(0, 300);
      try { await store.recordNccAutomationRun({ ...who(caller), id: auto.id, result, at: new Date(now()).toISOString() }); } catch { /* the run counter is informational */ }
      await log(caller, event.contact?.id, 'automation', `Automation "${auto.name}": ${result}`);
    }
  }

  async function runStep(caller, step, event, depth, budget) {
    const contact = event.contact ? await ownContact(caller, event.contact.id) : null;
    const next = (e) => fire(caller, { ...e, depth: depth + 1 }, budget);
    switch (step.type) {
      case 'add_tag': {
        if (!contact || contact.tags.includes(step.tag)) return '';
        if (contact.tags.length >= LIMITS.tags) throw bad(`A contact can have at most ${LIMITS.tags} tags.`);
        const updated = await guard(() => store.updateNccContact({ ...who(caller), id: contact.id, patch: { tags: [...contact.tags, step.tag] } }));
        await next({ type: 'tag_added', tag: step.tag, contact: updated });
        return `added tag ${step.tag}`;
      }
      case 'remove_tag': {
        if (!contact || !contact.tags.includes(step.tag)) return '';
        await guard(() => store.updateNccContact({ ...who(caller), id: contact.id, patch: { tags: contact.tags.filter((t) => t !== step.tag) } }));
        return `removed tag ${step.tag}`;
      }
      case 'create_task': {
        const tasks = await guard(() => store.listNccTasks(who(caller)));
        if (tasks.length >= LIMITS.tasks) throw bad('The task list is full.');
        const title = fill(step.title, event).slice(0, LIMITS.task) || 'Follow up';
        await guard(() => store.createNccTask({ ...who(caller), title, dueAt: new Date(now() + step.due_days * DAY).toISOString(), contactId: contact?.id || null, dealId: event.deal?.id || null, origin: 'automation' }));
        return `created task "${title}"`;
      }
      case 'add_note': {
        if (!contact) return '';
        await log(caller, contact.id, 'note', fill(step.text, event));
        return 'added a note';
      }
      case 'create_deal': {
        if (!contact) return '';
        const deals = await guard(() => store.listNccDeals(who(caller)));
        if (deals.length >= settings().maxDeals) throw bad('The pipeline is full.');
        const title = fill(step.title, event).slice(0, LIMITS.title) || 'New deal';
        const deal = await guard(() => store.createNccDeal({ ...who(caller), contactId: contact.id, title, stage: 'lead', value: step.value, currency: 'PHP' }));
        await next({ type: 'deal_created', contact, deal });
        return `added deal "${title}"`;
      }
      case 'move_deal': {
        if (!event.deal || event.deal.stage === step.stage) return '';
        const deal = await guard(() => store.updateNccDeal({ ...who(caller), id: event.deal.id, patch: { stage: step.stage } }));
        if (!deal) return '';
        await next({ type: 'deal_stage', contact, deal });
        return `moved the deal to ${STAGE_NAME[step.stage]}`;
      }
      default:
        throw bad('That step is not available.');
    }
  }

  // Person's change -> its events, run after the change is saved.
  const after = (caller, events) => events.reduce((p, e) => p.then(() => fire(caller, e)), Promise.resolve()).catch((err) => logger.warn('ncc automations failed', { error: err?.message }));

  return {
    // For the Space tile and the NCC app: is NCC on for this account? Never throws.
    status(caller) {
      return { enabled: allowed(caller), url: settings().url || null, stages: STAGES };
    },

    async list(caller) {
      need(caller);
      const [contacts, deals, tasks, automations] = await guard(() => Promise.all([
        store.listNccContacts(who(caller)), store.listNccDeals(who(caller)), store.listNccTasks(who(caller)), store.listNccAutomations(who(caller))
      ]));
      return {
        account: { email: caller.actor.email },
        contacts: contacts.map(publicContact),
        deals: deals.map(publicDeal),
        tasks: tasks.map(publicTask),
        automations: automations.map(publicAutomation),
        stages: STAGES,
        catalog: catalog(),
        limits: { contacts: settings().maxContacts, deals: settings().maxDeals, import_rows: LIMITS.importRows }
      };
    },

    // ---------- contacts ----------
    async createContact(caller, body) {
      need(caller);
      const patch = readContact(body, true);
      await limiter.ncc(caller);
      const all = await guard(() => store.listNccContacts(who(caller)));
      if (all.length >= settings().maxContacts) throw new HttpError(409, 'ncc_full', `You have ${settings().maxContacts} contacts. Delete some first.`);
      const same = patch.email && all.find((c) => c.email && c.email.toLowerCase() === patch.email);
      if (same) throw duplicate(same);
      const c = await guard(() => store.createNccContact({ ...who(caller), ...patch, source: 'manual' }));
      await log(caller, c.id, 'created', 'Contact added.');
      await after(caller, [{ type: 'contact_created', contact: c }, ...c.tags.map((tag) => ({ type: 'tag_added', tag, contact: c }))]);
      return publicContact((await store.getNccContact({ ...who(caller), id: c.id }).catch(() => null)) || c);
    },

    async updateContact(caller, id, body) {
      need(caller);
      const patch = readContact(body, false);
      await limiter.ncc(caller);
      const before = await ownContact(caller, id);
      if (patch.email) {
        const same = await findByEmail(caller, patch.email);
        if (same && same.id !== id) throw duplicate(same);
      }
      const c = await guard(() => store.updateNccContact({ ...who(caller), id, patch }));
      if (!c) throw contactMissing();
      const added = patch.tags ? patch.tags.filter((t) => !before.tags.includes(t)) : [];
      if (added.length) await log(caller, id, 'tag', 'Tagged ' + added.join(', ') + '.');
      await after(caller, added.map((tag) => ({ type: 'tag_added', tag, contact: c })));
      return publicContact((await store.getNccContact({ ...who(caller), id }).catch(() => null)) || c);
    },

    async removeContact(caller, id) {
      need(caller);
      await ownContact(caller, id);
      const ok = await guard(() => store.deleteNccContact({ ...who(caller), id }));
      if (!ok) throw contactMissing();
      return { deleted: true };
    },

    // Many contacts at once (a CSV or Excel file read in the browser). Rows
    // that are not valid, or repeat an email already there, are skipped and
    // counted. Imports do not start automations (no surprise mass actions).
    async importContacts(caller, body) {
      need(caller);
      const rows = obj(body).contacts;
      if (!Array.isArray(rows) || !rows.length) throw bad('There are no contacts to add.');
      if (rows.length > LIMITS.importRows) throw bad(`Add at most ${LIMITS.importRows} contacts at a time.`);
      await limiter.ncc(caller);
      const all = await guard(() => store.listNccContacts(who(caller)));
      const emails = new Set(all.map((c) => c.email.toLowerCase()).filter(Boolean));
      let room = settings().maxContacts - all.length;
      const out = { added: 0, duplicates: 0, invalid: 0, over_limit: 0 };
      const fresh = [];
      for (const row of rows) {
        let patch;
        try { patch = readContact(row, true); } catch { out.invalid++; continue; }
        if (patch.email && emails.has(patch.email)) { out.duplicates++; continue; }
        if (room <= 0) { out.over_limit++; continue; }
        if (patch.email) emails.add(patch.email);
        fresh.push({ ...patch, source: 'import' });
        room--;
      }
      // One insert for the whole batch: all of it is saved, or none.
      if (fresh.length) await guard(() => store.createNccContacts({ ...who(caller), contacts: fresh }));
      out.added = fresh.length;
      logger.info('ncc import', { added: out.added, skipped: rows.length - out.added });
      return out;
    },

    // A contact's timeline, newest first, and a note added by the person.
    async timeline(caller, id) {
      need(caller);
      await ownContact(caller, id);
      const items = await guard(() => store.listNccActivities({ ...who(caller), contactId: id, limit: LIMITS.timeline }));
      return { activities: items.map(publicActivity) };
    },
    async addNote(caller, id, body) {
      need(caller);
      const text = cleanField(obj(body).text, LIMITS.note, { required: true, lines: true, label: 'The note' });
      await limiter.ncc(caller);
      await ownContact(caller, id);
      return publicActivity(await guard(() => store.addNccActivity({ ...who(caller), contactId: id, kind: 'note', text })));
    },

    // ---------- deals ----------
    async createDeal(caller, body) {
      need(caller);
      const patch = readDeal(body, true, 'PHP');
      await limiter.ncc(caller);
      const contact = await ownContact(caller, patch.contactId);
      const deals = await guard(() => store.listNccDeals(who(caller)));
      if (deals.length >= settings().maxDeals) throw new HttpError(409, 'ncc_full', `You have ${settings().maxDeals} deals. Delete some first.`);
      const deal = await guard(() => store.createNccDeal({ ...who(caller), ...patch }));
      await log(caller, contact.id, 'deal', `Deal "${deal.title}" added in ${STAGE_NAME[deal.stage]}.`);
      await after(caller, [{ type: 'deal_created', contact, deal }]);
      return publicDeal((await guard(() => store.listNccDeals(who(caller)))).find((d) => d.id === deal.id) || deal);
    },

    async updateDeal(caller, id, body) {
      need(caller);
      const patch = readDeal(body, false);
      await limiter.ncc(caller);
      const before = await ownDeal(caller, id);
      const d = await guard(() => store.updateNccDeal({ ...who(caller), id, patch }));
      if (!d) throw dealMissing();
      if (patch.stage && patch.stage !== before.stage) {
        await log(caller, d.contactId, 'stage', `Deal "${d.title}" moved to ${STAGE_NAME[d.stage]}.`);
        const contact = await store.getNccContact({ ...who(caller), id: d.contactId }).catch(() => null);
        await after(caller, [{ type: 'deal_stage', contact, deal: d }]);
      }
      return publicDeal((await guard(() => store.listNccDeals(who(caller)))).find((x) => x.id === id) || d);
    },

    async removeDeal(caller, id) {
      need(caller);
      if (!UUID.test(String(id))) throw dealMissing();
      const ok = await guard(() => store.deleteNccDeal({ ...who(caller), id }));
      if (!ok) throw dealMissing();
      return { deleted: true };
    },

    // ---------- tasks ----------
    async createTask(caller, body) {
      need(caller);
      const patch = readTask(body, true);
      await limiter.ncc(caller);
      if (patch.contactId) await ownContact(caller, patch.contactId);
      if (patch.dealId) {
        const d = await ownDeal(caller, patch.dealId);
        if (patch.contactId && d.contactId !== patch.contactId) throw bad('That deal belongs to another contact.');
        patch.contactId = d.contactId;
      }
      const tasks = await guard(() => store.listNccTasks(who(caller)));
      if (tasks.length >= LIMITS.tasks) throw new HttpError(409, 'ncc_full', `You have ${LIMITS.tasks} tasks. Delete some first.`);
      const t = await guard(() => store.createNccTask({ ...who(caller), ...patch, origin: 'person' }));
      await log(caller, t.contactId, 'task', `Task "${t.title}" added.`);
      return publicTask(t);
    },

    async updateTask(caller, id, body) {
      need(caller);
      const patch = readTask(body, false);
      await limiter.ncc(caller);
      if (!UUID.test(String(id))) throw taskMissing();
      const before = (await guard(() => store.listNccTasks(who(caller)))).find((t) => t.id === id);
      if (!before) throw taskMissing();
      const t = await guard(() => store.updateNccTask({ ...who(caller), id, patch }));
      if (!t) throw taskMissing();
      if (patch.done === true && !before.done) {
        await log(caller, t.contactId, 'task', `Task "${t.title}" done.`);
        const contact = t.contactId ? await store.getNccContact({ ...who(caller), id: t.contactId }).catch(() => null) : null;
        const deal = t.dealId ? (await store.listNccDeals(who(caller)).catch(() => [])).find((d) => d.id === t.dealId) || null : null;
        await after(caller, [{ type: 'task_done', contact, deal, task: t }]);
      }
      return publicTask(t);
    },

    async removeTask(caller, id) {
      need(caller);
      if (!UUID.test(String(id))) throw taskMissing();
      const ok = await guard(() => store.deleteNccTask({ ...who(caller), id }));
      if (!ok) throw taskMissing();
      return { deleted: true };
    },

    // ---------- automations: the person's own workflows ----------
    async createAutomation(caller, body) {
      need(caller);
      const a = readAutomation(body, true);
      await limiter.ncc(caller);
      const all = await guard(() => store.listNccAutomations(who(caller)));
      if (all.length >= AUTO_LIMITS.automations) throw new HttpError(409, 'ncc_full', `You have ${AUTO_LIMITS.automations} automations. Delete one first.`);
      return publicAutomation(await guard(() => store.createNccAutomation({ ...who(caller), ...a })));
    },

    async updateAutomation(caller, id, body) {
      need(caller);
      if (!UUID.test(String(id))) throw automationMissing();
      const patch = readAutomation(body, false);
      await limiter.ncc(caller);
      const current = (await guard(() => store.listNccAutomations(who(caller)))).find((a) => a.id === id);
      if (!current) throw automationMissing();
      // The whole automation must still make sense after the change.
      readAutomation({ name: current.name, trigger: current.trigger, conditions: current.conditions, actions: current.actions, ...Object.fromEntries(Object.entries(patch)) }, true);
      const a = await guard(() => store.updateNccAutomation({ ...who(caller), id, patch }));
      if (!a) throw automationMissing();
      return publicAutomation(a);
    },

    async removeAutomation(caller, id) {
      need(caller);
      if (!UUID.test(String(id))) throw automationMissing();
      const ok = await guard(() => store.deleteNccAutomation({ ...who(caller), id }));
      if (!ok) throw automationMissing();
      return { deleted: true };
    },

    // ---------- everything ----------
    async exportAll(caller) {
      need(caller);
      const [contacts, deals, tasks, automations] = await guard(() => Promise.all([
        store.listNccContacts(who(caller)), store.listNccDeals(who(caller)), store.listNccTasks(who(caller)), store.listNccAutomations(who(caller))
      ]));
      const timelines = {};
      for (const c of contacts) timelines[c.id] = (await guard(() => store.listNccActivities({ ...who(caller), contactId: c.id, limit: 1000 }))).map(publicActivity);
      return { exported_at: new Date(now()).toISOString(), contacts: contacts.map((c) => ({ ...publicContact(c), timeline: timelines[c.id] })), deals: deals.map(publicDeal), tasks: tasks.map(publicTask), automations: automations.map(publicAutomation) };
    },

    // Deletes every contact, deal, task, note and automation in this account's NCC.
    async removeAll(caller, body) {
      need(caller);
      if (obj(body).confirm !== 'DELETE') throw new HttpError(400, 'confirm_required', 'Type DELETE to confirm.');
      await guard(() => store.deleteNccData(who(caller)));
      logger.info('ncc data deleted');
      return { deleted: true };
    }
  };
}
