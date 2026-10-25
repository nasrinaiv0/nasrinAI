-- NasrinAI migration 065: upstream provider and generation performance metadata.
-- Values are populated only when an authoritative OpenRouter generation record is available.
begin;

alter table public.openrouter_logs
  add column if not exists upstream_provider text,
  add column if not exists finish_reason text,
  add column if not exists generation_time_seconds numeric(14, 6),
  add column if not exists upstream_inference_time_seconds numeric(14, 6);

alter table public.openrouter_logs
  drop constraint if exists openrouter_logs_generation_time_nonnegative,
  drop constraint if exists openrouter_logs_upstream_inference_time_nonnegative;

alter table public.openrouter_logs
  add constraint openrouter_logs_generation_time_nonnegative
    check (generation_time_seconds is null or generation_time_seconds >= 0),
  add constraint openrouter_logs_upstream_inference_time_nonnegative
    check (upstream_inference_time_seconds is null or upstream_inference_time_seconds >= 0);

create index if not exists openrouter_logs_upstream_provider_created_at_idx
  on public.openrouter_logs (upstream_provider, created_at desc);

commit;
