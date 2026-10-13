-- NasrinAI GitHub connections (migration 038). docs/github.md
-- =============================================================================
-- Run once in the Supabase SQL editor, after 001-037. Safe to run again.
--
-- One row per signed-in person who connected GitHub (the NasrinAI GitHub App,
-- user authorization). Tokens are stored only encrypted by the server
-- (AES-256-GCM with CONNECTOR_SECRET_KEY, bound to the person): this table
-- never holds a readable token. Disconnecting or deleting the account removes
-- the row. Only the server (service role) can read or write it.
-- =============================================================================

begin;

create table if not exists public.github_connections (
  tenant_id          uuid not null,
  user_id            text not null check (char_length(user_id) between 1 and 200),
  login              text not null check (login ~ '^[A-Za-z0-9-]{1,39}$'),
  access_token_enc   text not null check (access_token_enc like 'v1.%' and char_length(access_token_enc) <= 4000),
  refresh_token_enc  text check (refresh_token_enc is null or (refresh_token_enc like 'v1.%' and char_length(refresh_token_enc) <= 4000)),
  expires_at         timestamptz,
  refresh_expires_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

do $migration$
begin
  execute 'REVOKE ALL PRIVILEGES ON TABLE public.github_connections FROM PUBLIC, anon, authenticated';
  execute 'ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY';
  execute 'DROP POLICY IF EXISTS server_only_deny_browser ON public.github_connections';
  execute 'CREATE POLICY server_only_deny_browser ON public.github_connections FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
end
$migration$;

commit;
