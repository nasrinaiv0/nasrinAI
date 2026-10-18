# Plugins

Plugins connect Nasrin to a person's other apps. They live in the menu →
**Plugins** (and the desktop side bar).

| Plugin | Status |
|---|---|
| GitHub | Built (`docs/github.md`) |
| Outlook, OneDrive, Teams, Excel, PowerPoint, Canva | Coming soon (listed only) |
| Gmail, Google Calendar | Read plus confirmed write actions (when configured with the matching granted scopes) |
| Google Cloud, Google Meet | Coming soon (listed only) |
| Facebook, Instagram, Threads, X, Messenger, WhatsApp | Coming soon (listed only) |

Connected plugins are listed first, under **Connected**; the rest follow in
their groups. "Coming soon" plugins are shown with plain shared glyphs (not the companies'
logos) and never as connected. Gmail and Google Calendar use the read-only integration
described below; they appear connected only when `/v1/google/status` confirms the
corresponding granted scope. Nothing is sent and calendar events are not modified.

Messenger here means a person's own Messenger. Businesses already answer on
their Facebook Page through Connect (`docs/facebook.md`).

## What each real plugin needs (one at a time, owner approval first)

Every plugin follows the GitHub pattern: the person signs in with the service
(OAuth), tokens are stored only sealed with `CONNECTOR_SECRET_KEY`, the model
gets read tools, and anything that sends, posts, books or changes something
needs the person's Confirm (or a setting they turned on), with Terms/Privacy
updated in the same change.

| Group | Owner setup |
|---|---|
| Microsoft (Outlook, OneDrive, Teams, Excel, PowerPoint) | An app registration in Microsoft Entra ID with Microsoft Graph permissions |
| Canva | A Canva developer integration (Canva Connect) |
| Google (Gmail, Cloud, Meet, Calendar) | A Google Cloud OAuth client; Google's verification for sensitive scopes such as Gmail |
| Meta (Facebook, Instagram, Threads, Messenger, WhatsApp) | A Meta developer app and App Review; WhatsApp through the WhatsApp Business Platform |
| X | An X developer app |

Exact permissions and review steps are set when each plugin is built; they are
not verified here.


Gmail and Calendar are being introduced as a read-only integration. The UI must not label either service connected unless `GET /v1/google/status` confirms it. Sending mail and modifying events remain out of scope for the initial phase.


## Read/write capability status (2026-10-18)

Capabilities are implemented per provider and per action—not inferred from a logo,
catalog entry, or generic "connected" badge.

### Google apps with server-side operations
- **Gmail read:** search messages and read a selected message's full text.
- **Gmail write:** send an email and mark a message read/unread. Sending requires
  `gmail.send`; changing message labels requires `gmail.modify`. Each is a
  `write` tool, so NasrinAI's server-side confirmation flow must approve the exact
  arguments before execution.
- **Calendar read:** list upcoming events.
- **Calendar write:** create, update, and delete events. Event changes require the
  granted `calendar.events` scope and confirmation for each write action.
- **Drive read:** search files and read supported Google Docs/text previews.
- **Meet write:** create a meeting space/link.
- **Keep read:** list recent notes when the account and Google approval support the API.
- **Maps:** build a Directions URL for fleet routing; no Maps API key or OAuth is used.
  This opens Google Maps and does not perform optimization, live traffic analysis, or dispatch.

Tokens remain server-side and sealed at rest. The write tools verify provider scopes from
the per-user/per-tenant connection row before attempting a provider mutation. Provider
responses are checked before returning success. OAuth scope availability and Google API
approval still depend on the owner's Google Cloud configuration.

### Other plugin providers
- **GitHub:** repository/file/PR reads and confirmed pull-request writes are implemented.
- **Meta business channels:** Facebook Page, Instagram, Threads and WhatsApp publishing/
  messaging operations exist in the NCC channel implementation, subject to their own
  token, asset, recipient/window, and app-review requirements. Do not confuse these
  business-channel tools with a personal Messenger connection.
- **Microsoft apps, Canva, X, personal Messenger, and other catalog-only entries:** do not
  claim functional read/write access until each provider has its OAuth flow, least-privilege
  scopes, encrypted token storage, server-side read/write operations, explicit write
  confirmation, audit events, and provider-specific tests. The UI must continue to show
  unsupported integrations as unavailable/coming soon rather than pretending they're connected.

### Required validation
Run `npm test` and CI. Test scope denial, malformed arguments, provider errors, confirmation
replay protection, independent per-app disconnects, and mobile/desktop settings. Google may
require OAuth verification for sensitive/restricted scopes; do not treat a successful code
merge as proof that Google's review has approved them.
