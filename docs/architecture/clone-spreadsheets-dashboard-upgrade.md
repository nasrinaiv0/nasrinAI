# Clone Spreadsheets — Dashboard Upgrade Specification

**Product:** NasrinAI unified user dashboard  
**Module:** Clone Spreadsheets  
**Status:** Requirements documented; implementation and production behavior NOT verified  
**Scope:** Documentation only in this change. No application code, database migration, deployment, or production setting is changed.

## 1. Goal

Add a dedicated spreadsheet workspace to the existing NasrinAI Dashboard. It should reproduce the most valuable spreadsheet workflows users expect from Excel and Google Sheets while acting as a structured, auditable business-recording surface for connected NasrinAI products.

This is an original implementation inspired by common spreadsheet interaction patterns. Do not copy proprietary source code, branding, or protected UI assets from Microsoft or Google.

## 2. Product placement and boundaries

- Add **Clone Spreadsheets** as a dedicated item in the existing dashboard navigation.
- Reuse the existing NasrinAI application, authentication, Supabase project, deployment conventions, and shared UI components where appropriate.
- Do not create a separate repository or Supabase project for this feature unless an architecture audit identifies a concrete requirement and documents the trade-off.
- Keep spreadsheet workspaces, business records, and source product data tenant-scoped. A spreadsheet view must never become a way to bypass the source product's authorization.
- Keep MOVO's financial data isolated from NasrinAI business workspaces unless an explicit, authorized integration is separately designed. Never mix product data by default.

## 3. Spreadsheet workspace capabilities

### Initial usable grid
- Workbooks containing multiple named sheets.
- Editable cells and rows/columns, keyboard navigation, selection, copy/paste, fill/clear, insert/delete rows and columns.
- Rename, duplicate, reorder, and delete sheets/workbooks with confirmation and recoverability.
- Column resize, row height, freeze panes, sort, filter, find/replace, pagination or virtualization for large sheets.
- Cell types and formatting: text, number, currency, date/time, boolean, percentage.
- Data validation, dropdowns, required fields, and per-column constraints.
- Basic formulas/functions and computed columns, with formula parsing isolated from executable code. Define an explicit initial formula allowlist; never evaluate arbitrary JavaScript or SQL from a cell.
- Undo/redo within a session and visible save/sync state.
- Search across authorized workbooks and sheets.
- Responsive, accessible keyboard-operable UI.

### File compatibility
- Import .xlsx and .csv with a preview, column mapping, validation errors, and explicit confirmation before writing.
- Export .xlsx and .csv, with CSV formula-injection protection for cells beginning with dangerous spreadsheet formula prefixes.
- Preserve supported data types and document unsupported Excel features. Do not promise complete Excel/Google Sheets compatibility in the first release.
- Formula evaluation and import parsing must enforce file-size, row-count, execution-time, and memory limits.

### Workbook templates
Provide templates for:
1. Leads & Prospects
2. Sales Pipeline
3. Bookings & Appointments
4. Transactions & Payments
5. Customer Database
6. Daily Activities
7. Inventory & Orders
8. Custom Spreadsheet

Templates are starting structures, not separate authoritative copies of business entities.

## 4. Automatic capture from NasrinAI products

Business activity must flow through a shared, server-side recording pipeline:

**Source product → validated domain event → durable event/outbox record → idempotent processor → canonical business record → spreadsheet view/projection**

Do not make browser-side spreadsheet writes the only record of a booking, lead, sale, or payment. Canonical domain records remain authoritative; sheets provide editable views and reporting. For editable fields that are not canonical business fields, store them as spreadsheet data.

### Event sources and minimum fields

| Source/event | Minimum useful fields | Guardrails |
|---|---|---|
| AI Receptionist inquiry/activity | event ID, timestamp, workspace, channel, intent, outcome, linked contact when available | Store only necessary transcript excerpts; honor consent, retention, and privacy rules |
| Lead created/qualified | lead ID, name/contact where provided, source, interest, status, owner, created/updated timestamps | Distinguish unqualified prospect from qualified lead; avoid duplicate contacts |
| Booking created/updated/cancelled | booking ID, customer reference, service, start/end, timezone, status, assigned staff, source | Use the booking system's verified status; updates must update the linked row rather than append duplicate bookings |
| Sale/order created/updated | sale/order ID, line items or summary, amount, currency, status, customer reference, timestamp | Separate quote, pending order, completed sale, refund, and cancellation |
| Payment/transaction event | provider reference, transaction ID, amount, currency, payment status, timestamps, linked order | Mark paid only from verified provider/server-side status; payment attempt is not a completed payment |
| Manual/imported entry | actor, workspace, import/source reference, timestamp, validated fields | Validate schema and report rejected rows; no silent partial imports |

Use stable IDs and source references in rows. Where possible, show human-friendly columns while preserving canonical IDs in hidden or metadata fields.

### Routing and configuration
- Allow authorized workspace admins to choose which event types populate which workbook/sheet.
- Provide safe default mappings for Leads, Bookings, Sales, Transactions, and Activities.
- Support field mapping, required-field validation, status mapping, and opt-in fields.
- Display event delivery state: queued, processed, retrying, failed, or needs attention.
- Provide an admin-only retry/replay action with audit logging and idempotency protection.
- Never silently drop an event. Alert on repeated failures and expose a reconciliation view.
- Respect user permissions, product boundaries, retention policy, and applicable consent rules when recording receptionist activity.

## 5. Duplicate prevention, consistency, and reliability

- Use an outbox or equivalent durable event-delivery pattern in the same database transaction as the canonical business mutation when feasible.
- Require an idempotency key such as (workspace_id, source_system, source_event_id, event_type); enforce uniqueness in the database.
- Use upsert/update semantics for changes to an existing lead, booking, order, or transaction. Do not append a new row for every update.
- Implement bounded retries with backoff, dead-letter/failed-event tracking, and a controlled replay mechanism.
- Record attempt count, last error category, timestamps, source reference, and processing status; avoid storing secrets or unnecessary sensitive payloads in logs.
- Use reconciliation jobs/reports to compare canonical records against spreadsheet projections and repair missing or stale projections.
- Define conflict rules for simultaneous manual and automated edits. Canonical business fields must be updated through validated domain services, not direct projection edits.
- Do not promise exactly-once delivery from a queue; provide effectively-once outcomes through durable delivery plus idempotent processing.

## 6. Suggested data model (subject to schema audit)

Reuse existing tables and event infrastructure where suitable; do not create duplicate canonical tables before inspecting the current schema.

Potential entities:
- spreadsheet_workbooks: workspace/tenant, owner, title, settings, timestamps, soft-delete state.
- spreadsheet_sheets: workbook, title, order, schema/column definitions, timestamps.
- spreadsheet_rows: sheet, row ID, typed or JSON cell data, optional canonical source type/ID, timestamps, version.
- spreadsheet_revisions or equivalent: actor, operation, changed fields/cells, timestamp, recoverable revision metadata.
- business_events / outbox: tenant, source, event type, stable source event ID, minimal payload, status, attempts, next retry, processed timestamp, safe error metadata.
- spreadsheet_event_mappings: tenant/workspace, source event type, target sheet, field mappings, enabled state.
- spreadsheet_import_jobs: actor, file metadata, validation summary, status, expiry/cleanup metadata.

These are proposed logical entities, not a migration instruction. Audit existing schema, naming, tenancy model, indexes, RLS, and event patterns first. Keep large cell collections and revision history bounded and indexed. Do not store uploaded file contents in database rows if existing storage conventions are more appropriate.

## 7. Security and privacy requirements

- Enable and verify Supabase RLS for every tenant-owned table; test cross-tenant reads and writes explicitly.
- Derive tenant/workspace identity from authenticated server context, not user-supplied request fields alone.
- Apply server-side authorization for workbook access, import/export, row updates, formula evaluation, event mapping, retries, and restore operations.
- Keep service-role credentials server-side only; never expose secrets to the browser or store them in spreadsheet cells/logs.
- Restrict formula functions to an explicit allowlist. Prevent formula injection on exports and avoid formula features that can access external resources or execute code.
- Validate and normalize imported data; protect against oversized files, malformed archives, decompression bombs, resource exhaustion, and unsafe content.
- Minimize receptionist transcripts and customer PII; define retention/deletion behavior and honor source-system permissions.
- Audit manual edits, imports, exports, permission changes, event replays, and changes to mapping rules.
- Provide role-based permissions (owner/admin/manager/staff/read-only) using the existing authorization model where possible.
- Ensure soft deletion, restore, and permanent deletion semantics are documented and consistent with legal/privacy obligations.

## 8. Natural-language AI operations

Users may ask NasrinAI to:
- Add a lead to the correct workbook.
- List tomorrow's bookings.
- Calculate sales totals for a period.
- Find leads without a follow-up.
- Group sales by product or status.
- Create a report from authorized data.
- Detect likely duplicate contacts.
- Build a custom workbook from a described schema.

Execution flow:
1. Parse intent and identify the target workspace/workbook/sheet.
2. Check identity, permissions, and scope.
3. Produce a typed operation plan and preview consequential bulk changes.
4. Validate schema, values, and allowed formulas.
5. Execute through server-side domain/spreadsheet tools.
6. Return an accurate result and record an audit event.
7. For high-impact or bulk/destructive actions, require confirmation and support rollback/recovery.

AI must not claim an event was recorded until the server confirms success. It must not infer that a booking is confirmed or a payment settled without authoritative source status.

## 9. Reporting and dashboard integration

- Provide saved filters/views, totals, grouped summaries, and basic charts after core CRUD and data integrity are stable.
- Allow exports only to users with permission; log export activity.
- Display sync health and recent failures without exposing sensitive payloads to unauthorized users.
- Link each automatically captured row to its source record where the user has permission to open it.
- Keep this module integrated with the dashboard navigation and workspace permissions; do not duplicate billing, usage, or account-management logic already present elsewhere.

## 10. Implementation plan and acceptance criteria

### Phase 0 — Audit first
- Inspect existing dashboard routes/navigation, shared components, auth/session model, workspace/tenant model, Supabase schema/RLS, business records, receptionist/booking/sales flows, logging, and test conventions.
- Map existing canonical entities and event hooks before designing migrations.
- Record exact files, routes, tables, policies, functions, and gaps in the Claude handoff documentation.
- Mark each item implemented, partial, missing, or unverified based on evidence.

**Exit gate:** approved architecture and reuse map; no duplicate source-of-truth tables proposed without justification.

### Phase 1 — Secure spreadsheet foundation
- Add dashboard route and navigation entry.
- Add workbooks/sheets/rows using audited schema conventions.
- Implement RLS, server authorization, basic grid CRUD, save state, and revisions/recovery.
- Add tenant-isolation and authorization tests.

**Exit gate:** authorized users can CRUD their own workbook; cross-tenant access tests fail safely; save/error states are reliable.

### Phase 2 — Useful spreadsheet workflows
- Add sorting/filtering, search, validation/dropdowns, supported formulas, keyboard accessibility, undo/redo.
- Add import/export with previews, bounds, validation reporting, and CSV formula-injection protection.
- Add initial business templates.

**Exit gate:** grid, formulas, import/export, and large-input safeguards have automated tests and documented limitations.

### Phase 3 — Reliable automatic business capture
- Add durable event/outbox processing or adapt the existing equivalent.
- Connect receptionist activities, leads, bookings, sales/orders, and verified payment events.
- Add mappings, idempotency, retries, dead-letter handling, replay, and reconciliation.
- Test repeated delivery, out-of-order updates, cancellations/refunds, provider failure, and partial failure.

**Exit gate:** repeated/replayed events do not create duplicate records; authoritative status is preserved; failures are observable and recoverable.

### Phase 4 — AI spreadsheet tools and reports
- Add typed server-side tools for authorized query/update/report operations.
- Require previews/confirmation for destructive or bulk actions.
- Add basic aggregation, saved views, and reporting.

**Exit gate:** AI operations are permission-checked, auditable, tested, and truthful about success/failure.

### Phase 5 — Production verification
- Run targeted and full test suites, lint/type checks where applicable, RLS/policy tests, import/export security tests, and regression tests for existing dashboard/business flows.
- Reconcile migrations against production before applying any migration.
- Validate deployment preview and production smoke tests with explicit evidence.
- Update change log, implementation matrix, and Claude handoff.

**Exit gate:** no production-ready claim until deployed behavior, access controls, event capture, retry/reconciliation, and rollback/recovery are verified.

## 11. Required test matrix

- Cross-tenant workbook/sheet/row read, write, export, and delete attempts.
- Role-based access and expired/invalid sessions.
- Concurrent edits and revision recovery.
- Formula allowlist, invalid formulas, formula recursion/limits, and injection.
- Malformed/oversized .xlsx, CSV edge cases, duplicate headers, invalid dates/currencies, and rejected-row reporting.
- CSV export formula-injection cases.
- Event replay and duplicate delivery.
- Booking update/cancel, sale update/refund, pending versus settled payment.
- Retry exhaustion, worker crash, out-of-order delivery, and reconciliation repair.
- AI unauthorized target, ambiguous target, bulk/destructive preview, and false-success prevention.
- Existing dashboard/auth/billing/product-isolation regression tests.

## 12. Claude handoff and change documentation

Maintain the canonical dashboard implementation plan and index, and add a traceable change-log entry. Claude's handoff must include:
- The purpose and boundaries of Clone Spreadsheets.
- Current architecture and source-of-truth decisions.
- Existing files/routes/schema/services found during audit.
- Proposed or applied migrations and exact RLS policies.
- Event source-to-sheet mapping table.
- Idempotency, retry, replay, and reconciliation behavior.
- Tests run with exact commands and observed pass/fail counts.
- Deployment/production evidence.
- A clear status per item: **Implemented**, **Partially implemented**, **Not implemented**, or **Not verified**.

Do not claim runtime implementation, migration application, tests, or production verification from this documentation-only change.

## 13. Current status snapshot

| Area | Status | Evidence required to change status |
|---|---|---|
| Product requirements | Documented | Requirements in this document |
| Existing route/schema audit | Not verified in this change | Repository/schema inspection notes |
| Spreadsheet UI/runtime | Not implemented/verified by this change | Code review, UI tests, deployed smoke test |
| RLS/tenant isolation | Not verified for this feature | Policies and adversarial tests |
| Event capture integrations | Not implemented/verified by this change | Source hooks, event records, end-to-end tests |
| Idempotency/retries/reconciliation | Specified, runtime not verified | Worker implementation and failure/replay tests |
| Import/export/formulas | Specified, runtime not verified | Security tests and compatibility matrix |
| Production behavior | Not verified | Deployment and production smoke-test evidence |

**Non-goal for this documentation change:** modifying production code, applying migrations, changing environment variables, or claiming the module is live.
