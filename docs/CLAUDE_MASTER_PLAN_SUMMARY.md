# NasrinAI — Claude Handoff & Progress Snapshot

Last updated: 2026-10-18
Repository: https://github.com/primusco20/nasrinAI

## How to use this file
Read this before making changes. Treat GitHub's current `main`, open PRs, workflow results, and Vercel deployment state as the source of truth. Do not assume an open PR is merged or that a successful deployment status means every test passed. Inspect the actual diff and run the applicable checks before changing code.

## Working rules
- Quality and security take priority over speed. Avoid speculative fixes and broad refactors when a narrow fix is safer.
- Never claim tests, deployment, OAuth, or UI behavior are verified unless the relevant evidence was checked.
- Keep environment configuration in Vercel; do not introduce hardcoded production secrets or default secret values.
- Preserve authentication, Supabase RLS, provider routing, streaming, and plan/rate/token limits when modifying adjacent code.
- Treat provider permissions as least-privilege. Read/write checkboxes describe requested access only; actual grants must be confirmed by provider OAuth scopes.
- Never expose OAuth tokens or secrets to the browser/model. Write operations need server-side authorization, audit logging, and explicit user confirmation.
- Keep user-facing UI premium, restrained, consistent, accessible, responsive, and especially reliable on mobile Safari.
- After each meaningful change, update this handoff with the PR, commit, test state, limitations, and next steps so Claude can resume without guessing.

## Current task — plugin settings mobile layout
### PR #383
URL: https://github.com/primusco20/nasrinAI/pull/383
Branch: `fix/plugin-settings-mobile-overlap`
Base: `main`
Latest known head at snapshot: `ebaf14a049008e14ce0a997200bf9f83d955188c`
Status at snapshot: open, not merged.

Purpose: fix overlapping/inconsistent text in per-app plugin settings shown in mobile Safari screenshot. CSS changes in `public/app.css` give account and informati...[truncated]