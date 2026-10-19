# Change Documentation Policy

## Mandatory rule

Every commit and every pull request in NasrinAI must be documented. Documentation is part of implementation and must be committed with the change, not deferred until later.

## For every commit

Add or update an entry in `docs/pr-change-log.md` in the same commit whenever the workflow supports an atomic change. If the GitHub contents workflow creates separate commits for separate files, immediately record each resulting commit SHA and its purpose in the next changelog update before continuing. No commit may remain undocumented at PR review/merge time. Keep the entry concise but specific:

- What changed and why; identify affected components/files or the relevant feature.
- User-visible behavior and operational impact.
- Security, privacy, data-retention, compatibility, migration, or configuration implications where relevant.
- Tests added or changed and their actual result. Clearly label tests that were added but not run.
- Known limitations, follow-up work, and deployment/configuration requirements.

For a documentation-only commit, record the documentation change itself. Do not claim a check passed unless its result was observed. If a commit is a mechanical follow-up, still record it and link it to the feature/change where useful. Commit hashes may be added in a later entry; do not omit the contemporaneous entry while waiting for a hash.

## For every pull request

The PR description must include:

1. Purpose and scope.
2. Implementation summary and affected areas.
3. Link/reference to the changelog entry and relevant architecture/spec documents.
4. Tests run, with pass/fail/pending status and evidence.
5. Security/data/API/database/migration impacts, or explicitly state none.
6. Risks, limitations, rollback/deployment steps, and unfinished work.
7. A commit-by-commit check that every implementation commit has a matching changelog entry.

Keep the PR description current when new commits are pushed. A PR is not documentation-complete merely because one generic changelog line exists.

## When to update deeper documentation

Update the relevant technical document whenever a change alters architecture, API contracts, database schema/migrations, authorization/RLS, provider routing, environment configuration, user-facing policy, security controls, operational runbooks, or deployment behavior. The changelog does not replace these specifications.

## Review and merge gate

- `docs/pr-change-log.md` must be changed in every PR.
- The PR template must be completed.
- Reviewers must verify commit-by-commit changelog coverage and any applicable architecture/security/database documentation.
- Required automated tests and checks must pass before merge. If CI or preview validation is unavailable, mark it pending and do not represent it as passed.
- Never hide a failed check by deleting the evidence or rewriting the status as success.

The GitHub Actions gate currently checks that the PR includes a changelog change. It does not independently prove that every commit has a distinct corresponding entry; reviewers must inspect the commit list against the changelog before merge. If tooling creates multiple file commits, record each exact SHA in the changelog as soon as possible.
