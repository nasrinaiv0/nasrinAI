-- Durable private storage for generated chat videos (migration 067).
-- Keep video bytes in Supabase Storage rather than relying on provider retention.
-- Application routes must upload/download through the server using service_role;
-- clients must never receive broad bucket access or storage credentials.
begin;

alter table public.generated_videos
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists storage_bytes bigint,
  add column if not exists storage_uploaded_at timestamptz;

-- Private bucket: all reads/writes are mediated by the trusted server.
-- Skip cleanly in plain PostgreSQL CI where Supabase Storage is not installed.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'generated-videos',
      'generated-videos',
      false,
      52428800,
      array['video/mp4','video/webm','video/quicktime']
    )
    on conflict (id) do update
      set name = excluded.name,
          public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

create index if not exists generated_videos_storage_pending_idx
  on public.generated_videos (updated_at)
  where status = 'completed' and storage_path is null;

alter table public.generated_videos enable row level security;
revoke all on public.generated_videos from anon, authenticated;
grant all on public.generated_videos to service_role;

commit;
