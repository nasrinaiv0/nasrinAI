-- NasrinAI research agent (migration 036). docs/research.md
-- =============================================================================
-- Run once in the Supabase SQL editor, after 001-035. Safe to run again.
--
-- research_scans: one person's scan (their question, the pages read, the facts
--   found). Private to that person: every row carries tenant + owner, and the
--   server always filters by both. Guests' scans expire after 24 hours,
--   signed-in people's after 30 days (expires_at), and are deleted with the
--   account.
-- research_facts: the shared fact table. Only a fact, its source page and a
--   review status; never the question, who asked, or any session. New facts
--   are 'pending' until the owner approves them.
-- Only the server (service role) can read or write either table.
-- =============================================================================

begin;

create table if not exists public.research_scans (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  owner_type  text not null check (owner_type in ('guest', 'user', 'service')),
  owner_id    text not null check (owner_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  query       text not null check (char_length(query) between 3 and 500),
  sources     jsonb not null default '[]'::jsonb,
  facts       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists research_scans_owner_idx on public.research_scans (tenant_id, owner_type, owner_id, created_at desc);
create index if not exists research_scans_expires_idx on public.research_scans (expires_at);

create table if not exists public.research_facts (
  id           uuid primary key default gen_random_uuid(),
  fact         text not null check (char_length(fact) between 10 and 300),
  source_url   text not null check (char_length(source_url) between 8 and 2000 and source_url ~ '^https?://'),
  source_title text not null default '' check (char_length(source_title) <= 200),
  fact_hash    text not null unique check (fact_hash ~ '^[0-9a-f]{64}$'),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);
create index if not exists research_facts_status_idx on public.research_facts (status, created_at desc);

-- Server only (same pattern as migration 028).
do $migration$
declare t text;
begin
  foreach t in array array['research_scans', 'research_facts'] loop
    execute format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    execute format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    execute format('DROP POLICY IF EXISTS server_only_deny_browser ON public.%I', t);
    execute format('CREATE POLICY server_only_deny_browser ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t);
  end loop;
end
$migration$;

-- Expired scans (guests 24 h, signed in 30 days); called by the hourly clean-up.
create or replace function public.purge_research()
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  delete from public.research_scans where expires_at < now();
$$;
revoke all on function public.purge_research() from public, anon, authenticated;

commit;
