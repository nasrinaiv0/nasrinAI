# GitHub in the coding chat

Nasrin reads GitHub repositories and opens pull requests for the person,
from the coding chat (Code in the menu). GitHub REST reads use Node's own `fetch` (no Octokit); code execution uses Vercel Sandbox microVMs.

## What it can do

| Who | Can |
|---|---|
| Anyone (guest or signed in) | Ask about a **public** repository: Nasrin reads it with read-only tools (`github_repo_info`, `github_list_files`, `github_read_file`, `github_recent_commits`). Without a GitHub connection GitHub allows about 60 reads an hour per server address. |
| Signed in + GitHub connected | The same with their own GitHub token (higher limit, plus private repositories the app is installed on), and **Open pull request** under coding replies that contain files. |

Never: merge, push to an existing branch, force-push, delete branches or files,
or act on the model's own say-so. The model can read repositories and run commands in an isolated sandbox; repository changes are made only through a pull
request opened by the page after the person taps **Confirm**
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
| PR state (merged or not, by whom, when), diff size +/− and changed files, CI results | Verified (tests) | `github_pr_status`; CI results need the app's Checks / Commit statuses read permission |
| Recent pull requests (open, merged, closed) | Verified (tests) | `github_list_pull_requests` |
| Delete files, rename | Unavailable | Not offered |
| Run commands, tests, builds, linting | Implemented behind the isolated runner | `github_run_command` fetches a bounded source snapshot, runs one command in Vercel Sandbox, captures real exit code/stdout/stderr, restricts network access after dependency setup, and never writes to GitHub |
| Push to existing branches, merge, deploy | Unavailable by design | Never offered |
| Sandbox execution | Implemented; live Vercel execution must be verified after deployment | Requires the SDK dependency and Vercel Sandbox OIDC support; private repo access uses the connected user's token only for archive download |

## Several GitHub accounts (migration 039)

A person can connect up to 10 GitHub accounts (Plugins → GitHub → Settings →
**Add account**; GitHub is asked to let them pick an account,
`prompt=select_account`). One is the **main** account: Nasrin reads with it and
opens pull requests from it. The first account is main; **Make main** changes it;
removing the main account makes the next one main. The database refuses an
eleventh account and a second main one. `GET /v1/github/status` lists
`accounts`; `POST /v1/github/main {login}`; `DELETE /v1/github?login=` removes
one (without `login`: all).

**Order:** run migration 039 in Supabase **before** this code goes live (the
server reads `is_main` and saves by `tenant_id, user_id, login`).

## Which repository ("check my repository")

When the person means their own repository without naming it, the model calls
`github_my_repos` (signed-in, connected GitHub only; up to 40 repositories the
main account reaches). One clear match (for example the project's name) is used;
otherwise the model lists them and asks which one in a plain sentence. Once the
repository is settled, the reply ends with `[[repo owner/name]]`: the page keeps
it for the project (same key as Open pull request), hides the line, and sends it
with each coding message (`repo`), so the model is told the project's repository.

## Pull request text, automatic pull requests, many files

- **Description:** the page writes it from Nasrin's reply: Summary, Files,
  What was done, Steps needed (the reply's `todo` rows), Check before merging
  (`warn`/`fail` rows), and who opened it. After opening, the server adds a
  comment listing each file as saved exactly as written / could not be
  confirmed / already matched.
- **Automatic pull requests** (Plugins → GitHub, off by default, `prefs.autoPr`
  with the account): right after a coding reply with files, the page opens the
  pull request into the repository the project used last (the person picks it
  once with Open pull request). The server accepts `auto: true` only when the
  person's own setting is on. Old replies never open pull requests again.
- **More than five files:** the chat shows one card listing the files with
  Open pull request (or the automatic result) instead of the files.

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


## Isolated coding runner

The runner is for signed-in users with GitHub connected. It fetches a source archive (15 MB max), sends no GitHub token or production secret into the ephemeral Vercel Sandbox microVM, limits each run to 70 seconds and 10 runs per user per hour, and truncates output. Node dependencies install with lifecycle scripts disabled; Python requirements install as binary wheels only. Egress is disabled before the requested command runs. Commands are passed as executable plus arguments rather than through a shell; shell operators and Git remote writes are rejected. The runner never writes to GitHub. It can apply a bounded, text-only unified diff inside the temporary workspace before executing a command, enabling a real test-fix-retest loop without saving changes to a branch. Each invocation starts from a clean snapshot, so every rerun must include the complete cumulative diff against the same ref. Proposed patches cannot modify secrets, Git metadata, dependency directories, or generated framework state. Final repository changes still use the existing confirmed pull-request flow. A sandbox result is not a substitute for repository CI or production verification.


## Coding runner archive safety (2026-10-13)

Before a repository archive reaches the sandbox extractor, `src/github/runner.js` performs bounded gzip decompression and tar-header inspection. Limits: compressed archive 15 MB, expanded tar stream 64 MB, any one entry 16 MB, and 10,000 entries. Unsafe traversal paths and links/special files are rejected. The sandbox still uses a 70-second timeout, disposable execution, bounded patch/output, and network denial before the requested command. This preflight is defense in depth, not a substitute for live integration verification: `test/sandbox-integration.test.js` is skipped unless `RUN_SANDBOX_INTEGRATION=1` and Vercel Sandbox credentials are present. Do not interpret a skipped live integration test as proof that production isolation has been verified.


## Browser render, test, screenshot and recording

`github_render_test_screenshot` (`src/github/browser-runner.js`) lets Nasrin
render and test a signed-in person's own connected repository, then show
them what it looks like, the way a developer would.

1. **App sandbox** (Vercel Sandbox, disposable): the archive is checked
   (same limits as the runner), extracted, dependencies installed from the
   npm registry only with lifecycle scripts off, then the network is closed,
   the person's one allowlisted test command runs and the preview server
   starts on a temporary sandbox address.
2. **Browser sandbox** (`@agent-browser/sandbox`, booted from a prepared
   snapshot): may reach only that preview address. It sets a desktop
   (1280×800) or phone (390×844) viewport, opens the page, reads the title
   and accessibility snapshot, records a short scroll-through video (WebM,
   needs ffmpeg in the snapshot; skipped if it cannot record) and takes a
   JPEG screenshot.
3. **Shown in the chat:** the screenshot is saved as a picture and the
   recording as a video (`provider: browser`), owned by the person and tied
   to that chat. The chat puts them above the reply (`[image:id]`,
   `[video:id]`); the page plays recordings from `GET /v1/recordings/:id`
   (owner-checked, no video plan needed). Only the chat server can attach
   them: tools marked `media: true`, with the chat id passed by the server,
   never by the model. The model gets only small text (exit code, trimmed
   output, title, snapshot).

Limits: 3 runs per person per hour; the tool's own time limit is 90 s;
screenshot ≤ 1.5 MB, recording ≤ 6 MB. It never deploys, pushes or merges.
Screenshots follow the picture keep-time (30 days or the person's
keep-time); recordings are kept with their chat.

**Setup (owner, once, from a phone):**

1. vercel.com → Account Settings → Tokens → Create (scope: the NasrinAI
   team). Copy it.
2. GitHub → the repository → Settings → Secrets and variables → Actions →
   New repository secret: name `VERCEL_TOKEN`, value the token.
3. GitHub → Actions → "Set up render-and-test browser" → Run workflow
   (`.github/workflows/browser-snapshot.yml` runs
   `scripts/create-browser-snapshot.mjs`: agent-browser, Chrome and ffmpeg
   in a sandbox, saved as a snapshot). Open the finished run; the last log
   line is `AGENT_BROWSER_SNAPSHOT_ID=…`.
4. Vercel → Project → Settings → Environment Variables: add
   `AGENT_BROWSER_SNAPSHOT_ID` with that value, then redeploy.
Without it the tool answers "not set up" and runs nothing. Live runs still
need a real test with the owner's Vercel account before calling this
production-ready.
