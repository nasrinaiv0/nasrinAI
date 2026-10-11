-- Migration 028: explicit deny policies for server-only tables.
\set ON_ERROR_STOP on

do $$
declare
  t text;
  tables text[] := array[
    'api_keys',
    'channels',
    'connect_installations',
    'connector_events',
    'connectors',
    'conversations',
    'daily_token_reservations',
    'generated_images',
    'generated_videos',
    'improvement_consent_events',
    'improvement_example_deletion_events',
    'improvement_example_review_events',
    'improvement_examples',
    'knowledge_chunks',
    'knowledge_docs',
    'legal_acceptances',
    'library_chunks',
    'library_files',
    'marketing_cache',
    'messages',
    'plan_periods',
    'portfolio',
    'project_chats',
    'project_files',
    'project_tasks',
    'projects',
    'rate_counters',
    'realtime_voice_reservations',
    'semantic_cache',
    'sent_files',
    'spend_reservations',
    'tenants',
    'usage_events',
    'user_memories'
  ];
begin
  foreach t in array tables loop
    -- Optional feature tables may not exist in a clean migration replay.
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;

    if not exists (
      select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relrowsecurity
    ) then
      raise exception 'RLS must be enabled on public.%', t;
    end if;

    if not exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = t
        and p.policyname = 'server_only_deny_browser'
        and p.roles @> array['anon','authenticated']::name[]
        and p.qual = 'false' and p.with_check = 'false'
    ) then
      raise exception 'Expected deny policy missing or incorrect on public.%', t;
    end if;

    if has_table_privilege('anon', format('public.%I', t), 'SELECT')
       or has_table_privilege('anon', format('public.%I', t), 'INSERT')
       or has_table_privilege('anon', format('public.%I', t), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', t), 'DELETE')
       or has_table_privilege('authenticated', format('public.%I', t), 'SELECT')
       or has_table_privilege('authenticated', format('public.%I', t), 'INSERT')
       or has_table_privilege('authenticated', format('public.%I', t), 'UPDATE')
       or has_table_privilege('authenticated', format('public.%I', t), 'DELETE') then
      raise exception 'Browser-role table grants remain on public.%', t;
    end if;
  end loop;
end $$;

select 'server-only RLS deny-policy checks passed' as result;
