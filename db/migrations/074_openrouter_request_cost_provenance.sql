-- Migration 074: make persisted OpenRouter request costs visible with explicit provenance.
begin;

alter table public.openrouter_logs
  drop constraint if exists openrouter_logs_provider_cost_source_check;

alter table public.openrouter_logs
  add constraint openrouter_logs_provider_cost_source_check
  check (
    provider_cost_source is null
    or provider_cost_source in ('openrouter_generation_api', 'openrouter_logs.total_cost_usd')
  );

-- Older telemetry writes stored the authoritative OpenRouter request cost but
-- did not persist a provenance marker. Tag only populated OpenRouter cost rows.
update public.openrouter_logs
set provider_cost_source = 'openrouter_logs.total_cost_usd'
where provider = 'openrouter'
  and total_cost_usd is not null
  and provider_cost_source is null;

comment on column public.openrouter_logs.provider_cost_source is
  'Provenance for provider-reported cost: OpenRouter generation API or the stored OpenRouter request-log total_cost_usd field.';

commit;