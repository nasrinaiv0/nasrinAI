-- Migration 032: explicitly preserve the server-only boundary for automation tables
-- introduced by migration 030 after migration 028's original policy list.
begin;
do $migration$
declare t text;
begin
  foreach t in array array['automation_workflows', 'automation_runs'] loop
    if to_regclass(format('public.%I', t)) is null then
      raise exception '032 requires public.% to exist; apply migration 030 first', t;
    end if;
    execute format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    execute format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    execute format('DROP POLICY IF EXISTS server_only_deny_browser ON public.%I', t);
    execute format('CREATE POLICY server_only_deny_browser ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t);
  end loop;
end
$migration$;
commit;
