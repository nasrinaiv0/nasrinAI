# Web answers (owner decision 2026-10-12)

Guests' messages and Nasrin's replies in guest chats are kept 24 hours, as
before. Separately, every NasrinAI reply that used the internet is kept
permanently:

- `src/web-answers.js` → table `web_answers` (migration 037): the reply (web
  search, or a shared link's page) with its sources. No tenant, owner, session
  or conversation. The question only for signed-in people (a guest's input is
  kept 24 hours only). Contact details removed. A save failure never affects
  the reply.
- Owner steps: run `db/migrations/037_web_answers.sql` (staging first).
