-- NasrinAI Video Studio cloud projects (migration 051)
-- Additive and repeatable. Run after migrations 001-050.
-- Studio project documents are server-only; browser roles receive no table grants.
begin;

create table if not exists public.video_studio_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id text not null check (user_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  name text not null check (char_length(name) between 1 and 80),
  document jsonb not null default '{}'::jsonb
    check (jsonb_typeof(document) = 'object')
    check (octet_length(document::text) <= 1000000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, id)
);
create index if not exists video_studio_projects_owner_updated_idx
  on public.video_studio_projects (tenant_id, user_id, updated_at desc);
alter table public.video_studio_projects enable row level security;
revoke all on public.video_studio_projects from anon, authenticated;
grant select, insert, update, delete on public.video_studio_projects to service_role;
commit;
