-- Private object bucket for durable Video Studio media assets.
-- Access is mediated by server-issued one-time upload and short-lived download URLs.
-- Plain PostgreSQL CI has no Supabase Storage schema; skip the bucket DDL there.
begin;
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'video-studio-assets',
      'video-studio-assets',
      false,
      52428800,
      array[
        'video/mp4','video/webm','video/quicktime','video/x-matroska',
        'image/jpeg','image/png','image/webp','image/gif',
        'audio/mpeg','audio/mp4','audio/wav','audio/webm','audio/ogg','audio/aac','audio/x-m4a'
      ]
    )
    on conflict (id) do update
    set name = excluded.name,
        public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
commit;
