\set ON_ERROR_STOP on
begin;

do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'video_studio_projects' and c.relrowsecurity
  ) then
    raise exception '051: Video Studio projects must have RLS enabled';
  end if;

  if has_table_privilege('anon', 'public.video_studio_projects', 'select')
     or has_table_privilege('authenticated', 'public.video_studio_projects', 'select')
     or has_table_privilege('authenticated', 'public.video_studio_projects', 'insert')
     or has_table_privilege('authenticated', 'public.video_studio_projects', 'update')
     or has_table_privilege('authenticated', 'public.video_studio_projects', 'delete') then
    raise exception '051: browser roles must not access Video Studio projects directly';
  end if;

  if not has_table_privilege('service_role', 'public.video_studio_projects', 'select')
     or not has_table_privilege('service_role', 'public.video_studio_projects', 'insert')
     or not has_table_privilege('service_role', 'public.video_studio_projects', 'update')
     or not has_table_privilege('service_role', 'public.video_studio_projects', 'delete') then
    raise exception '051: server role must have project CRUD privileges';
  end if;
end $$;

rollback;
