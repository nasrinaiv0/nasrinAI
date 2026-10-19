# Plugins

Plugins connect Nasrin to a person's other apps. They live in the menu →
**Plugins** (and the desktop side bar).

| Plugin | Status |
|---|---|
| GitHub | Built (`docs/github.md`) |
| ElevenLabs | Developer catalog entry; API connection and TTS actions not yet implemented (`docs/elevenlabs-plugin.md`) |
| Outlook, OneDrive, Teams, Excel, PowerPoint, Canva | Coming soon (listed only) |
| Gmail, Google Calendar | Read plus confirmed write actions (when configured with the matching granted scopes) |
| Google Cloud, Google Meet | Coming soon (listed only) |
| Facebook, Instagram, Threads, X, Messenger, WhatsApp | Coming soon (listed only) |

Connected plugins are listed first, under **Connected**; the rest follow in
their groups. "Coming soon" plugins are shown with plain shared glyphs (not the companies'
logos) and never as connected. A plugin may show as connected only when its provider's
status endpoint confirms the specific account connection. A connection badge alone does
not prove every action is available: each tool must verify the current account, tenant,
provider scope, and action-specific permission server-side.

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


Gmail and Calendar have read tools plus selected confirmed write tools. The UI must not label either service connected unless `GET /v1/google/status` confirms it. Do not advertise an action until its server-side tool, actual granted OAuth scope, confirmation gate, provider response validation, and regression tests are all present.


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

### Other implemented providers and strict capability boundaries
- **GitHub:** repository/file/PR reads and confirmed pull-request writes are implemented. Writes must stay on a new branch and require explicit confirmation; never push directly to a protected/default branch as an implicit side effect.
- **Meta business channels in Nasrin Client Connect:** only the specific server-side actions actually registered for the connected business account are available. Publishing/messaging must validate token, Page/business asset, recipient or messaging window, media constraints, app review, and provider response. This does not imply personal Messenger access or every Meta product is supported.
- **Google Drive, Meet, Keep and Maps:** treat each action as separately implemented and configuration-gated. Maps URL generation is not route optimization, live traffic, or dispatch. Do not claim full Drive write access unless create/update/delete operations and corresponding tests exist.
- **Microsoft apps, Canva, X, personal Messenger, and other catalog-only entries:** unavailable for read/write until their provider OAuth flow, least-privilege scopes, encrypted token storage, server-side operations, confirmation gate for mutations, audit events, and provider-specific tests are complete. Never infer capability from a logo or catalog listing.

### Required validation
Run `npm test` and CI. Test scope denial, malformed arguments, provider errors, confirmation
replay protection, independent per-app disconnects, and mobile/desktop settings. Google may
require OAuth verification for sensitive/restricted scopes; do not treat a successful code
merge as proof that Google's review has approved them.
