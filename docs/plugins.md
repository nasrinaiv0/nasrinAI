# Plugins

Plugins connect Nasrin to a person's other apps. They live in the menu →
**Plugins** (and the desktop side bar).

| Plugin | Status |
|---|---|
| GitHub | Built (`docs/github.md`) |
| Outlook, OneDrive, Teams, Excel, PowerPoint, Canva | Coming soon (listed only) |
| Gmail, Google Cloud, Google Meet, Google Calendar | Coming soon (listed only) |
| Facebook, Instagram, Threads, X, Messenger, WhatsApp | Coming soon (listed only) |

"Coming soon" plugins are shown with plain shared glyphs (not the companies'
logos) and never as connected. Nothing is sent to these services.

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
