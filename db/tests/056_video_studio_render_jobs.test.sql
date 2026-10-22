\set ON_ERROR_STOP on
begin;

do $$
declare
  t record;
begin
  select c.relrowsecurity into t
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'video_studio_render_jobs';

  if not found then raise exception '056: render job table is missing'; end if;
  if not t.relrowsecurity then raise exception '056: render jobs must have RLS enabled'; end if;
  if has_table_privilege('anon', 'public.video_studio_render_jobs', 'select')
     or has_table_privilege('authenticated', 'public.video_studio_render_jobs', 'select') then
    raise exception '056: browser roles must not read render jobs directly';
  end if;
  if not has_function_privilege('service_role', 'public.claim_video_studio_render_jobs(integer)', 'execute') then
    raise exception '056: service_role must be able to claim render jobs';
  end if;
  if has_function_privilege('anon', 'public.claim_video_studio_render_jobs(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_video_studio_render_jobs(integer)', 'execute') then
    raise exception '056: browser roles must not claim render jobs';
  end if;
end $$;

rollback;
