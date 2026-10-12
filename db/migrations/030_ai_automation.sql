-- NasrinAI AI Automation (migration 030)
-- Run manually in Supabase SQL Editor after migration 029. Do not apply
-- automatically from the application. Tables are server-only.
begin;

create table if not exists public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_type text not null check (owner_type = 'user'),
  owner_id text not null check (owner_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  name text not null check (char_length(name) between 1 and 100),
  definition jsonb not null check (
    jsonb_typeof(definition) = 'object'
    and octet_length(definition::text) <= 20000
    and jsonb_typeof(definition->'steps') = 'array'
    and jsonb_array_length(definition->'steps') between 1 and 20
  ),
  enabled boolean not null default false,
  auto_enabled boolean not null default false,
  auto_allowed_actions text[] not null default '{}'
    check (auto_allowed_actions <@ array['email.send','social.post.publish','social.comment.reply','calendar.event.create']::text[]),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, owner_type, owner_id, name)
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
  owner_type text not null check (owner_type = 'user'),
  owner_id text not null check (owner_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  status text not null default 'pending_approval'
    check (status in ('pending_approval','queued','running','succeeded','failed','cancelled')),
  trigger_type text not null check (trigger_type in ('manual','schedule','provider_event')),
  steps jsonb not null default '[]'::jsonb
    check (jsonb_typeof(steps) = 'array' and octet_length(steps::text) <= 50000),
  approval jsonb not null default '{}'::jsonb
    check (jsonb_typeof(approval) = 'object' and octet_length(approval::text) <= 4000),
  idempotency_key text check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9_-]{8,120}$'),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, owner_type, owner_id, idempotency_key)
);

create index if not exists automation_workflows_owner_idx
  on public.automation_workflows (tenant_id, owner_type, owner_id, updated_at desc);
create index if not exists automation_runs_owner_idx
  on public.automation_runs (tenant_id, owner_type, owner_id, created_at desc);
create index if not exists automation_runs_pending_idx
  on public.automation_runs (tenant_id, owner_id, created_at desc)
  where status = 'pending_approval';

alter table public.automation_workflows enable row level security;
alter table public.automation_runs enable row level security;
revoke all on public.automation_workflows from anon, authenticated;
revoke all on public.automation_runs from anon, authenticated;
grant select, insert, update, delete on public.automation_workflows to service_role;
grant select, insert, update, delete on public.automation_runs to service_role;

commit;
