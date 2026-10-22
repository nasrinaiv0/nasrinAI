-- Durable asynchronous Video Studio render queue (migration 056).
-- Render jobs survive browser disconnects and Vercel function restarts.
begin;

create table if not exists public.video_studio_render_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_id text not null check (owner_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  project_id uuid not null,
  source_video_id uuid not null,
  status text not null default 'queued'
    check (status in ('queued','starting','running','completed','failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  input_manifest jsonb not null check (jsonb_typeof(input_manifest) = 'object'),
  sandbox_name text,
  output_path text,
  output_size_bytes bigint,
  error_code text,
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  idempotency_key text check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9_-]{8,100}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique (tenant_id, owner_id, idempotency_key)
);

create index if not exists video_studio_render_jobs_queue_idx
  on public.video_studio_render_jobs (created_at)
  where status = 'queued';
create index if not exists video_studio_render_jobs_owner_idx
  on public.video_studio_render_jobs (tenant_id, owner_id, created_at desc);
create index if not exists video_studio_render_jobs_running_idx
  on public.video_studio_render_jobs (updated_at)
  where status in ('starting','running');
create index if not exists video_studio_render_jobs_retention_idx
  on public.video_studio_render_jobs (updated_at)
  where status in ('completed','failed');

alter table public.video_studio_render_jobs enable row level security;
revoke all on public.video_studio_render_jobs from anon, authenticated;
grant select, insert, update, delete on public.video_studio_render_jobs to service_role;

create or replace function public.claim_video_studio_render_jobs(p_limit integer default 1)
returns setof public.video_studio_render_jobs
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with picked as (
    select j.id
    from public.video_studio_render_jobs as j
    where j.status = 'queued'
    order by j.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 3))
  )
  update public.video_studio_render_jobs as j
  set status = 'starting',
      progress = 5,
      attempts = j.attempts + 1,
      started_at = coalesce(j.started_at, now()),
      updated_at = now()
  from picked
  where j.id = picked.id
  returning j.*;
$$;
revoke all on function public.claim_video_studio_render_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_video_studio_render_jobs(integer) to service_role;

commit;
