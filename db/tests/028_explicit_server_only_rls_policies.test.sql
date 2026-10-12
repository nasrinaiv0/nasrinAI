-- Migration 028/032: catalog-wide browser boundary plus explicit server-only policies.
\set ON_ERROR_STOP on
do $$
declare
  r record;
  v_role text;
  v_privilege text;
  t text;
  tables text[] := array[
    'api_keys','channels','connect_installations','connector_events','connectors',
    'conversations','daily_token_reservations','generated_images','generated_videos',
    'improvement_consent_events','improvement_example_deletion_events',
    'improvement_example_review_events','improvement_examples','knowledge_chunks',
    'knowledge_docs','legal_acceptances','library_chunks','library_files','marketing_cache',
    'messages','plan_periods','portfolio','project_chats','project_files','project_tasks',
    'projects','rate_counters','realtime_voice_reservations','semantic_cache','sent_files',
    'spend_reservations','tenants','usage_events','user_memories',
    'automation_workflows','automation_runs'
  ];
begin
  for r in
    select c.oid, n.nspname, c.relname, c.relkind, c.relrowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
  loop
    if r.relkind in ('r','p') and not r.relrowsecurity then
      raise exception 'RLS is disabled on public relation %.%', r.nspname, r.relname;
    end if;
    foreach v_role in array array['anon','authenticated']::text[] loop
      foreach v_privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']::text[] loop
        if has_table_privilege(v_role, r.oid, v_privilege) then
          raise exception 'browser role % has % on public relation %.%', v_role, v_privilege, r.nspname, r.relname;
        end if;
      end loop;
    end loop;
  end loop;
  for r in
    select c.oid, n.nspname, c.relname from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
  loop
    foreach v_role in array array['anon','authenticated']::text[] loop
      foreach v_privilege in array array['USAGE','SELECT','UPDATE']::text[] loop
        if has_sequence_privilege(v_role, r.oid, v_privilege) then
          raise exception 'browser role % has % on public sequence %.%', v_role, v_privilege, r.nspname, r.relname;
        end if;
      end loop;
    end loop;
  end loop;
  foreach t in array tables loop
    if to_regclass(format('public.%I', t)) is null then
      if t in ('automation_workflows', 'automation_runs') then
        raise exception 'expected automation table public.% is missing', t;
      end if;
      continue; -- older optional feature tables can be absent from a clean replay
    end if;
    if not exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname='public' and p.tablename=t
        and p.policyname='server_only_deny_browser'
        and p.roles @> array['anon','authenticated']::name[]
        and p.qual='false' and p.with_check='false'
    ) then
      raise exception 'expected explicit browser deny policy missing or incorrect on public.%', t;
    end if;
  end loop;
end $$;
select 'catalog-wide RLS and explicit server-only policy checks passed' as result;
