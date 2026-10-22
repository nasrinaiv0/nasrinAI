-- Aggregate-only Owner Console RPC stays server-role only and counts exact rows.
\set ON_ERROR_STOP on

set role service_role;
do $owner_test$
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
end $owner_test$;

do $owner_test$
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
end $owner_test$;

do $owner_plan_test$
declare
  v_before jsonb;
  v_after jsonb;
begin
  v_before := public.owner_console_plan_summary(now() - interval '1 hour');
  insert into public.plan_periods
    (tenant_id, user_id, plan, status, starts_at, ends_at, provider, amount, currency)
  values
    ('00000000-0000-0000-0000-000000000001', 'owner-metrics-plan-max', 'max', 'active', now() - interval '1 day', now() + interval '30 days', 'manual', null, null),
    ('00000000-0000-0000-0000-000000000001', 'owner-metrics-plan-ultra', 'ultra', 'canceled', now() - interval '30 days', now() - interval '1 day', 'manual', null, null);
  v_after := public.owner_console_plan_summary(now() - interval '1 hour');
  if (v_after->>'active_paid_periods')::bigint <> (v_before->>'active_paid_periods')::bigint + 1
    or (v_after->>'active_max_periods')::bigint <> (v_before->>'active_max_periods')::bigint + 1
    or (v_after->>'active_ultra_periods')::bigint <> (v_before->>'active_ultra_periods')::bigint
    or (v_after->>'new_periods')::bigint <> (v_before->>'new_periods')::bigint + 2 then
    raise exception 'plan entitlement summary counts are incorrect';
  end if;
end $owner_plan_test$;

do $owner_test$
declare
  v_before jsonb;
  v_after jsonb;
begin
  v_before := public.owner_console_audit_summary(now() - interval '1 hour');
  perform public.owner_console_record_audit('session_issued', 'owner-metrics-audit', repeat('a', 64), 'success');
  perform public.owner_console_record_audit('usage_export', 'owner-metrics-audit', repeat('b', 64), 'success');
  v_after := public.owner_console_audit_summary(now() - interval '1 hour');
  if (v_after->>'event_count')::bigint <> (v_before->>'event_count')::bigint + 2 then
    raise exception 'owner audit summary did not count the inserted events';
  end if;
  if not (v_after->'by_type' @> '[{"event_type":"session_issued","events":1},{"event_type":"usage_export","events":1}]'::jsonb) then
    raise exception 'owner audit event types are missing from summary';
  end if;
end $owner_test$;
reset role;

set role authenticated;
do $owner_test$
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
  begin
    perform public.owner_console_plan_summary(now() - interval '1 hour');
    raise exception 'authenticated role unexpectedly executed owner plan summary';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.owner_console_audit_summary(now() - interval '1 hour');
    raise exception 'authenticated role unexpectedly executed owner audit summary';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.owner_console_record_audit('session_issued', 'owner-metrics-audit', repeat('a', 64), 'success');
    raise exception 'authenticated role unexpectedly wrote owner audit events';
  exception when insufficient_privilege then null;
  end;
end $owner_test$;
reset role;

select 'owner console aggregate metrics checks passed' as result;
