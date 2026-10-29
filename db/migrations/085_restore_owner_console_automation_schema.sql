-- Migration 085: restore the canonical server-only automation schema required by
-- owner_console_dashboard() (migration 080). Recovery is idempotent and fails closed
-- on missing tenant prerequisites or workflow/run identity mismatches.
begin;

do $migration$
begin
  if to_regclass('public.tenants') is null then
    raise exception '085 cannot apply: public.tenants is missing; reconcile tenant schema before automation recovery';
  end if;
end
$migration$;

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

do $migration$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.automation_workflows'::regclass
      and conname = 'automation_workflows_identity_key') then
    alter table public.automation_workflows
      add constraint automation_workflows_identity_key unique (id, tenant_id, owner_type, owner_id);
  end if;

  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.automation_runs'::regclass
      and conname = 'automation_runs_workflow_identity_fkey') then
    if exists (
      select 1 from public.automation_runs r
      join public.automation_workflows w on w.id = r.workflow_id
      where (r.tenant_id, r.owner_type, r.owner_id)
        is distinct from (w.tenant_id, w.owner_type, w.owner_id)
    ) then
      raise exception '085 cannot apply: automation run/workflow identity mismatch; investigate rows before retrying';
    end if;
    alter table public.automation_runs
      add constraint automation_runs_workflow_identity_fkey
      foreign key (workflow_id, tenant_id, owner_type, owner_id)
      references public.automation_workflows (id, tenant_id, owner_type, owner_id)
      on delete cascade;
  end if;
  alter table public.automation_runs drop constraint if exists automation_runs_workflow_id_fkey;
end
$migration$;

alter table public.automation_workflows enable row level security;
alter table public.automation_runs enable row level security;
revoke all privileges on table public.automation_workflows, public.automation_runs from PUBLIC, anon, authenticated;
drop policy if exists server_only_deny_browser on public.automation_workflows;
drop policy if exists server_only_deny_browser on public.automation_runs;
create policy server_only_deny_browser on public.automation_workflows for all to anon, authenticated using (false) with check (false);
create policy server_only_deny_browser on public.automation_runs for all to anon, authenticated using (false) with check (false);
grant select, insert, update, delete on public.automation_workflows to service_role;
grant select, insert, update, delete on public.automation_runs to service_role;

commit;
