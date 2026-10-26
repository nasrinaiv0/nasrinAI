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

-- Aggregate-only owner dashboard endpoint. It never returns actor IDs or message content.
create or replace function public.owner_console_estimated_cost_summary(p_since timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $estimated_cost_summary$
declare
  v_result jsonb;
begin
  if p_since is null or p_since > now() or p_since < now() - interval '90 days' then
    raise exception 'p_since must be within the last 90 days';
  end if;

  select jsonb_build_object(
    'request_count', count(*)::bigint,
    'estimated_total_usd', coalesce(sum(estimated_cost_usd), 0),
    'pricing_versions', coalesce(jsonb_agg(distinct pricing_version) filter (where pricing_version is not null), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', grouped.provider,
        'model', grouped.model,
        'request_count', grouped.request_count,
        'estimated_cost_usd', grouped.estimated_cost_usd,
        'latest_at', grouped.latest_at,
        'pricing_version', grouped.pricing_version
      ) order by grouped.estimated_cost_usd desc, grouped.provider, grouped.model)
      from (
        select provider, model, count(*)::bigint as request_count,
               sum(estimated_cost_usd) as estimated_cost_usd,
               max(created_at) as latest_at,
               max(pricing_version) as pricing_version
        from public.usage_events
        where created_at >= p_since
          and estimated_cost_usd is not null
          and estimated_cost_source = 'pricing_registry_v1_standard_list_price'
          and provider <> 'openrouter'
        group by provider, model
        order by sum(estimated_cost_usd) desc
        limit 200
      ) grouped
    ), '[]'::jsonb)
  )
  into v_result
  from public.usage_events
  where created_at >= p_since
    and estimated_cost_usd is not null
    and estimated_cost_source = 'pricing_registry_v1_standard_list_price'
    and provider <> 'openrouter';

  return v_result;
end;
$estimated_cost_summary$;

revoke execute on function public.owner_console_estimated_cost_summary(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.owner_console_estimated_cost_summary(timestamptz)
  to service_role;
