-- Migration 072: durable, provider-reported OpenRouter generation records.
-- This is a separate source from local request telemetry; do not fabricate request IDs.
begin;

create table if not exists public.openrouter_generations (
  generation_id text primary key,
  request_id text,
  session_id text,
  created_at timestamptz not null,
  model text,
  provider_name text,
  api_type text,
  router text,
  app_id text,
  origin text,
  api_key_name text,
  external_user text,
  cost_total numeric(20, 10),
  cost_upstream numeric(20, 10),
  cache_discount numeric(20, 10),
  is_byok boolean,
  tokens_prompt bigint,
  tokens_completion bigint,
  tokens_reasoning bigint,
  tokens_cached bigint,
  finish_reason text,
  finish_reason_norm text,
  streamed boolean,
  cancelled boolean,
  latency_ms integer,
  generation_time_ms integer,
  synced_at timestamptz not null default now(),
  constraint openrouter_generations_id_format check (generation_id ~ '^gen-[0-9A-Za-z-]{1,120}$'),
  constraint openrouter_generations_cost_nonnegative check (cost_total is null or cost_total >= 0),
  constraint openrouter_generations_upstream_cost_nonnegative check (cost_upstream is null or cost_upstream >= 0),
  constraint openrouter_generations_tokens_nonnegative check (
    (tokens_prompt is null or tokens_prompt >= 0) and
    (tokens_completion is null or tokens_completion >= 0) and
    (tokens_reasoning is null or tokens_reasoning >= 0) and
    (tokens_cached is null or tokens_cached >= 0)
  )
);

create index if not exists openrouter_generations_created_idx
  on public.openrouter_generations (created_at desc);
create index if not exists openrouter_generations_model_created_idx
  on public.openrouter_generations (model, created_at desc);
create index if not exists openrouter_generations_provider_created_idx
  on public.openrouter_generations (provider_name, created_at desc);

alter table public.openrouter_generations enable row level security;
revoke all on public.openrouter_generations from public, anon, authenticated;
grant select, insert, update on public.openrouter_generations to service_role;

comment on table public.openrouter_generations is
  'Provider-reported OpenRouter generation metadata discovered through account analytics. Separate from NasrinAI request logs; prompt and completion bodies are not stored.';

commit;
