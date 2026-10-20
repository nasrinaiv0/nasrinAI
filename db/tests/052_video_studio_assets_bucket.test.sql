\set ON_ERROR_STOP on
begin;

do $$
declare
  b record;
begin
  -- Plain PostgreSQL CI does not install Supabase Storage; the migration
  -- intentionally skips its bucket DDL there.
  if to_regclass('storage.buckets') is null then
    raise notice '052: Supabase Storage schema absent; bucket assertions skipped';
    return;
  end if;

  select id, public, file_size_limit, allowed_mime_types into b
  from storage.buckets where id = 'video-studio-assets';

  if not found then
    raise exception '052: private Video Studio asset bucket is missing';
  end if;
  if b.public then
    raise exception '052: Video Studio asset bucket must remain private';
  end if;
  if b.file_size_limit <> 52428800 then
    raise exception '052: Video Studio asset bucket must enforce a 50 MB object limit';
  end if;
  if not ('video/mp4' = any(b.allowed_mime_types))
     or not ('image/jpeg' = any(b.allowed_mime_types))
     or not ('audio/mpeg' = any(b.allowed_mime_types)) then
    raise exception '052: expected video, image, and audio MIME types must be allowed';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (qual ilike '%video-studio-assets%' or with_check ilike '%video-studio-assets%')
  ) then
    raise exception '052: do not add direct browser policies for private Video Studio assets';
  end if;
end $$;

rollback;
