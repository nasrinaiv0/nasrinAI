# Google integrations (Gmail and Calendar)

Google integrations are separate from Supabase Google sign-in. Keep the existing
Supabase callback untouched. This feature uses a dedicated Google OAuth callback:
`https://nasrinai.com/v1/google/callback` (the deployed public URL plus this path).

## Vercel environment variables

Set these in Vercel → NasrinAI project → Settings → Environment Variables:

- `GOOGLE_INTEGRATION_CLIENT_ID`: existing Google OAuth Web application Client ID.
- `GOOGLE_INTEGRATION_CLIENT_SECRET`: its secret, server-side only.
- `CONNECTOR_SECRET_KEY`: existing 64-character hex key used by the connector encryption module. Do not rotate it without a token re-encryption plan.

Do not put credentials in browser code or commit them. The integration is disabled unless these values, the Supabase service configuration, the public URL, and the connector encryption key are all present.

## Google Cloud

In the same Google Cloud project as the existing OAuth Web client, add
`https://nasrinai.com/v1/google/callback` to Authorized redirect URIs. Keep
the existing `https://<project-ref>.supabase.co/auth/v1/callback` entry.
Do not replace or delete the Supabase callback.

Gmail and Calendar APIs must be enabled. The access settings can request these scopes:
- Gmail read-only: `https://www.googleapis.com/auth/gmail.readonly`
- Gmail read/write: `https://www.googleapis.com/auth/gmail.modify` and `https://www.googleapis.com/auth/gmail.send`
- Calendar read-only: `https://www.googleapis.com/auth/calendar.readonly`
- Calendar read/write: `https://www.googleapis.com/auth/calendar.events`

The user must choose the access level and approve the Google consent screen. OAuth scopes are not a substitute for implementing and testing each write operation. The current API surface below remains read-oriented; do not claim the app can send email or modify events until dedicated, authorization-checked write endpoints and confirmation flows are implemented. Google may require OAuth verification for sensitive/restricted Gmail scopes. Test with approved test users first.

## Supabase migration

Run `db/migrations/041_google_connections.sql` after migrations 001–040.
The table is server-only (RLS enabled, browser roles revoked). Access and refresh
tokens are encrypted with AES-256-GCM via the existing connector secret module,
bound to the user's tenant and user ID. The raw token is never returned by an API.

## Current API surface

- `POST /v1/google/connect` accepts `gmail`, `gmail-readwrite`, `calendar`, `calendar-write`, or `both` and returns an authorization URL. It requests the scopes for the selected access level.
- `GET /v1/google/callback` validates signed state and a one-time HttpOnly cookie.
- `GET /v1/google/status` returns connection metadata only.
- `GET /v1/google/gmail/messages` lists message IDs (not message bodies).
- `GET /v1/google/calendar/events` lists primary-calendar events.
- `DELETE /v1/google` disconnects the saved account.

Current data tools remain read-oriented: they do not send email or modify events, and tokens are never exposed to the model/browser. Write scopes are now selectable for OAuth consent, but write actions must not be advertised as functional until dedicated server-side write endpoints, audit logging, and explicit confirmation UX are implemented. Google Drive and other providers remain unavailable until their provider-specific OAuth, API, and tool support is implemented.
