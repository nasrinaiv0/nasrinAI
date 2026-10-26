# Media Skills — Implementation and Release Checklist

This checklist is a gate, not a statement that the work is complete. Mark each item with evidence and reviewer; do not tick items based on intent.

## Gate A — Discovery and selection
- [ ] Candidate scope is limited to a named initial pilot; no bulk import.
- [ ] Every proposed file has canonical URL, exact path, immutable source commit and SHA.
- [ ] Duplicate/overlapping skills compared; one baseline selected where possible.
- [ ] Supporting references, assets and scripts reviewed, not just `SKILL.md`.
- [ ] Excluded/deferred candidates and reasons recorded.

## Gate B — License and provenance
- [ ] Actual license text and any file-level overrides reviewed.
- [ ] Dependencies, model weights, datasets, fonts, sample media and linked assets reviewed.
- [ ] Required license/NOTICE/attribution files preserved.
- [ ] No unresolved permission or copyleft issue remains for imported code.
- [ ] Third-party notices map each imported file to its origin and modifications.

## Gate C — Security and privacy
- [ ] Threat model approved; prompt-injection and untrusted-output rules enforced by tools.
- [ ] No arbitrary shell, filesystem path, URL or database access.
- [ ] Worker isolation, egress allowlist, time/resource limits and cleanup verified.
- [ ] Secrets server-side and redacted from all logs/errors.
- [ ] Consent and privacy disclosures pass tests for sensitive uploads.
- [ ] Tenant ownership, retention and deletion tests pass.

## Gate D — Cost and provider
- [ ] Current official price, API entitlement, terms, output rights and retention verified.
- [ ] Estimate, approval threshold, maximum cost, quotas, idempotency and kill switch tested.
- [ ] Provider outage, 429, timeout, unknown status and duplicate retry tested.
- [ ] “Free” claims accurately separate source license, local compute and provider quotas.

## Gate E — Tests and compatibility
- [ ] Exact pinned upstream tests run in disposable environment where provided.
- [ ] NasrinAI acceptance and security tests pass.
- [ ] Existing relevant regression suite passes.
- [ ] Mobile-first UX, accessibility, cancellation and error recovery verified.
- [ ] No hidden evaluation files or development-only tests shipped to production agent.
- [ ] Test results include commands, runtime, evidence, failures and limitations.

## Gate F — Release
- [ ] Implementation PR lists every imported file, provenance and modification.
- [ ] SBOM/dependency/license/security scan attached.
- [ ] Configuration/secret names documented without secret values.
- [ ] DB changes follow existing Supabase migration/RLS conventions and have rollback.
- [ ] Staging verification completed; production cost cap and kill switch verified.
- [ ] Owner explicitly approves merge and deploy.
- [ ] Post-deploy smoke test and rollback owner are recorded.

## Current state as of 2026-10-27

- [x] Discovery foundation and first-pass catalog documented in PR #650.
- [x] Security and license questions recorded for major source collections.
- [ ] Complete file-by-file review of all candidates proposed for initial pilot.
- [ ] Exact approved import manifest finalized.
- [ ] All required license/security/provider checks completed.
- [ ] Upstream tests executed; NasrinAI-specific acceptance tests authored and passed.
- [ ] Owner approval of exact import set.
- [ ] Implementation and release gates passed.

**Do not merge this discovery PR as implementation approval. Do not import or execute third-party code until the unchecked gates are satisfied and the owner explicitly approves the exact manifest.**
