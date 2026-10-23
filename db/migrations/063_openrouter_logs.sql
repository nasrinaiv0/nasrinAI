-- NasrinAI migration 063: server-only OpenRouter request telemetry.
-- Payloads are summarized; raw prompts, completions, files, and credentials are never stored.

begin;

create table if not exists public.openrouter_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  provider text not null default 'openrouter' check (provider = 'openrouter'),
  endpoint text not null,
  http_method text not null,
  requested_model text,
  model text,
  prompt_tokens bigint,
  completion_tokens bigint,
  total_tokens bigint,
  total_cost_usd numeric(20, 10),
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  status text not null check (status in ('success', 'error')),
  http_status integer,
  error_code text,
  latency_ms integer not null check (latency_ms >= 0),
  provider_request_id text,
  constraint openrouter_logs_prompt_tokens_nonnegative check (prompt_tokens is null or prompt_tokens >= 0),
  constraint openrouter_logs_completion_tokens_nonnegative check (completion_tokens is null or completion_tokens >= 0),
  constraint openrouter_logs_total_tokens_nonnegative check (total_tokens is null or total_tokens >= 0),
  constraint openrouter_logs_total_cost_nonnegative check (total_cost_usd is null or total_cost_usd >= 0)
);

create index if not exists openrouter_logs_created_at_idx
  on public.openrouter_logs (created_at desc);
create index if not exists openrouter_logs_model_created_at_idx
  on public.openrouter_logs (model, created_at desc);
create index if not exists openrouter_logs_status_created_at_idx
  on public.openrouter_logs (status, created_at desc);
create index if not exists openrouter_logs_endpoint_created_at_idx
  on public.openrouter_logs (endpoint, created_at desc);

alter table public.openrouter_logs enable row level security;
revoke all on public.openrouter_logs from public, anon, authenticated;
grant select, insert on public.openrouter_logs to service_role;

commit;
