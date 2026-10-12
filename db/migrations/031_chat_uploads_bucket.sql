-- NasrinAI migration 031: the private `chat-uploads` bucket for direct uploads
-- (docs/uploads.md). The browser uploads a photo or file here through a
-- one-time signed link; the server reads it once with the secret key, then
-- deletes it. Unused uploads are removed by the hourly clean-up.
--
-- Private, with no storage policies: only the secret key (server) and a
-- one-time upload link can touch it. 50 MB per file at most (the server's own
-- limit, UPLOADS_MAX_MB, is 20 MB by default). Any file type: the server
-- decides the type from the file's first bytes, never from its name.
--
-- Safe to run repeatedly. Skips cleanly where Supabase Storage is absent
-- (plain Postgres in CI).
--
-- Rollback: delete every object in the bucket (Storage > chat-uploads), then
--   delete from storage.buckets where id = 'chat-uploads';

begin;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('chat-uploads', 'chat-uploads', false, 52428800, null)
    on conflict (id) do update
      set public = false,
          file_size_limit = 52428800;
  end if;
end $$;

commit;
