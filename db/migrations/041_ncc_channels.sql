-- NCC (Nasrin Client Connect) Meta channels and outbox (migration 041)
-- =============================================================================
-- Run once in the Supabase SQL editor (staging first), after 040. Safe to run
-- again. Creates only new tables; nothing existing is changed.
--
-- The business's own Meta channels (Facebook Page, Instagram, Threads,
-- WhatsApp) with tokens stored only sealed, and the outbox of posts and
-- messages (each waits for approval unless the business let that exact step
-- send by itself). Only the server (service role) can read these tables
-- (docs/ncc.md).
-- =============================================================================

begin;

-- The business's own Meta channels. The token is sealed by the server
-- (AES-256-GCM, CONNECTOR_SECRET_KEY) and never sent back to a browser.
create table if not exists public.ncc_channels (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  user_id      text not null check (user_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  kind         text not null check (kind in ('facebook_page', 'instagram', 'threads', 'whatsapp')),
  external_id  text not null check (external_id ~ '^[0-9]{1,30}$'),
  name         text not null default '' check (char_length(name) <= 120),
  token_enc    text not null check (token_enc like 'v1.%' and char_length(token_enc) <= 4000),
  created_at   timestamptz not null default now(),
  unique (tenant_id, user_id, kind, external_id)
);

-- Posts and messages: pending (waiting for approval), sending, sent, failed
-- or discarded. A pending item is claimed (pending -> sending) once, so it
-- is never sent twice.
create table if not exists public.ncc_outbox (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  user_id        text not null check (user_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  channel_id     uuid not null references public.ncc_channels(id) on delete cascade,
  automation_id  uuid references public.ncc_automations(id) on delete set null,
  contact_id     uuid references public.ncc_contacts(id) on delete cascade,
  action         text not null check (action in ('facebook_post', 'instagram_post', 'threads_post', 'whatsapp_send')),
  payload        jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 8000),
  status         text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'discarded')),
  result         text not null default '' check (char_length(result) <= 300),
  external_ref   text not null default '' check (char_length(external_ref) <= 200),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists ncc_outbox_owner_idx on public.ncc_outbox (tenant_id, user_id, status, created_at desc);

do $migration$
declare t text;
begin
  foreach t in array array['ncc_channels', 'ncc_outbox'] loop
    execute format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    execute format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
    execute format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    execute format('DROP POLICY IF EXISTS server_only_deny_browser ON public.%I', t);
    execute format('CREATE POLICY server_only_deny_browser ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t);
  end loop;
end
$migration$;

commit;
