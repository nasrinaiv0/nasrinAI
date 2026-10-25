\set ON_ERROR_STOP on
begin;

do $$
declare
  col_count integer;
begin
  if to_regclass('public.generated_videos') is null then
    raise exception '067: generated_videos table is missing';
  end if;

  select count(*) into col_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'generated_videos'
    and column_name in ('storage_bucket','storage_path','storage_bytes','storage_uploaded_at');

  if col_count <> 4 then
    raise exception '067: expected all four generated-video storage metadata columns, found %', col_count;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.generated_videos'::regclass) then
    raise exception '067: generated_videos must have RLS enabled';
  end if;

  if has_table_privilege('anon', 'public.generated_videos', 'select')
     or has_table_privilege('authenticated', 'public.generated_videos', 'select') then
    raise exception '067: browser roles must not read generated_videos directly';
  end if;

  -- Nested IF is intentional: PostgreSQL resolves storage.buckets while planning
  -- the query, even when a combined AND condition would be false in plain CI.
  if to_regclass('storage.buckets') is not null then
    if not exists (
      select 1 from storage.buckets
      where id = 'generated-videos' and public = false and file_size_limit = 52428800
    ) then
      raise exception '067: generated-videos bucket must be private and limited to 50 MiB';
    end if;
  end if;
end $$;

rollback;
