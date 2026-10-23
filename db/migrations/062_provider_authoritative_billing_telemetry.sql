-- Provider-authoritative billing telemetry for the Owner Command Center.
-- Do not coalesce unknown costs to zero: null means the provider did not report
-- an actual cost for that event. This function is aggregate-only and reads no
-- prompt/message content. Replaces the legacy "estimated_cost_usd" response.

begin;

-- Existing cost_usd rows may contain legacy estimates. Never infer provenance
-- from a non-null amount; only new, explicitly marked provider costs count.
alter table public.usage_events
  add column if not exists cost_source text;
alter table public.usage_events
  drop constraint if exists usage_events_cost_source_check;
alter table public.usage_events
  add constraint usage_events_cost_source_check
  check (cost_source is null or (cost_source = 'provider_reported' and cost_usd is not null));
create index if not exists usage_events_provider_cost_time_idx
  on public.usage_events (created_at desc)
  where cost_source = 'provider_reported' and cost_usd is not null;

create or replace function public.owner_console_usage_summary(p_since timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_since is null or p_since > now() or p_since < now() - interval '90 days' then
    raise exception 'p_since must be within the last 90 days';
  end if;

  select jsonb_build_object(
    'window_start', p_since,
    'window_end', now(),
    'request_count', count(*) filter (where task <> 'video_cost_reconciliation'),
    'success_count', count(*) filter (where outcome = 'ok' and task <> 'video_cost_reconciliation'),
    'failure_count', count(*) filter (where outcome <> 'ok' and task <> 'video_cost_reconciliation'),
    'input_tokens', coalesce(sum(input_tokens) filter (where task <> 'video_cost_reconciliation'), 0),
    'output_tokens', coalesce(sum(output_tokens) filter (where task <> 'video_cost_reconciliation'), 0),
    'total_tokens', coalesce(sum(input_tokens::bigint + output_tokens::bigint) filter (where task <> 'video_cost_reconciliation'), 0),
    'active_user_ids', count(distinct actor_id) filter (where actor_type = 'user' and task <> 'video_cost_reconciliation'),
    'active_guest_ids', count(distinct actor_id) filter (where actor_type = 'guest' and task <> 'video_cost_reconciliation'),
    'latency_p50_ms', percentile_cont(0.50) within group (order by latency_ms) filter (where outcome = 'ok' and task <> 'video_cost_reconciliation'),
    'latency_p95_ms', percentile_cont(0.95) within group (order by latency_ms) filter (where outcome = 'ok' and task <> 'video_cost_reconciliation'),
    'provider_reported_cost_usd', sum(cost_usd) filter (where cost_source = 'provider_reported'),
    'cost_known_rows', count(*) filter (where cost_source = 'provider_reported' and cost_usd is not null),
    'cost_unknown_rows', count(*) filter (where cost_source is distinct from 'provider_reported' or cost_usd is null),
    'last_event_at', max(created_at),
    'features', coalesce((
      select jsonb_agg(jsonb_build_object(
        'feature', f.feature,
        'requests', f.requests,
        'active_user_ids', f.active_user_ids,
        'active_guest_ids', f.active_guest_ids,
        'total_tokens', f.total_tokens,
        'provider_reported_cost_usd', f.provider_reported_cost_usd,
        'cost_known_rows', f.cost_known_rows,
        'cost_unknown_rows', f.cost_unknown_rows
      ) order by f.requests desc, f.feature)
      from (
        select
          case
            when task in ('coding', 'debugging', 'architecture') then 'coding'
            when task in ('image', 'image_brief', 'marketing_cache_hit') then 'image_generation'
            when task in ('video', 'video_cost_reconciliation', 'video_sound_effect', 'video_studio_export', 'video_voiceover') then 'video_studio'
            when task in ('realtime', 'speech', 'transcription') then 'voice'
            when task = 'tool' then 'tools'
            when task in ('chat', 'research', 'scraping', 'generation', 'rendering', 'extraction', 'editing', 'analysis', 'planning', 'design', 'critique') then 'conversation'
            else 'other'
          end as feature,
          count(*) filter (where task <> 'video_cost_reconciliation') as requests,
          count(distinct actor_id) filter (where actor_type = 'user' and task <> 'video_cost_reconciliation') as active_user_ids,
          count(distinct actor_id) filter (where actor_type = 'guest' and task <> 'video_cost_reconciliation') as active_guest_ids,
          coalesce(sum(input_tokens::bigint + output_tokens::bigint) filter (where task <> 'video_cost_reconciliation'), 0) as total_tokens,
          sum(cost_usd) filter (where cost_source = 'provider_reported') as provider_reported_cost_usd,
          count(*) filter (where cost_source = 'provider_reported' and cost_usd is not null) as cost_known_rows,
          count(*) filter (where cost_source is distinct from 'provider_reported' or cost_usd is null) as cost_unknown_rows
        from public.usage_events
        where created_at >= p_since
        group by 1
        order by count(*) desc, 1
        limit 10
      ) f
    ), '[]'::jsonb),
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', p.provider,
        'model', p.model,
        'requests', p.requests,
        'successes', p.successes,
        'input_tokens', p.input_tokens,
        'output_tokens', p.output_tokens,
        'provider_reported_cost_usd', p.provider_reported_cost_usd,
        'cost_known_rows', p.cost_known_rows,
        'cost_unknown_rows', p.cost_unknown_rows
      ) order by p.requests desc, p.provider, p.model)
      from (
        select provider, model,
               count(*) as requests,
               count(*) filter (where outcome = 'ok' and task <> 'video_cost_reconciliation') as successes,
               coalesce(sum(input_tokens) filter (where task <> 'video_cost_reconciliation'), 0) as input_tokens,
               coalesce(sum(output_tokens) filter (where task <> 'video_cost_reconciliation'), 0) as output_tokens,
               sum(cost_usd) filter (where cost_source = 'provider_reported') as provider_reported_cost_usd,
               count(*) filter (where cost_source = 'provider_reported' and cost_usd is not null) as cost_known_rows,
               count(*) filter (where cost_source is distinct from 'provider_reported' or cost_usd is null) as cost_unknown_rows
          from public.usage_events
         where created_at >= p_since
         group by provider, model
         order by count(*) desc, provider, model
         limit 25
      ) p
    ), '[]'::jsonb)
  )
  into v_result
  from public.usage_events
  where created_at >= p_since;

  return v_result;
end;
$$;

revoke all on function public.owner_console_usage_summary(timestamptz) from public, anon, authenticated;
grant execute on function public.owner_console_usage_summary(timestamptz) to service_role;

commit;
