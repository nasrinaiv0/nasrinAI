-- Explicitly deny browser-role access to NasrinAI's server-only tables.
-- RLS without policies is already default-deny; these policies make that boundary
-- explicit and keep Supabase's rls_enabled_no_policy advisor quiet.
-- The server's service_role access is intentionally preserved.
begin;

do $migration$
declare
  t text;
begin
  foreach t in array array[
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
  ] loop
    if to_regclass(format('public.%I', t)) is null then
      raise exception 'Expected server-only table public.% is missing', t;
    end if;

    execute format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    execute format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    execute format('DROP POLICY IF EXISTS server_only_deny_browser ON public.%I', t);
    execute format(
      'CREATE POLICY server_only_deny_browser ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      t
    );
  end loop;
end
$migration$;

commit;
