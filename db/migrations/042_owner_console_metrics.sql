-- Owner Console metrics: narrowly scoped, aggregate-only server RPC.
-- No browser table access or RLS/grant broadening. No prompt or message content is read.

begin;

create index if not exists usage_events_created_at_idx
  on public.usage_events (created_at desc);

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
    'request_count', count(*),
    'success_count', count(*) filter (where outcome = 'ok'),
    'failure_count', count(*) filter (where outcome <> 'ok'),
    'input_tokens', coalesce(sum(input_tokens), 0),
    'output_tokens', coalesce(sum(output_tokens), 0),
    'total_tokens', coalesce(sum(input_tokens::bigint + output_tokens::bigint), 0),
    'active_user_ids', count(distinct actor_id) filter (where actor_type = 'user'),
    'active_guest_ids', count(distinct actor_id) filter (where actor_type = 'guest'),
    'latency_p50_ms', percentile_cont(0.50) within group (order by latency_ms) filter (where outcome = 'ok'),
    'latency_p95_ms', percentile_cont(0.95) within group (order by latency_ms) filter (where outcome = 'ok'),
    'estimated_cost_usd', coalesce(sum(cost_usd), 0),
    'cost_estimate_rows', count(*) filter (where cost_usd is not null),
    'last_event_at', max(created_at),
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', p.provider,
        'model', p.model,
        'requests', p.requests,
        'successes', p.successes,
        'input_tokens', p.input_tokens,
        'output_tokens', p.output_tokens,
        'estimated_cost_usd', p.estimated_cost_usd
      ) order by p.requests desc, p.provider, p.model)
      from (
        select provider, model,
               count(*) as requests,
               count(*) filter (where outcome = 'ok') as successes,
               coalesce(sum(input_tokens), 0) as input_tokens,
               coalesce(sum(output_tokens), 0) as output_tokens,
               coalesce(sum(cost_usd), 0) as estimated_cost_usd
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

-- Automation status aggregates only. Never return workflow definitions, step arguments, or payloads.
create index if not exists automation_runs_created_at_idx
  on public.automation_runs (created_at desc);

create or replace function public.owner_console_automation_summary(p_since timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $
declare
  v_result jsonb;
begin
  if p_since is null or p_since > now() or p_since < now() - interval '90 days' then
    raise exception 'p_since must be within the last 90 days';
  end if;

  select jsonb_build_object(
    'window_start', p_since,
    'window_end', now(),
    'run_count', count(*),
    'pending_approval_count', count(*) filter (where status = 'pending_approval'),
    'queued_count', count(*) filter (where status = 'queued'),
    'running_count', count(*) filter (where status = 'running'),
    'succeeded_count', count(*) filter (where status = 'succeeded'),
    'failed_count', count(*) filter (where status = 'failed'),
    'cancelled_count', count(*) filter (where status = 'cancelled'),
    'stale_running_count', count(*) filter (
      where status = 'running' and coalesce(started_at, created_at) < now() - interval '30 minutes'
    ),
    'avg_duration_ms', round(avg(extract(epoch from (finished_at - started_at)) * 1000)::numeric, 1)
      filter (where started_at is not null and finished_at is not null and finished_at >= started_at),
    'last_run_at', max(created_at),
    'by_status', coalesce((
      select jsonb_agg(jsonb_build_object('status', s.status, 'runs', s.runs) order by s.status)
      from (
        select status, count(*) as runs
        from public.automation_runs
        where created_at >= p_since
        group by status
      ) s
    ), '[]'::jsonb)
  )
  into v_result
  from public.automation_runs
  where created_at >= p_since;

  return v_result;
end;
$;

revoke execute on function public.owner_console_usage_summary(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.owner_console_usage_summary(timestamptz) to service_role;
revoke execute on function public.owner_console_automation_summary(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.owner_console_automation_summary(timestamptz) to service_role;

commit;
