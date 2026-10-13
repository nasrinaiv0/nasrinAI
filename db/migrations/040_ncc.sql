-- NCC (Nasrin Client Connect) contacts and pipeline (migration 040)
-- =============================================================================
-- Run once in the Supabase SQL editor (staging first), after 001-039. Safe to
-- run again.
--
-- An enabled business account's CRM: contacts (people and companies) and
-- deals in a fixed pipeline (lead -> qualified -> proposal -> won / lost).
-- Each row belongs to one account (tenant + user). Deleting a contact deletes
-- its deals. Kept until the business deletes them, or deletes its account.
-- Only the server (service role) can read these tables (docs/ncc.md).
-- =============================================================================

begin;

create table if not exists public.ncc_contacts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     text not null check (user_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null default '' check (char_length(email) <= 254),
  phone       text not null default '' check (char_length(phone) <= 40),
  company     text not null default '' check (char_length(company) <= 120),
  tags        text[] not null default '{}' check (cardinality(tags) <= 10),
  notes       text not null default '' check (char_length(notes) <= 4000),
  source      text not null default 'manual' check (source in ('manual', 'import')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ncc_contacts_owner_idx on public.ncc_contacts (tenant_id, user_id, updated_at desc);
-- One contact per email address in an account (the duplicate check).
create unique index if not exists ncc_contacts_email_uq on public.ncc_contacts (tenant_id, user_id, lower(email)) where email <> '';

create table if not exists public.ncc_deals (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     text not null check (user_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  contact_id  uuid not null references public.ncc_contacts(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  stage       text not null default 'lead' check (stage in ('lead', 'qualified', 'proposal', 'won', 'lost')),
  value       numeric(14, 2) not null default 0 check (value >= 0),
  currency    text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ncc_deals_owner_idx on public.ncc_deals (tenant_id, user_id, updated_at desc);
create index if not exists ncc_deals_contact_idx on public.ncc_deals (contact_id);

do $migration$
declare t text;
begin
  foreach t in array array['ncc_contacts', 'ncc_deals'] loop
    execute format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    execute format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
    execute format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    execute format('DROP POLICY IF EXISTS server_only_deny_browser ON public.%I', t);
    execute format('CREATE POLICY server_only_deny_browser ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t);
  end loop;
end
$migration$;

commit;
