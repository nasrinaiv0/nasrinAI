-- Migration 043: LinkedIn tokens are server-only and tenant-scoped.
\set ON_ERROR_STOP on
do $$
begin
  if to_regclass('public.linkedin_connections') is null then
    raise exception '043: linkedin_connections table is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.linkedin_connections'::regclass) then
    raise exception '043: RLS must be enabled';
  end if;
  if has_table_privilege('anon', 'public.linkedin_connections', 'SELECT')
     or has_table_privilege('authenticated', 'public.linkedin_connections', 'SELECT') then
    raise exception '043: browser roles must not read LinkedIn connection tokens';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'linkedin_connections'
      and policyname = 'server_only_deny_browser' and qual = 'false' and with_check = 'false'
  ) then
    raise exception '043: deny-browser policy must exist';
  end if;
end $$;
