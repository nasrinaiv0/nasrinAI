-- Regression checks for migration 066: telemetry remains server-only.
\set ON_ERROR_STOP on
do $$
declare
  v_privilege text;
begin
  if to_regclass('public.openrouter_logs') is null then
    raise exception 'public.openrouter_logs is missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'openrouter_logs' and c.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on public.openrouter_logs';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'openrouter_logs'
      and p.policyname = 'openrouter_logs_deny_browser'
      and p.roles @> array['anon','authenticated']::name[]
      and p.cmd = 'ALL'
      and p.qual = 'false'
      and p.with_check = 'false'
  ) then
    raise exception 'explicit restrictive browser-deny policy missing or incorrect';
  end if;
  foreach v_privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']::text[] loop
    if has_table_privilege('anon', 'public.openrouter_logs', v_privilege) then
      raise exception 'anon has % on public.openrouter_logs', v_privilege;
    end if;
    if has_table_privilege('authenticated', 'public.openrouter_logs', v_privilege) then
      raise exception 'authenticated has % on public.openrouter_logs', v_privilege;
    end if;
  end loop;
  foreach v_privilege in array array['SELECT','INSERT']::text[] loop
    if not has_table_privilege('service_role', 'public.openrouter_logs', v_privilege) then
      raise exception 'service_role is missing % on public.openrouter_logs', v_privilege;
    end if;
  end loop;
end $$;
select 'migration 066 OpenRouter telemetry access checks passed' as result;
