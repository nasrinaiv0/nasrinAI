import { HttpError } from './http/errors.js';
import { UUID } from './tenants.js';
import { cleanField } from './projects.js';

// NCC (Nasrin Client Connect): the enterprise CRM (docs/ncc.md). This part
// (N1) holds contacts and a fixed deal pipeline. No automation, nothing is
// sent anywhere, and the AI never sees these records.
//
// Access: only signed-in accounts the NasrinAI team turned on (their sign-in
// email in NCC_ACCOUNTS, with NCC_ENABLED=true). Every record is scoped to the
// caller's tenant and user id from their token; the browser is never trusted.
// The data belongs to the business (NasrinAI processes it for them) and is
// kept until they delete it or their account.

export const STAGES = Object.freeze(['lead', 'qualified', 'proposal', 'won', 'lost']);
const LIMITS = { name: 120, email: 254, phone: 40, company: 120, notes: 4000, tag: 30, tags: 10, title: 120, importRows: 500 };
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,63}$/;
const PHONE = /^\+?[0-9 ().-]{3,40}$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_VALUE = 1e12;

const bad = (msg) => new HttpError(400, 'invalid_ncc', msg);
const contactMissing = () => new HttpError(404, 'not_found', 'That contact was not found.');
const dealMissing = () => new HttpError(404, 'not_found', 'That deal was not found.');
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

const publicContact = (c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, company: c.company, tags: c.tags, notes: c.notes, source: c.source, created_at: c.createdAt, updated_at: c.updatedAt });
const publicDeal = (d) => ({ id: d.id, contact_id: d.contactId, title: d.title, stage: d.stage, value: d.value, currency: d.currency, created_at: d.createdAt, updated_at: d.updatedAt });

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
  async function findByEmail(caller, email) {
    if (!email) return null;
    const all = await guard(() => store.listNccContacts(who(caller)));
    return all.find((c) => c.email && c.email.toLowerCase() === email) || null;
  }

  return {
    // For the Space tile: is NCC on for this account? Never throws.
    status(caller) {
      return { enabled: allowed(caller), stages: STAGES };
    },

    async list(caller) {
      need(caller);
      const [contacts, deals] = await guard(() => Promise.all([store.listNccContacts(who(caller)), store.listNccDeals(who(caller))]));
      return {
        contacts: contacts.map(publicContact),
        deals: deals.map(publicDeal),
        stages: STAGES,
        limits: { contacts: settings().maxContacts, deals: settings().maxDeals, import_rows: LIMITS.importRows }
      };
    },

    async createContact(caller, body) {
      need(caller);
      const patch = readContact(body, true);
      await limiter.ncc(caller);
      const all = await guard(() => store.listNccContacts(who(caller)));
      if (all.length >= settings().maxContacts) throw new HttpError(409, 'ncc_full', `You have ${settings().maxContacts} contacts. Delete some first.`);
      const same = patch.email && all.find((c) => c.email && c.email.toLowerCase() === patch.email);
      if (same) throw duplicate(same);
      const c = await guard(() => store.createNccContact({ ...who(caller), ...patch, source: 'manual' }));
      return publicContact(c);
    },

    async updateContact(caller, id, body) {
      need(caller);
      const patch = readContact(body, false);
      await limiter.ncc(caller);
      await ownContact(caller, id);
      if (patch.email) {
        const same = await findByEmail(caller, patch.email);
        if (same && same.id !== id) throw duplicate(same);
      }
      const c = await guard(() => store.updateNccContact({ ...who(caller), id, patch }));
      if (!c) throw contactMissing();
      return publicContact(c);
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
    // counted; nothing is half-saved for a row.
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

    async createDeal(caller, body) {
      need(caller);
      const patch = readDeal(body, true, 'PHP');
      await limiter.ncc(caller);
      await ownContact(caller, patch.contactId);
      const deals = await guard(() => store.listNccDeals(who(caller)));
      if (deals.length >= settings().maxDeals) throw new HttpError(409, 'ncc_full', `You have ${settings().maxDeals} deals. Delete some first.`);
      return publicDeal(await guard(() => store.createNccDeal({ ...who(caller), ...patch })));
    },

    async updateDeal(caller, id, body) {
      need(caller);
      const patch = readDeal(body, false);
      await limiter.ncc(caller);
      if (!UUID.test(String(id))) throw dealMissing();
      const d = await guard(() => store.updateNccDeal({ ...who(caller), id, patch }));
      if (!d) throw dealMissing();
      return publicDeal(d);
    },

    async removeDeal(caller, id) {
      need(caller);
      if (!UUID.test(String(id))) throw dealMissing();
      const ok = await guard(() => store.deleteNccDeal({ ...who(caller), id }));
      if (!ok) throw dealMissing();
      return { deleted: true };
    },

    // Everything in this account's NCC, for the business to keep or move.
    async exportAll(caller) {
      need(caller);
      const [contacts, deals] = await guard(() => Promise.all([store.listNccContacts(who(caller)), store.listNccDeals(who(caller))]));
      return { exported_at: new Date(now()).toISOString(), contacts: contacts.map(publicContact), deals: deals.map(publicDeal) };
    },

    // Deletes every contact and deal in this account's NCC.
    async removeAll(caller, body) {
      need(caller);
      if (obj(body).confirm !== 'DELETE') throw new HttpError(400, 'confirm_required', 'Type DELETE to confirm.');
      await guard(() => store.deleteNccData(who(caller)));
      logger.info('ncc data deleted');
      return { deleted: true };
    }
  };
}
