-- Migration 066: make the server-only OpenRouter telemetry boundary explicit.
-- RLS with no policies already fails closed; this policy documents and tests
-- that browser roles must never gain access through a later broad policy.
begin;
alter table public.openrouter_logs enable row level security;
drop policy if exists openrouter_logs_deny_browser on public.openrouter_logs;
create policy openrouter_logs_deny_browser
  on public.openrouter_logs
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
revoke all on table public.openrouter_logs from public, anon, authenticated;
grant select, insert on table public.openrouter_logs to service_role;
commit;
