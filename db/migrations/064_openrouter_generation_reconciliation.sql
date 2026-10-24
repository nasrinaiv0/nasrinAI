-- NasrinAI migration 064: authoritative OpenRouter generation reconciliation metadata.
begin;

alter table public.openrouter_logs
  add column if not exists openrouter_generation_id text,
  add column if not exists provider_cost_source text,
  add column if not exists provider_cost_reconciled_at timestamptz;

create index if not exists openrouter_logs_generation_id_idx
  on public.openrouter_logs (openrouter_generation_id)
  where openrouter_generation_id is not null;

create index if not exists openrouter_logs_unreconciled_idx
  on public.openrouter_logs (created_at desc)
  where provider_request_id is not null and total_cost_usd is null;

alter table public.openrouter_logs
  add constraint openrouter_logs_provider_cost_source_check
  check (provider_cost_source is null or provider_cost_source in ('openrouter_generation_api'));

commit;
