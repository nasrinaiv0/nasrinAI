-- NasrinAI LinkedIn OAuth connections (migration 045).
-- Run after migrations 001-044 in the production Supabase SQL editor.
-- Access and refresh tokens are encrypted by the server with CONNECTOR_SECRET_KEY.
begin;
create table if not exists public.linkedin_connections (
  tenant_id uuid not null,
  user_id text not null check (char_length(user_id) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  linkedin_subject text not null check (char_length(linkedin_subject) between 1 and 200),
  access_token_enc text not null check (access_token_enc like 'v1.%' and char_length(access_token_enc) <= 4000),
  refresh_token_enc text check (refresh_token_enc is null or (refresh_token_enc like 'v1.%' and char_length(refresh_token_enc) <= 4000)),
  expires_at timestamptz not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
alter table public.linkedin_connections enable row level security;
revoke all privileges on table public.linkedin_connections from public, anon, authenticated;
drop policy if exists server_only_deny_browser on public.linkedin_connections;
create policy server_only_deny_browser on public.linkedin_connections for all to anon, authenticated using (false) with check (false);
commit;
