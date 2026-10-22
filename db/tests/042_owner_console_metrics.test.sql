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
    if sqlerrm = 'future summary window unexpectedly accepted' then raise; end if;
  end;
end $$;
reset role;

set role authenticated;
do $$
begin
  begin
    perform public.owner_console_usage_summary(now() - interval '1 hour');
    raise exception 'authenticated role unexpectedly executed owner metrics';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'owner console aggregate metrics checks passed' as result;
