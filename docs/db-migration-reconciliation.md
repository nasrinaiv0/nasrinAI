# Database migration reconciliation

## Do not renumber deployed migrations

The migration directory contains historical duplicate prefixes (including 015–020). Migration 029_media_bucket_size_limit.sql also records that production history was labeled 026_media_bucket_size_limit, while repository migration 026 is 026_daily_realtime_voice_allowances.sql.

These are deployment-history risks, not permission to rewrite or replay migrations. Do not rename historical files, delete history rows, or blindly rerun a migration to make the numbers look consistent.

## Required production reconciliation

A read-only diagnostic is available at [`db/ops/inspect_migration_history_conflict.sql`](../db/ops/inspect_migration_history_conflict.sql). Run its sections in the intended Supabase SQL Editor and retain the results. It checks the recorded migration labels, the actual media bucket limit, the realtime voice table/RPCs, and RPC grants without changing production. Run the migration-history SELECT only if the first query confirms that `supabase_migrations.schema_migrations` exists with the expected columns.

Before applying any pending migration:

1. In the intended Supabase project's SQL Editor, export the rows from supabase_migrations.schema_migrations (or the project's actual migration-history table) with version and name.
2. Compare the result to the exact SQL files and hashes in this repository. A matching version label alone is not proof that the intended SQL was applied.
3. Verify schema state for migrations whose history labels differ, especially the media bucket limit and daily realtime voice allowances.
4. For each mismatch, record whether the SQL is absent, present under a different label, or partially applied. Review the actual schema before deciding whether to apply, repair, or formally baseline it.
5. Have an operator with production access review the reconciliation report before any SQL is executed.

Do not insert synthetic migration-history rows or mark a migration applied merely to silence a mismatch. Do not apply 026 realtime voice or later migrations based only on the media bucket's historical alias.

## Repository policy

- Keep all historical migration filenames immutable once they may have been deployed.
- Use the next unused migration prefix for new changes.
- Add an idempotent migration and a regression test for every schema/security fix.
- The CI scratch-database replay verifies repeatability; it does not prove production schema parity.
- Live production migration state remains unverified until the comparison above is completed.
