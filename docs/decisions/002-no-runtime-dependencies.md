# ADR-002: No third-party runtime packages

- **Status:** Accepted
- **Date:** 2026-10-05
- **Phase:** 1, step 2
- **Amends:** ADR-001, which named Express for the API server

## Decision

The NasrinAI server uses only what ships with Node.js 22: `node:http` for the
server, built-in `fetch` for Supabase and model providers, `node:crypto` for
tokens and hashing, and `node:test` for tests. `package.json` has no
dependencies.

## Context

ADR-001 chose Express because the reference code uses it. Two things changed:

- The workspace used to build this cannot install npm packages, so Express code
  could not be tested before committing it.
- NasrinAI's API is small: a few JSON routes, one static page. Express and
  supabase-js would add about 140 packages (the reference app locks 141) for
  features this service does not use.

## Options considered

| Option | Verdict |
| --- | --- |
| Express + supabase-js, untested here | Rejected: breaks "test before merge" |
| Built-in Node modules only | **Chosen** |
| Another framework (Fastify, Hono) | Same problem as Express, and new to the project |

## Reason

Every line that runs can be read and tested in this repo. Nothing upstream can
change what runs on the next deploy.

## Security implications

- Supply-chain risk is close to zero: no package can be compromised or typo-squatted.
- The security features Express middleware would have provided are written
  here instead and covered by tests: security headers, body size limits,
  safe errors, path-traversal protection.
- Risk: hand-written HTTP handling can have bugs that a mature framework has
  already fixed. Mitigated by keeping the surface small and testing every rule.

## Performance implications

Neutral to slightly better: no middleware chain, faster start-up.

## Cost implications

None. Builds are faster because there is nothing to install.

## Rollback strategy

Route handlers are plain functions taking `{ caller, body, params }`. Moving to
Express later means wrapping them, not rewriting them.

## Amendment (2026-10-14): two packages for the coding sandbox

The owner merged the isolated command runner (PR #334 and before), which needs
Vercel Sandbox, and the browser render-and-test, which needs agent-browser.
These run code in a separate cloud machine and cannot be written with Node
built-ins alone. So:

- **Allowed:** `@vercel/sandbox` and `@agent-browser/sandbox`, pinned to exact
  versions in `package.json`, with `package-lock.json` committed. They are
  loaded only with `import()` inside `src/github/runner.js` and
  `src/github/browser-runner.js`, so the rest of the app never loads them and
  works without them.
- **Removed:** `express` and `@supabase/supabase-js`, which nothing imports.
- **Still the rule:** everything else uses Node 22 built-ins only. Any other
  package needs the owner's OK and an amendment here.
- **Checks:** CI fails on high or critical npm advisories, and when
  `package-lock.json` does not match `package.json`.
