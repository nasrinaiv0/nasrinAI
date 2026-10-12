# Direct uploads

Vercel refuses request bodies over 4.5 MB, so files sent inside a chat request
(base64) are capped at `ATTACHMENTS_MAX_MB` (3 MB). Direct uploads lift that:
the browser sends a file straight to a private Supabase Storage bucket and the
chat names it.

## Flow

1. The page asks `POST /v1/uploads` `{ name, type, size }` (any session, guest
   or signed in). The server checks the size against `UPLOADS_MAX_MB`, counts
   the request (`UPLOADS_PER_HOUR` per caller, twice that per IP), and asks
   Supabase for a one-time upload link for one new object. Answer:
   `{ id, upload_url, max_bytes }`.
2. The page `PUT`s the file to `upload_url` (`https://<project>.supabase.co/storage/v1/object/upload/sign/chat-uploads/<object>?token=…`).
3. `POST /v1/chat` names it in `attachments`: `{ name, type, upload: id }`.
   The server reads the object back with the secret key, **deletes it**, and
   checks it exactly like a file sent inside the request
   (`src/attachments.js`: type from the first bytes, ZIP limits, text cut).

Photos are still shrunk on the device (1600 px JPEG, location data removed)
and sent inside the request; direct uploads carry the other files. Pictures
(`/v1/images*`) are unchanged.

## Guarantees

- Bucket `chat-uploads` is private with no storage policies: only the secret
  key (server) and a one-time link can touch it. The secret key never reaches
  the browser; the link works for one object only.
- Object names are `<hash of tenant, actor type, actor id>_<uuid>`; the server
  builds the name from the caller, so nobody can read another person's upload.
- A file is read once and deleted, whether or not the reply then succeeds.
  Uploads never sent are removed by the hourly clean-up
  (`/v1/internal/retention`) once they are an hour old, so at most about two
  hours.
- Per file at most 50 MB (bucket limit); per message `UPLOADS_MAX_MB`
  (default 20 MB), enforced again while reading the file back.
- Signed-in people's files are then kept in their Library exactly as before
  (`src/storage.js`, size limits unchanged); guests' files are not kept.
- The page's CSP allows `connect-src https://*.supabase.co` for the upload
  (`src/http/headers.js`, `vercel.json`).

## Settings

| Setting | Default | |
|---|---|---|
| `UPLOADS_DIRECT` | `false` | `true` switches it on (needs `SUPABASE_URL`, `SUPABASE_SECRET_KEY`) |
| `UPLOADS_MAX_MB` | `20` | 1 to 50, in total per message |
| `UPLOADS_PER_HOUR` | `60` | upload links per caller per hour (twice that per IP) |

A wrong value falls back to the default with a start-up warning; it never takes
the site down. Rollback: `UPLOADS_DIRECT=false` (files go back to the 3 MB
inline path).

## Setup (owner)

1. Supabase (staging first) → SQL editor → run `db/migrations/031_chat_uploads_bucket.sql`.
2. Vercel → Settings → Environment Variables: `UPLOADS_DIRECT` = `true`
   (Preview first, then Production). Redeploy.
3. Test: send a PDF over 3 MB in a chat; Storage → `chat-uploads` should be
   empty again afterwards.

Large files make larger AI requests: some providers limit what one request may
carry (for example Gemini's inline data limit), and a refused file is reported
plainly by the existing provider fallback.
