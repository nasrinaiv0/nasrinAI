-- NasrinAI migration 029: cap single uploads to the private `media` bucket.
-- Safe to run repeatedly. Skips cleanly where Supabase Storage is absent
-- (plain Postgres in CI).
--
-- Applied to production on 2026-10-12 through the Supabase connector (the
-- live migration history records it as `026_media_bucket_size_limit`; same
-- statement, renumbered here because 026 is already taken in this repo).
-- The bucket held no objects when applied, so no existing file was affected.
--
-- Rollback: update storage.buckets set file_size_limit = null where id = 'media';

begin;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
       set file_size_limit = 52428800,  -- 50 MB
           updated_at = now()
     where id = 'media'
       and file_size_limit is distinct from 52428800;
  end if;
end $$;

commit;
