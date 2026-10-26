-- Direct-provider request estimates are separate from provider-reported actual costs.
-- Never store estimates in usage_events.cost_usd/cost_source: migration 062 reserves
-- those columns for authoritative provider-reported billing only.
alter table public.usage_events
  add column if not exists estimated_cost_usd numeric(18, 12),
  add column if not exists estimated_cost_source text,
  add column if not exists pricing_version text,
  add column if not exists estimated_cost_at timestamptz;

alter table public.usage_events
  drop constraint if exists usage_events_estimated_cost_usd_check,
  add constraint usage_events_estimated_cost_usd_check
    check (estimated_cost_usd is null or (estimated_cost_usd >= 0 and estimated_cost_usd <= 100000));

alter table public.usage_events
  drop constraint if exists usage_events_estimated_cost_source_check,
  add constraint usage_events_estimated_cost_source_check
    check (estimated_cost_source is null or estimated_cost_source = 'pricing_registry_v1_standard_list_price');

alter table public.usage_events
  drop constraint if exists usage_events_pricing_version_check,
  add constraint usage_events_pricing_version_check
    check (pricing_version is null or pricing_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}-v[0-9]{1,3}$');

create index if not exists usage_events_estimated_cost_time_idx
  on public.usage_events (created_at desc)
  where estimated_cost_usd is not null;

comment on column public.usage_events.estimated_cost_usd is
  'Application estimate using a versioned public list-price registry; not provider-billed actual cost.';
comment on column public.usage_events.estimated_cost_source is
  'Explicit estimate provenance. Never use this column as actual provider spend.';
comment on column public.usage_events.pricing_version is
  'Pricing registry snapshot identifier used for estimated_cost_usd.';
