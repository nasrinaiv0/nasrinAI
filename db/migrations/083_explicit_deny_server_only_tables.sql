-- Explicit browser-deny policies for server-only NasrinAI learning and provider telemetry.
-- This is defense in depth: anon/authenticated retain no table privileges, and service_role
-- remains the only application role with access.
begin;

revoke all privileges on table public.knowledge_learning_runs from public, anon, authenticated;
revoke all privileges on table public.openrouter_generations from public, anon, authenticated;
revoke all privileges on table public.public_technical_chunks from public, anon, authenticated;

alter table public.knowledge_learning_runs enable row level security;
alter table public.openrouter_generations enable row level security;
alter table public.public_technical_chunks enable row level security;

drop policy if exists server_only_deny_browser on public.knowledge_learning_runs;
create policy server_only_deny_browser on public.knowledge_learning_runs
  for all to anon, authenticated using (false) with check (false);

drop policy if exists server_only_deny_browser on public.openrouter_generations;
create policy server_only_deny_browser on public.openrouter_generations
  for all to anon, authenticated using (false) with check (false);

drop policy if exists server_only_deny_browser on public.public_technical_chunks;
create policy server_only_deny_browser on public.public_technical_chunks
  for all to anon, authenticated using (false) with check (false);

commit;
