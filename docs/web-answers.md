# Guest input and web answers (owner decision 2026-10-12)

## Guests on NasrinAI do not have their messages stored

- `keepsInput(conv)` (`src/conversations.js`): for platform-tenant guests,
  `add(conv, 'user', …)` saves nothing and returns `{ id: null }`;
  `setTitle` is a no-op (titles come from what was typed). Applies to chat
  and pictures alike. Nasrin's replies are kept 24 h as before (read aloud,
  Regenerate). Business guests (Connect, Messenger) are unchanged.
- The page keeps the chat's earlier guest messages in memory and sends them as
  `guest_turns` (max 10 used, 4000 chars each, 8000 in all). The server pairs
  them with the saved replies; they only ever become user turns, so they cannot
  pose as Nasrin (audit M1 still holds).
- Regenerate uses the last `guest_turns` entry. Edit needs an account.
- A guest's message never seeds the semantic cache.

## Web answers are kept permanently

- `src/web-answers.js` → table `web_answers` (migration 037): every reply that
  used web search or a shared link's page, with its sources. No tenant, owner,
  session or conversation. Question only for signed-in people. Contact details
  removed. A save failure never affects the reply.
- Owner steps: run `db/migrations/037_web_answers.sql` (staging first).
