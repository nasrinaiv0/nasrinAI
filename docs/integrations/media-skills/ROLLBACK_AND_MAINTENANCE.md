# Media Skills — Rollback and Maintenance

**Status:** Proposed operational runbook; no skills are currently approved for production enablement by this document.

## Versioning and provenance

- Pin each imported skill to an immutable source commit and record every imported file hash.
- Keep local modifications as a documented patch, never as an untracked edit.
- Record source/license review dates, dependency lockfile and worker image digest.
- Re-review when source, dependency, API schema, provider price/terms or data-retention policy changes.
- Do not automatically update or execute upstream content in production.

## Disable sequence

1. Owner or automated safety rule disables the skill/provider through server-authorized control.
2. Policy gate rejects new jobs for the disabled capability.
3. Queued jobs are cancelled or paused according to job state and provider cancellation semantics.
4. In-flight paid jobs are reconciled by provider job ID; do not blindly resubmit.
5. Workers terminate, temporary files are cleaned and output artifacts remain subject to user retention/deletion settings.
6. Emit a sanitized audit event and alert the owner.
7. Confirm user-facing status and prevent new charges.
8. Preserve evidence needed for incident review without retaining unnecessary media or secrets.

## Rollback triggers

- Secret leakage, cross-tenant access or unauthorized data transfer.
- Unbounded or duplicate charges.
- Critical dependency CVE or compromised upstream repository.
- Failed regression/security tests or materially degraded output quality.
- Provider terms/pricing changed and budget controls are no longer valid.
- Unexpected filesystem/process/network access.
- Data deletion or retention failure.

## Recovery

- Revert to last approved manifest, skill version and worker image.
- Disable provider calls until keys/scopes are reviewed; rotate exposed credentials.
- Reconcile costs and provider jobs; notify affected users where policy/law requires.
- Run security review and regression tests before re-enabling.
- Record incident cause, scope, remediation, test evidence and owner approval.

## Maintenance cadence

- Before every import/version bump: source/license/dependency/security diff and tests.
- Monthly: check provider pricing, API deprecation, quotas, terms and output rights for enabled providers.
- Quarterly: review dependencies, access scopes, retention, sandbox configuration and owner controls.
- Immediately: respond to security advisories, credential exposure or provider-policy changes.

## Release evidence

Every release records source manifest revision, file hashes, dependency/SBOM scan, test report, known limitations, migration/config changes if any, rollback revision and approver. Do not merge or deploy until the release checklist is satisfied and separately approved.
