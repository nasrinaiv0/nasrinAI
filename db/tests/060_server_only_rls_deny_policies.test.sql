-- Regression tests for migration 060: server-only tables must deny browser roles.
\set ON_ERROR_STOP on
do $$
declare
  t text;
  r record;
  v_privilege text;
  tables text[] := array[
    'user_provider_credentials',
    'video_studio_audio_assets',
    'video_studio_projects',
    'video_studio_render_jobs',
    'video_studio_timeline_items'
  ];
begin
  foreach t in array tables loop
    if to_regclass(format('public.%I', t)) is null then
      raise exception 'expected server-only table public.% is missing', t;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t
        and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', t;
    end if;

    if not exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'public'
        and p.tablename = t
        and p.policyname = 'server_only_deny_browser'
        and p.roles @> array['anon','authenticated']::name[]
        and p.cmd = 'ALL'
        and p.qual = 'false'
        and p.with_check = 'false'
    ) then
      raise exception 'explicit deny policy missing or incorrect on public.%', t;
    end if;

    foreach v_privilege in array array[
      'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
    ]::text[] loop
      if has_table_privilege('anon', format('public.%I', t), v_privilege) then
        raise exception 'anon has % on public.%', v_privilege, t;
      end if;
      if has_table_privilege('authenticated', format('public.%I', t), v_privilege) then
        raise exception 'authenticated has % on public.%', v_privilege, t;
      end if;
    end loop;

    foreach v_privilege in array array['SELECT','INSERT','UPDATE','DELETE']::text[] loop
      if not has_table_privilege('service_role', format('public.%I', t), v_privilege) then
        raise exception 'service_role is missing % on public.%', v_privilege, t;
      end if;
    end loop;
  end loop;
end $$;
select 'migration 060 server-only RLS regression checks passed' as result;
