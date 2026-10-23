import { HttpError } from '../http/errors.js';
import { cleanUserText } from '../ai/output.js';
import { searchTerms } from './index.js';
import { looksSecret } from './secrets.js';

const SECRET_NOTE = 'Notes cannot keep passwords, keys, codes or card numbers. Save it without the secret.';
// Memory is opt-in: notes are offered and used only when the person turned
// memory on (Settings > Privacy, or the one-time question). Not chosen = off.
const memoryOn = (caller) => caller.actor.type === 'user' && caller.prefs?.memory === true;

// Memory (Phase 7): short notes a signed-in person asked Nasrin to remember.
// Saving is a 'write' tool, so the person confirms each note on a card (a web
// page or file cannot plant a memory). They see and delete notes in Settings;
// notes go with the data export and are deleted with the account.

const MAX_NOTES = 50;
const CONTEXT_CHARS = 1200;

export function memoryTools({ store }) {
  return [{
    name: 'remember',
    description: 'Save a short note about the person for future chats (their preference or fact they asked you to remember). They confirm it first.',
    risk: 'write',
    who: ['user'],
    // Memory off or not chosen yet: not offered, and refused if asked for.
    allowed: memoryOn,
    parameters: { properties: { note: { type: 'string', maxLength: 300 } }, required: ['note'] },
    async run({ note }, ctx) {
      const text = cleanUserText(note, 300);
      if (!text) throw new Error('empty note');
      if (looksSecret(text)) throw new Error('secrets (passwords, keys, codes, card numbers) are never saved; ask the person to rephrase without it');
      const list = await store.listMemories({ tenantId: ctx.tenantId, userId: ctx.actor.id });
      if (list.length >= MAX_NOTES) throw new Error(`at most ${MAX_NOTES} notes; delete some in Settings`);
      await store.addMemory({ tenantId: ctx.tenantId, userId: ctx.actor.id, text });
      return { ok: true, saved: text };
    }
  }];
}

export function createMemory({ store, logger }) {
  const mine = (caller) => {
    if (caller.actor.type !== 'user') throw new HttpError(403, 'forbidden', 'Sign in to use memory.');
    return { tenantId: caller.tenantId, userId: caller.actor.id };
  };
  return {
    // Notes to add to the turn: those sharing words with the message first,
    // then the newest; capped. Signed-in users only. Never throws.
    async context(caller, message) {
      if (!memoryOn(caller)) return null;
      try {
        const list = await store.listMemories({ tenantId: caller.tenantId, userId: caller.actor.id });
        if (!list.length) return null;
        const terms = new Set(searchTerms(message));
        const score = (m) => (searchTerms(m.text).filter((w) => terms.has(w)).length);
        const ordered = [...list].sort((a, b) => score(b) - score(a));
        const picked = [];
        let size = 0;
        for (const m of ordered) {
          if (size + m.text.length > CONTEXT_CHARS) break;
          size += m.text.length;
          picked.push('- ' + m.text);
        }
        return `\n\nNotes this person asked you to remember (use only when relevant):\n${picked.join('\n')}`;
      } catch (err) {
        logger.warn('memory read failed', { error: err.message });
        return null;
      }
    },
    // Consolidate only explicit, durable first-person facts from the user's own
    // message. Never infer personal facts from assistant output or tool results.
    // This runs only when the user has enabled Memory and is failure-isolated by chat.
    async consolidate(caller, rawUserMessage) {
      if (!memoryOn(caller) || typeof rawUserMessage !== 'string') return { saved: false, reason: 'memory_off' };
      try {
        const source = cleanUserText(rawUserMessage, 2000);
        if (!source || looksSecret(source)) return { saved: false, reason: 'not_safe' };
        const candidateLine = source.split(/\r?\n/).map((line) => line.trim()).find((line) =>
          /^i (?:prefer|usually prefer|always prefer|like|use|am working on|am building|am developing|want to|plan to|need to)\b|^my (?:project|app|platform|workflow|preference|goal|plan|role|business) (?:is|uses|should|needs)\b/i.test(line)
        );
        if (!candidateLine) return { saved: false, reason: 'no_durable_fact' };
        const text = cleanUserText(candidateLine, 300);
        if (text.length < 12 || looksSecret(text) || /(?:password|passcode|api[_ -]?key|secret|token|credit card|ssn|social security)/i.test(text)) {
          return { saved: false, reason: 'not_safe' };
        }
        const who = { tenantId: caller.tenantId, userId: caller.actor.id };
        const list = await store.listMemories(who);
        const terms = (value) => new Set((value.toLowerCase().match(/[a-z0-9]{4,}/g) || [])
          .filter((word) => !new Set(['that','this','with','from','have','will','your','about','into','when','then','they','them','their','want','need','plan','project']).has(word)));
        const incoming = terms(text);
        const similarity = (old) => {
          const prior = terms(old.text);
          if (!incoming.size || !prior.size) return 0;
          let common = 0;
          for (const word of incoming) if (prior.has(word)) common++;
          return common / Math.max(incoming.size, prior.size);
        };
        const duplicate = list.find((item) => item.text.toLowerCase() === text.toLowerCase());
        if (duplicate) return { saved: false, reason: 'duplicate' };
        // Replace only a near-duplicate fact; unrelated notes are never removed.
        const stale = list.find((item) => similarity(item) >= 0.7);
        if (list.length >= MAX_NOTES && !stale) return { saved: false, reason: 'memory_full' };
        const id = await store.addMemory({ ...who, text });
        if (stale) await store.deleteMemory({ ...who, id: stale.id });
        return { saved: true, id, replaced: Boolean(stale) };
      } catch (err) {
        logger.warn('automatic memory consolidation failed', { error: err?.message });
        return { saved: false, reason: 'unavailable' };
      }
    },
    async list(caller) {
      return (await store.listMemories(mine(caller))).map((m) => ({ id: m.id, text: m.text, created_at: m.createdAt }));
    },
    // Edit a note: the new text is checked like a new note. Saved as a new
    // note first, then the old one is removed, so a failure never loses it.
    async update(caller, id, raw) {
      const who = mine(caller);
      const text = cleanUserText(raw, 300);
      if (!text) throw new HttpError(400, 'invalid_note', 'Write a note of 1 to 300 characters.');
      if (looksSecret(text)) throw new HttpError(400, 'secret_note', SECRET_NOTE);
      const list = await store.listMemories(who);
      if (!list.some((m) => m.id === String(id))) throw new HttpError(404, 'not_found', 'Not found.');
      const newId = await store.addMemory({ ...who, text });
      await store.deleteMemory({ ...who, id: String(id) });
      return { memory: { id: newId, text } };
    },
    async remove(caller, id) {
      if (!(await store.deleteMemory({ ...mine(caller), id: String(id) }))) throw new HttpError(404, 'not_found', 'Not found.');
      return { deleted: true };
    },
    async removeAll(caller) {
      await store.deleteAllMemories(mine(caller));
      return { deleted: true };
    }
  };
}
