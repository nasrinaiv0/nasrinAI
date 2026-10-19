-- NasrinAI migration 046: durable, owner-scoped Video Studio audio assets and timeline items.
-- Audio bytes live in the existing private Supabase Storage "media" bucket.
-- The server uses service_role; direct browser access is not granted.

begin;

create table if not exists public.video_studio_audio_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_type text not null default 'user' check (owner_type = 'user'),
  owner_id text not null check (owner_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  project_id uuid references public.projects(id) on delete set null,
  kind text not null check (kind in ('voiceover','sound_effect')),
  storage_path text not null unique,
  mime text not null default 'audio/mpeg' check (mime = 'audio/mpeg'),
  size_bytes integer not null check (size_bytes between 1 and 12582912),
  voice_id text,
  model_id text,
  duration_seconds numeric(8,3),
  label text not null check (char_length(label) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_studio_audio_assets_owner_idx
  on public.video_studio_audio_assets (tenant_id, owner_id, created_at desc);
create index if not exists video_studio_audio_assets_project_idx
  on public.video_studio_audio_assets (tenant_id, owner_id, project_id, created_at desc);

create table if not exists public.video_studio_timeline_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_id text not null check (owner_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  project_id uuid not null references public.projects(id) on delete cascade,
  audio_asset_id uuid not null references public.video_studio_audio_assets(id) on delete cascade,
  start_seconds numeric(8,3) not null default 0 check (start_seconds between 0 and 3600),
  trim_start_seconds numeric(8,3) not null default 0 check (trim_start_seconds between 0 and 3600),
  trim_end_seconds numeric(8,3),
  gain numeric(5,3) not null default 1 check (gain between 0 and 2),
  lane integer not null default 1 check (lane between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, audio_asset_id),
  check (trim_end_seconds is null or trim_end_seconds > trim_start_seconds)
);

create index if not exists video_studio_timeline_project_idx
  on public.video_studio_timeline_items (tenant_id, owner_id, project_id, start_seconds);

alter table public.video_studio_audio_assets enable row level security;
alter table public.video_studio_timeline_items enable row level security;
revoke all on public.video_studio_audio_assets from anon, authenticated;
revoke all on public.video_studio_timeline_items from anon, authenticated;
grant all on public.video_studio_audio_assets to service_role;
grant all on public.video_studio_timeline_items to service_role;

commit;
