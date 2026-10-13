# NCC — Nasrin Client Connect

Owner request (2026-10-13): add NCC to NasrinAI Space. NCC is a CRM with
automation, in the spirit of GoHighLevel (contacts, pipelines,
conversations, follow-ups) and n8n (visual workflows: trigger → steps).

**Status:** N1 (contacts and pipeline) is built, off by default. N2–N5 are
not built.

**Owner decisions (2026-10-13):**

- NCC is **separate from Connect**.
- It is **for enterprises**, not self-serve: businesses **contact the team**.
  The tile says so, says it is not live yet, and links to
  `support@nasrinai.com` with the subject "NCC (Nasrin Client Connect)
  enterprise enquiry". `[REQUIRES INPUT]`: a dedicated sales address, if
  there is one.
- **Logo:** three triangles. The owner chose **B · Flow**: three rounded
  right-pointing triangles in a row, fading in (automations running step by
  step). Drawn originally for NasrinAI; it stays clear of the Triforce, Citgo,
  Mitsubishi and Google Drive marks. A formal trademark search (IPOPHL, WIPO
  Global Brand Database) is still advised before registration. File:
  `public/space-logos/ncc-logo-flow.svg`; inline on the Space tile.

**Owner decisions (2026-10-13, for N1):**

- **Access:** team-enabled only. NCC works for an account only when
  `NCC_ENABLED=true` and the account's sign-in email is listed in
  `NCC_ACCOUNTS` (comma-separated). Everyone else sees the
  "contact the team" message on the tile.
- **Keep-time:** contacts and deals are kept until the business deletes them,
  or deletes its NasrinAI account.
- **Social channels for automations (N4):** Facebook Pages, Instagram,
  Messenger, Threads and WhatsApp (all through Meta's official APIs).

## N1 — Contacts and pipeline (built)

- **Data:** migration `040_ncc.sql`: `ncc_contacts` (name, email, phone,
  company, up to 10 tags, notes, source `manual` or `import`) and `ncc_deals`
  (contact, name, stage, value, currency). One contact per email in an
  account. Deleting a contact deletes its deals. RLS on, browser roles denied
  (`server_only_deny_browser`), server (service role) only. DB test
  `db/tests/040_ncc.test.sql`.
- **Server:** `src/ncc.js`. Every request: signed in, NCC on, email listed,
  and every query filtered by tenant AND user id from the token. Fields are
  cleaned and checked on the server; limits `NCC_CONTACTS_MAX`,
  `NCC_DEALS_MAX`, `LIMIT_USER_NCC_HOUR`. The AI never sees NCC records and
  nothing is sent anywhere.
- **API:** `GET /v1/ncc/status`, `GET /v1/ncc`, `POST /v1/ncc/contacts`,
  `POST /v1/ncc/contacts/import` (up to 500 rows; bad rows and repeated
  emails skipped and counted), `PUT|DELETE /v1/ncc/contacts/:id`,
  `POST /v1/ncc/deals`, `PUT|DELETE /v1/ncc/deals/:id`, `GET /v1/ncc/export`,
  `POST /v1/ncc/delete-all` (`{ "confirm": "DELETE" }`).
- **Page:** `public/ncc.js`, Settings → NasrinAI Space → NCC (wider sheet on
  desktop). Tabs: Contacts (search, add, edit, delete), Pipeline (columns per
  stage with totals, move a deal with its stage menu), Import & export (CSV or
  Excel read on the device with `public/cleaner.js`; JSON export; delete
  all). No HTML is built from data.
- **Account export and deletion** include NCC records.
- **Privacy Notice 2026-10-13e** describes NCC records (business as
  controller, NasrinAI as processor, kept until deleted). The enterprise and
  data processing agreement is `[REQUIRES INPUT]`.
- **Owner steps:** run `040_ncc.sql` on the staging Supabase first, then
  production; in Vercel set `NCC_ENABLED=true` and `NCC_ACCOUNTS` to the
  business sign-in emails.

## What NCC will be

| Part | What the business owner gets |
|---|---|
| Contacts | People and companies, tags, notes, custom fields, import from CSV (reusing the messy-file cleaner), duplicate check |
| Pipeline | Stages (Lead → Qualified → Proposal → Won/Lost), deals with value and owner, a board view |
| Inbox | One thread per contact, from the channels already in NasrinAI (Messenger via Connect, website chat via SmartChat), later email |
| Tasks & follow-ups | Due dates, reminders, "no reply in 3 days" lists |
| Automations | Workflows of **trigger → conditions → actions** (new lead, stage changed, form sent, no reply after N days → tag, move stage, create task, send a drafted message), built in a simple step editor |
| AI help | Nasrin drafts replies, summarizes a contact's history and suggests the next step. It never sends by itself (see rules) |
| Reports | Leads per source, conversion per stage, response time |

## Rules it must follow (from CLAUDE.md and docs/automation)

- **Tenant-scoped, server-side only:** every table has RLS with server-only
  access, every query is checked for owner and tenant, and the browser is
  never trusted.
- **The AI is untrusted:**
  - it drafts, but anything that sends, posts, books or changes a record
    needs the owner's **Confirm**;
  - an automation runs an outward action only when the owner has turned that
    exact action on for that workflow (the existing
    `src/automation/policy.js` fail-closed policy).
- **Customer data:** businesses' contacts are their customers' personal
  data, so NasrinAI becomes their *processor*. This needs:
  - Terms and Privacy updates, likely a data processing addendum;
  - export and delete per business;
  - a keep-time;
  - no training on customer data.
  - These are owner decisions (`[REQUIRES INPUT]`).
- **Official APIs only** for outside channels; provider tokens sealed with
  `CONNECTOR_SECRET_KEY`.
- **No new runtime packages** (ADR-002). The workflow editor is plain
  JS/CSS like the rest of the app.

## Proposed phases (one PR each, staging first)

1. **N1 Contacts & pipeline:** migration with tables and DB tests, API,
   screens. No automation.
2. **N2 Tasks & inbox:** threads from Connect (Messenger and website chat)
   attached to contacts.
3. **N3 Automations:** the step editor plus a runner (Vercel cron), using the
   existing automation policy. Internal actions only: tag, stage, task.
4. **N4 Outward actions:** send messages and emails only after Confirm or an
   explicit per-workflow allowance, with audit and undo where possible.
5. **N5 AI help & reports.**

## Still needed from the owner

- Enterprise terms: contract and price after a business contacts the team,
  and the data processing agreement (`[REQUIRES INPUT]`).
- Meta app review for N4 (Pages, Instagram, Messenger, Threads, WhatsApp
  permissions).
- Run migrations on a staging Supabase first (required by CLAUDE.md).
