import { HttpError } from './http/errors.js';
import { UUID } from './tenants.js';
import { cleanField } from './projects.js';
import { STAGES, LIMITS as AUTO_LIMITS, SOCIAL, TEXT_LIMITS, readAutomation, readSocial, matches, fill, catalog } from './ncc-automations.js';
import { createMeta, MetaError } from './ncc-meta.js';
import { seal, open } from './connectors/secret.js';

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
const CHANNEL_NAME = { facebook_page: 'Facebook Page', instagram: 'Instagram', threads: 'Threads', whatsapp: 'WhatsApp' };
const ACTION_CHANNEL = { facebook_post: 'facebook_page', instagram_post: 'instagram', threads_post: 'threads', whatsapp_send: 'whatsapp' };
const ACTION_NAME = { facebook_post: 'Facebook post', instagram_post: 'Instagram post', threads_post: 'Threads post', whatsapp_send: 'WhatsApp message' };
const MAX_CHANNELS = 20;
const TOKEN = /^[A-Za-z0-9_|.-]{20,1000}$/;
const publicChannel = (c) => ({ id: c.id, kind: c.kind, external_id: c.externalId, name: c.name, created_at: c.createdAt });
const publicOutbox = (o) => ({ id: o.id, channel_id: o.channelId, automation_id: o.automationId, contact_id: o.contactId, action: o.action, payload: o.payload, status: o.status, result: o.result, external_ref: o.externalRef, created_at: o.createdAt, updated_at: o.updatedAt });

// A contact's phone for WhatsApp: international format only (+ and 8-15 digits).
export function whatsappNumber(phone) {
  const t = String(phone || '').replace(/[\s().-]/g, '');
  if (!/^\+[1-9][0-9]{7,14}$/.test(t)) throw new HttpError(400, 'invalid_ncc', 'WhatsApp needs the contact\'s number in international format, like +63 917 000 0000.');
  return t.slice(1);
}
const DAY = 86_400_000;

export function createNcc({ store, limiter, config, logger, now = () => Date.now(), meta = null, fetchImpl = null }) {
  const settings = () => config.ncc || { enabled: false, accounts: [] };
  const metaApi = meta || createMeta({ graphVersion: config.ncc?.graphVersion || null, ...(fetchImpl ? { fetchImpl } : {}) });
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

  // ---------- Meta channels and the outbox ----------
  const key = () => config.connectors?.key || null;
  const needKey = () => {
    if (!key()) throw new HttpError(503, 'ncc_channels_off', 'Channels are not available yet: the NasrinAI team needs to finish their setup.');
  };
  const sealName = (caller, kind, externalId) => `ncc:${caller.actor.id}:${kind}:${externalId}`;
  async function ownChannel(caller, id, kind) {
    const gone = () => new HttpError(404, 'not_found', 'That channel is not connected.');
    if (!UUID.test(String(id))) throw gone();
    const ch = await guard(() => store.getNccChannel({ ...who(caller), id }));
    if (!ch) throw gone();
    if (kind && ch.kind !== kind) throw bad(`Choose a ${CHANNEL_NAME[kind]} channel for that step.`);
    return ch;
  }
  const tokenOf = (caller, ch) => open(key(), ch.tokenEnc, { tenantId: caller.tenantId, name: sealName(caller, ch.kind, ch.externalId) });

  // What one post or message says, with {{...}} filled in for the contact.
  function payloadFor(step, event) {
    const max = TEXT_LIMITS[step.type];
    if (step.type === 'whatsapp_send') {
      if (!event.contact) throw bad('A WhatsApp message needs a contact.');
      const to = whatsappNumber(event.contact.phone);
      return step.mode === 'text'
        ? { to, mode: 'text', text: fill(step.text, event).slice(0, max) }
        : { to, mode: 'template', template: step.template, language: step.language };
    }
    const text = fill(step.text || '', event).slice(0, max);
    if (!text && step.type !== 'instagram_post') throw bad('The text is empty.');
    return step.type === 'instagram_post' ? { text, image_url: step.image_url } : { text };
  }

  async function deliver(caller, item) {
    const ch = await ownChannel(caller, item.channelId, ACTION_CHANNEL[item.action]);
    const token = tokenOf(caller, ch);
    const p = item.payload;
    if (item.action === 'facebook_post') return metaApi.postFacebook(ch.externalId, token, p);
    if (item.action === 'instagram_post') return metaApi.postInstagram(ch.externalId, token, p);
    if (item.action === 'threads_post') return metaApi.postThreads(ch.externalId, token, p);
    if (item.action === 'whatsapp_send') return metaApi.sendWhatsapp(ch.externalId, token, p);
    throw bad('That cannot be sent.');
  }

  // Sends one outbox item: claimed pending -> sending once, so a double tap or
  // two runs can never send it twice. Returns the item as it ends.
  async function sendItem(caller, id) {
    needKey();
    const claimed = await guard(() => store.claimNccOutbox({ ...who(caller), id }));
    if (!claimed) return null;
    let status = 'sent';
    let result = 'Sent.';
    let ref = '';
    try {
      ref = String((await deliver(caller, claimed)).id || '').slice(0, 200);
    } catch (err) {
      status = 'failed';
      result = err instanceof MetaError || err instanceof HttpError ? (err.publicMessage || err.message) : 'It could not be sent.';
      logger.warn('ncc send failed', { action: claimed.action, category: err?.category || err?.code || 'error' });
    }
    const done = await guard(() => store.finishNccOutbox({ ...who(caller), id, status, result: String(result).slice(0, 300), externalRef: ref }));
    if (claimed.contactId) await log(caller, claimed.contactId, 'automation', `${ACTION_NAME[claimed.action]}: ${status === 'sent' ? 'sent' : 'not sent. ' + result}`);
    return done;
  }

  // ---------- automations: the runner ----------
  // Runs the account's matching automations for one event. An automation's
  // own changes start other automations only up to depth 2, and one request
  // runs at most 25 steps, so nothing can loop. A failing step stops that
  // automation and is recorded; it never fails the person's own change.
  async function fire(caller, event, budget = { steps: AUTO_LIMITS.perRequest, sends: 5 }) {
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
          done.push(await runStep(caller, step, event, depth, budget, auto));
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

  async function runStep(caller, step, event, depth, budget, auto) {
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
      case 'facebook_post':
      case 'instagram_post':
      case 'threads_post':
      case 'whatsapp_send': {
        const ch = await ownChannel(caller, step.channel, ACTION_CHANNEL[step.type]);
        const payload = payloadFor(step, { ...event, contact });
        const item = await guard(() => store.createNccOutbox({ ...who(caller), channelId: ch.id, automationId: auto?.id || null, contactId: contact?.id || null, action: step.type, payload }));
        // Sends by itself only when the business set this exact step to "auto",
        // and at most 5 sends per request; everything else waits for approval.
        if (step.send !== 'auto' || budget.sends <= 0 || !key()) return `${ACTION_NAME[step.type]} waiting for approval`;
        budget.sends--;
        const sent = await sendItem(caller, item.id);
        return sent && sent.status === 'sent' ? `${ACTION_NAME[step.type]} sent` : `${ACTION_NAME[step.type]} not sent (${sent ? sent.result : 'already handled'})`;
      }
      default:
        throw bad('That step is not available.');
    }
  }

  // An automation's social steps must use this account's own channels, of the right kind.
  async function checkChannels(caller, actions) {
    for (const a of actions || []) if (SOCIAL.includes(a.type)) await ownChannel(caller, a.channel, ACTION_CHANNEL[a.type]).catch((err) => { throw err.status === 404 ? bad('A step uses a channel that is not connected.') : err; });
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
      const [contacts, deals, tasks, automations, channels, outbox] = await guard(() => Promise.all([
        store.listNccContacts(who(caller)), store.listNccDeals(who(caller)), store.listNccTasks(who(caller)), store.listNccAutomations(who(caller)),
        store.listNccChannels(who(caller)), store.listNccOutbox({ ...who(caller), limit: 100 })
      ]));
      return {
        account: { email: caller.actor.email },
        channels: channels.map(publicChannel),
        channels_ready: Boolean(key()),
        outbox: outbox.map(publicOutbox),
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
      await checkChannels(caller, a.actions);
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
      if (patch.actions) await checkChannels(caller, patch.actions);
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

    // ---------- Meta channels ----------
    // Connects the business's own channel with a token from Meta. The token
    // is checked with Meta, sealed, and never sent back.
    async connectChannel(caller, body) {
      need(caller);
      needKey();
      const b = obj(body);
      const token = typeof b.token === 'string' ? b.token.trim() : '';
      if (!TOKEN.test(token)) throw bad('Paste the access token from Meta.');
      await limiter.ncc(caller);
      const existing = await guard(() => store.listNccChannels(who(caller)));
      let found = [];
      try {
        if (b.kind === 'facebook_page') {
          const page = await metaApi.checkPage(token);
          found.push({ kind: 'facebook_page', externalId: page.id, name: page.name });
          if (page.instagram) found.push({ kind: 'instagram', externalId: page.instagram.id, name: page.instagram.name });
        } else if (b.kind === 'threads') {
          const t = await metaApi.checkThreads(token);
          found.push({ kind: 'threads', externalId: t.id, name: t.name });
        } else if (b.kind === 'whatsapp') {
          const w = await metaApi.checkWhatsapp(String(b.phone_number_id || '').trim(), token);
          found.push({ kind: 'whatsapp', externalId: w.id, name: w.name });
        } else throw bad('Choose Facebook Page, Threads or WhatsApp.');
      } catch (err) {
        if (err instanceof MetaError) throw new HttpError(400, 'meta_refused', err.message);
        throw err;
      }
      const fresh = found.filter((f) => !existing.some((e) => e.kind === f.kind && e.externalId === f.externalId));
      if (existing.length + fresh.length > MAX_CHANNELS) throw new HttpError(409, 'ncc_full', `You can connect up to ${MAX_CHANNELS} channels.`);
      const saved = [];
      for (const f of found) saved.push(await guard(() => store.upsertNccChannel({ ...who(caller), ...f, tokenEnc: seal(key(), token, { tenantId: caller.tenantId, name: sealName(caller, f.kind, f.externalId) }) })));
      logger.info('ncc channel connected', { kinds: found.map((f) => f.kind).join(',') });
      return { channels: saved.map(publicChannel) };
    },

    async removeChannel(caller, id) {
      need(caller);
      await ownChannel(caller, id);
      const ok = await guard(() => store.deleteNccChannel({ ...who(caller), id }));
      if (!ok) throw new HttpError(404, 'not_found', 'That channel is not connected.');
      return { deleted: true };
    },

    // ---------- posting and the outbox ----------
    // The person posts now on chosen channels: their tap is the approval.
    async post(caller, body) {
      need(caller);
      needKey();
      const b = obj(body);
      const ids = Array.isArray(b.channel_ids) ? [...new Set(b.channel_ids.map(String))] : [];
      if (!ids.length || ids.length > 10) throw bad('Choose where to post.');
      await limiter.ncc(caller);
      const items = [];
      for (const id of ids) {
        const ch = await ownChannel(caller, id);
        const type = { facebook_page: 'facebook_post', instagram: 'instagram_post', threads: 'threads_post' }[ch.kind];
        if (!type) throw bad('WhatsApp messages go to a contact: send them from the contact.');
        const step = readSocial({ type, channel: ch.id, text: b.text, image_url: b.image_url }, CHANNEL_NAME[ch.kind]);
        items.push(await guard(() => store.createNccOutbox({ ...who(caller), channelId: ch.id, automationId: null, contactId: null, action: type, payload: payloadFor(step, {}) })));
      }
      const out = [];
      for (const it of items) out.push(publicOutbox(await sendItem(caller, it.id)));
      return { outbox: out };
    },

    // A WhatsApp message to one contact, sent now.
    async message(caller, contactId, body) {
      need(caller);
      needKey();
      const b = obj(body);
      const contact = await ownContact(caller, contactId);
      const ch = await ownChannel(caller, b.channel_id, 'whatsapp');
      const step = readSocial({ type: 'whatsapp_send', channel: ch.id, mode: b.mode, template: b.template, language: b.language, text: b.text }, 'WhatsApp');
      await limiter.ncc(caller);
      const item = await guard(() => store.createNccOutbox({ ...who(caller), channelId: ch.id, automationId: null, contactId: contact.id, action: 'whatsapp_send', payload: payloadFor(step, { contact }) }));
      return publicOutbox(await sendItem(caller, item.id));
    },

    async approve(caller, id) {
      need(caller);
      if (!UUID.test(String(id))) throw new HttpError(404, 'not_found', 'That item was not found.');
      await limiter.ncc(caller);
      const done = await sendItem(caller, id);
      if (!done) throw new HttpError(409, 'already_handled', 'That was already sent or discarded.');
      return publicOutbox(done);
    },

    async discard(caller, id) {
      need(caller);
      if (!UUID.test(String(id))) throw new HttpError(404, 'not_found', 'That item was not found.');
      const done = await guard(() => store.discardNccOutbox({ ...who(caller), id }));
      if (!done) throw new HttpError(409, 'already_handled', 'That was already sent or discarded.');
      return publicOutbox(done);
    },

    // ---------- everything ----------
    async exportAll(caller) {
      need(caller);
      const [contacts, deals, tasks, automations, channels, outbox] = await guard(() => Promise.all([
        store.listNccContacts(who(caller)), store.listNccDeals(who(caller)), store.listNccTasks(who(caller)), store.listNccAutomations(who(caller)),
        store.listNccChannels(who(caller)), store.listNccOutbox({ ...who(caller), limit: 1000 })
      ]));
      const timelines = {};
      for (const c of contacts) timelines[c.id] = (await guard(() => store.listNccActivities({ ...who(caller), contactId: c.id, limit: 1000 }))).map(publicActivity);
      return { exported_at: new Date(now()).toISOString(), contacts: contacts.map((c) => ({ ...publicContact(c), timeline: timelines[c.id] })), deals: deals.map(publicDeal), tasks: tasks.map(publicTask), automations: automations.map(publicAutomation), channels: channels.map(publicChannel), outbox: outbox.map(publicOutbox) };
    },

    // Deletes every contact, deal, task, note, automation, channel and outbox item in this account's NCC.
    async removeAll(caller, body) {
      need(caller);
      if (obj(body).confirm !== 'DELETE') throw new HttpError(400, 'confirm_required', 'Type DELETE to confirm.');
      await guard(() => store.deleteNccData(who(caller)));
      logger.info('ncc data deleted');
      return { deleted: true };
    }
  };
}
