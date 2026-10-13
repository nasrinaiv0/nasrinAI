# GitHub in the coding chat

Nasrin reads GitHub repositories and opens pull requests for the person,
from the coding chat (Code in the menu). Built on Node's own `fetch`
(ADR-002: no Octokit, no packages).

## What it can do

| Who | Can |
|---|---|
| Anyone (guest or signed in) | Ask about a **public** repository: Nasrin reads it with read-only tools (`github_repo_info`, `github_list_files`, `github_read_file`, `github_recent_commits`). Without a GitHub connection GitHub allows about 60 reads an hour per server address. |
| Signed in + GitHub connected | The same with their own GitHub token (higher limit, plus private repositories the app is installed on), and **Open pull request** under coding replies that contain files. |

Never: merge, push to an existing branch, force-push, delete branches or files,
or act on the model's own say-so. The model only has the read tools; a pull
request is opened only by the page, after the person taps **Confirm**
(`POST /v1/github/pull-requests` requires `confirm: true` and a signed-in
person). Repository text is marked to the model as data, not instructions.

## How a pull request is made (`src/github/api.js`)

1. Check the person can push to the repository.
2. Read the base branch's commit (the default branch unless one is given).
3. One new tree (files added or replaced, text only, up to 20 files / 500 KB, no `..`, no `.git/`).
4. One commit on top, then a **new** branch `nasrin/<title>-<time>`.
5. Open the pull request into the base branch. The base branch is never changed.

At most 20 pull requests per person per hour.

## Sign-in and tokens (`src/github/index.js`)

- `POST /v1/github/connect` (signed in) → GitHub's authorize URL. The `state`
  is HMAC-signed (person, expiry 10 min, hash of a one-time `nasrin_gh`
  cookie, HttpOnly, path `/v1/github`), so the answer can only finish in the
  browser that started it, for that person.
- `GET /v1/github/callback` exchanges the code, reads the GitHub user name and
  stores the tokens **sealed** (AES-256-GCM with `CONNECTOR_SECRET_KEY`, bound
  to the person) in `github_connections` (migration 038; server-only, no
  browser access). Back to `/?github=connected` or `failed`; back from
  installing the app (no state) to `/?github=installed`.
- Expiring user tokens are refreshed a minute before they end; a refused
  refresh deletes the connection.
- `GET /v1/github/status`, `GET /v1/github/repos`, `DELETE /v1/github`
  (asks GitHub to drop the grant, then deletes the row). Deleting the account
  deletes the connection; the data export shows only the user name.

## Settings

| Env var | |
|---|---|
| `GITHUB_APP_CLIENT_ID` | GitHub App → Client ID |
| `GITHUB_APP_CLIENT_SECRET` | GitHub App → Client secret (sensitive) |
| `GITHUB_APP_SLUG` | the app's URL name, for "Choose repositories" |
| `CONNECTOR_SECRET_KEY` | required (already used by connectors) |

Missing or invalid → GitHub is off with a warning; the read tools still work
for public repositories without a token.

## Owner setup (once)

1. GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**.
   - Name: NasrinAI. Homepage: `https://nasrinai.com`.
   - Callback URL: `https://nasrinai.com/v1/github/callback`.
   - Turn on **Expire user authorization tokens**. Leave "Request user
     authorization (OAuth) during installation" off.
   - Setup URL (optional): `https://nasrinai.com/v1/github/callback`.
   - Webhook: turn **Active** off.
   - Repository permissions: **Contents: Read and write**, **Pull requests:
     Read and write**, **Metadata: Read-only**. Nothing else.
   - Where can it be installed: **Any account**.
2. Create the app, then **Generate a new client secret**.
3. Vercel → Settings → Environment Variables (Preview first, then Production):
   `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG`.
4. Supabase SQL editor (staging first): run `db/migrations/038_github_connections.sql`.
5. Redeploy. In the coding chat → project picker → **Connect GitHub**, then
   **Choose repositories** to install the app on the repositories Nasrin may
   open pull requests in.
