# NCC — Nasrin Client Connect (plan, awaiting owner approval)

Owner request (2026-10-13): add NCC to NasrinAI Space. NCC is a CRM with
automation, in the spirit of GoHighLevel (contacts, pipelines,
conversations, follow-ups) and n8n (visual workflows: trigger → steps).

**Status:** only the Space tile exists. Nothing below is built.

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

## What NCC would be

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

## Owner decisions needed before N1

- Enterprise terms: how businesses are set up after contacting the team
  (accounts, contract, price) (`[REQUIRES INPUT]`).
- Keep-time for contacts and messages, and the data processing terms
  (`[REQUIRES INPUT]`).
- Run migrations on a staging Supabase first (required by CLAUDE.md).
