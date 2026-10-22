-- Aggregate-only Owner Console RPC stays server-role only and counts exact rows.
\set ON_ERROR_STOP on

set role service_role;
do $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  v_before := public.owner_console_usage_summary(now() - interval '1 hour');
  insert into public.usage_events
    (tenant_id, actor_type, actor_id, provider, model, input_tokens, output_tokens, latency_ms, outcome, cost_usd, task)
  values
    ('00000000-0000-0000-0000-000000000001', 'user', 'owner-metrics-user-a', 'owner-test-provider', 'owner-test-model', 10, 5, 100, 'ok', 0.01, 'chat'),
    ('00000000-0000-0000-0000-000000000001', 'user', 'owner-metrics-user-b', 'owner-test-provider', 'owner-test-model', 20, 10, 300, 'ok', 0.02, 'chat'),
    ('00000000-0000-0000-0000-000000000001', 'guest', 'owner-metrics-guest-c', 'owner-test-provider', 'owner-test-model', 30, 15, 500, 'timeout', null, 'chat');
  v_after := public.owner_console_usage_summary(now() - interval '1 hour');

  if (v_after->>'request_count')::bigint <> (v_before->>'request_count')::bigint + 3 then
    raise exception 'owner metrics request count does not include exactly the inserted calls';
  end if;
  if (v_after->>'total_tokens')::bigint <> (v_before->>'total_tokens')::bigint + 90 then
    raise exception 'owner metrics token sum is incorrect';
  end if;
  if (v_after->>'cost_estimate_rows')::bigint <> (v_before->>'cost_estimate_rows')::bigint + 2 then
    raise exception 'owner metrics must count only rows with a recorded estimate';
  end if;
  if not (v_after->'providers' @> '[{"provider":"owner-test-provider","model":"owner-test-model"}]'::jsonb) then
    raise exception 'owner metrics provider breakdown is missing';
  end if;

  begin
    perform public.owner_console_usage_summary(now() + interval '1 minute');
    raise exception 'future summary window unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm <> 'p_since must be within the last 90 days' then raise; end if;
  end;
end $;

do $
declare
  v_before jsonb;
  v_after jsonb;
  v_workflow uuid;
begin
  v_before := public.owner_console_automation_summary(now() - interval '1 hour');
  insert into public.automation_workflows
    (tenant_id, owner_type, owner_id, name, definition)
  values
    ('00000000-0000-0000-0000-000000000001', 'user', 'owner-metrics-automation', 'Owner metrics test workflow',
     '{"steps":[{"id":"step-1","tool":"noop"}]}'::jsonb)
  returning id into v_workflow;

  insert into public.automation_runs
    (tenant_id, workflow_id, owner_type, owner_id, status, trigger_type, idempotency_key, started_at, finished_at, created_at)
  values
    ('00000000-0000-0000-0000-000000000001', v_workflow, 'user', 'owner-metrics-automation', 'succeeded', 'manual', 'owner-run-0001', now() - interval '2 minutes', now() - interval '1 minute', now()),
    ('00000000-0000-0000-0000-000000000001', v_workflow, 'user', 'owner-metrics-automation', 'failed', 'manual', 'owner-run-0002', now() - interval '2 minutes', now() - interval '1 minute', now()),
    ('00000000-0000-0000-0000-000000000001', v_workflow, 'user', 'owner-metrics-automation', 'running', 'manual', 'owner-run-0003', now() - interval '40 minutes', null, now() - interval '40 minutes');

  v_after := public.owner_console_automation_summary(now() - interval '1 hour');
  if (v_after->>'run_count')::bigint <> (v_before->>'run_count')::bigint + 3 then
    raise exception 'automation summary did not count the inserted runs';
  end if;
  if (v_after->>'succeeded_count')::bigint <> (v_before->>'succeeded_count')::bigint + 1
    or (v_after->>'failed_count')::bigint <> (v_before->>'failed_count')::bigint + 1
    or (v_after->>'running_count')::bigint <> (v_before->>'running_count')::bigint + 1
    or (v_after->>'stale_running_count')::bigint <> (v_before->>'stale_running_count')::bigint + 1 then
    raise exception 'automation status or stale-run counts are incorrect';
  end if;
end $;
reset role;

set role authenticated;
do $$
begin
  begin
    perform public.owner_console_usage_summary(now() - interval '1 hour');
    raise exception 'authenticated role unexpectedly executed owner metrics';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.owner_console_automation_summary(now() - interval '1 hour');
    raise exception 'authenticated role unexpectedly executed owner automation summary';
  exception when insufficient_privilege then null;
  end;
end $;
reset role;

select 'owner console aggregate metrics checks passed' as result;
