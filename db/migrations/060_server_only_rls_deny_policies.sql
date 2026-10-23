-- Phase 1 security hardening: make server-only browser denial explicit.
-- These tables are accessed through trusted server routes using service_role.
-- Browser roles retain no table privileges; service_role privileges are preserved.
begin;

do $migration$
declare
  t text;
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
      raise exception 'required server-only table public.% is missing', t;
    end if;

    execute format(
      'revoke all privileges on table public.%I from PUBLIC, anon, authenticated',
      t
    );
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists server_only_deny_browser on public.%I', t);
    execute format(
      'create policy server_only_deny_browser on public.%I for all to anon, authenticated using (false) with check (false)',
      t
    );
  end loop;
end
$migration$;

commit;
