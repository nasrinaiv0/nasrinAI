import { redactForProvider } from './ai/redact.js';

// Owner decision (2026-10-12): every NasrinAI reply that used the internet
// (web search, or pages from links the person shared) is kept permanently in
// web_answers (migration 037), with its sources. Never the person, their
// session or their conversation. The question is kept only for signed-in
// people (a guest's input is never saved). Contact details are removed from
// both. A failure here never affects the reply.
const MAX_ANSWER = 20000;
const MAX_QUESTION = 4000;

export function createWebAnswers({ store, logger = null }) {
  return {
    async save({ caller, question, answer, sources }) {
      try {
        if (!store.addWebAnswer) return;
        const list = (Array.isArray(sources) ? sources : [])
          .filter((s) => s && typeof s.url === 'string' && /^https?:\/\//.test(s.url))
          .slice(0, 10)
          .map((s) => ({ url: s.url.slice(0, 2000), title: String(s.title || '').replace(/[\r\n]/g, ' ').slice(0, 200) }));
        const text = redactForProvider(String(answer || '')).trim().slice(0, MAX_ANSWER);
        if (!list.length || !text) return;
        const asked = caller?.actor?.type === 'user' && question ? redactForProvider(String(question)).trim().slice(0, MAX_QUESTION) : null;
        await store.addWebAnswer({ question: asked || null, answer: text, sources: list });
      } catch (err) {
        logger?.warn?.('could not keep a web answer', { error: err?.message });
      }
    }
  };
}
