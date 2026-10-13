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

## Where people find it

**Plugins** in the menu (and the desktop side bar) opens the Plugins sheet;
GitHub is its first plugin: Connect GitHub / Disconnect and Choose repositories. It is always in the menu; until GitHub
is set up the card says so. Guests are asked to sign in. `/v1/status` → `github`
shows `available`, or `off` with the missing setting (`not_set`, `client_id`,
`client_secret`, `slug`, `connector_key`), never a value.

## What Nasrin can do with a repository (audit 2026-10-13)

| Operation | Status | How |
|---|---|---|
| Choose a repository | Verified (tests) | `owner/name` or a github.com link in the message; the PR sheet lists the person's repositories |
| List folders, read files (in parts) | Verified (tests) | `github_list_files`, `github_read_file` |
| Search code | Verified (tests) | `github_search_code` (needs the person's GitHub connection; stays inside the chosen repository) |
| Recent commits | Verified (tests) | `github_recent_commits` |
| Change files | Verified (tests) | Only through a pull request the person confirms; whole new files or exact SEARCH/REPLACE changes to existing files, up to 20 files in one commit on a new branch |
| Stale-file protection | Verified (tests) | A change applies only where its text still matches exactly once; otherwise the PR is refused and nothing is written |
| Read back saved files | Verified (tests) | After the PR opens, each file on the new branch is compared with what was meant (Git blob id) |
| Duplicate protection | Verified (tests) | The same request again (same title, same files, same base) returns the open PR |
| Partial failure | Verified (tests) | Branch saved but PR failed: the answer names the branch |
| PR state, changed files, CI results | Verified (tests) | `github_pr_status`; CI results need the app's Checks / Commit statuses read permission |
| Delete files, rename | Unavailable | Not offered |
| Run code, tests, builds | Unavailable in NasrinAI | The repository's own CI runs on the PR branch; Nasrin reports it with `github_pr_status` |
| Push to existing branches, merge, deploy | Unavailable by design | Never offered |
| Live GitHub | Unverified | Waits for the owner's GitHub App setup |

## How a pull request is made (`src/github/api.js`)

1. Check the person can push to the repository.
2. Read the base branch's commit (the default branch unless one is given).
3. Work out every file's final text: a whole file, or the current file with each SEARCH/REPLACE part applied (it must match exactly one place, else nothing is written). Files that end up the same are left out.
4. One new tree (text only, up to 20 files / 500 KB, no `..`, no `.git/`). If an open `nasrin/` PR with the same title already has this exact tree, it is returned instead.
5. One commit on top, then a **new** branch `nasrin/<title>-<time>`.
6. Open the pull request into the base branch (if this fails, the answer names the saved branch). The base branch is never changed.
7. Read each saved file back from the new branch and compare it with what was meant (`verified`).

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
     Read and write**, **Metadata: Read-only**, and (so Nasrin can report
     test results) **Checks: Read-only**, **Commit statuses: Read-only**.
     Nothing else.
   - Where can it be installed: **Any account**.
2. Create the app, then **Generate a new client secret**.
3. Vercel → Settings → Environment Variables (Preview first, then Production):
   `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_SLUG`.
4. Supabase SQL editor (staging first): run `db/migrations/038_github_connections.sql`.
5. Redeploy. Menu → **Plugins** → GitHub → **Connect GitHub**, then
   **Choose repositories** to install the app on the repositories Nasrin may
   open pull requests in.
