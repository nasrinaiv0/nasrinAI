\set ON_ERROR_STOP on
set role service_role;

do $owner_alert_test$
declare
  v_id uuid;
  v_claimed uuid;
  v_attempts integer;
  v_ok boolean;
  v_status text;
begin
  v_id := public.owner_alert_enqueue(
    'test-ai-failure-spike-20261023',
    'ai_failure_spike',
    'high',
    'AI request failures exceeded the configured threshold'
  );

  if v_id is null then raise exception 'alert enqueue did not return an ID'; end if;

  -- Dedupe must return the same durable record rather than fan out duplicates.
  if public.owner_alert_enqueue(
    'test-ai-failure-spike-20261023',
    'ai_failure_spike',
    'high',
    'AI request failures exceeded the configured threshold'
  ) <> v_id then
    raise exception 'alert dedupe key created a duplicate record';
  end if;

  select c.id, c.attempts into v_claimed, v_attempts
    from public.owner_alert_claim(10) c
   where c.id = v_id;
  if v_claimed is null or v_attempts <> 1 then
    raise exception 'due alert was not claimed exactly once';
  end if;

  v_ok := public.owner_alert_finish(v_id, true, null);
  if not v_ok then raise exception 'alert completion did not update claimed row'; end if;

  select status into v_status from public.owner_alert_outbox where id = v_id;
  if v_status <> 'delivered' then raise exception 'successful delivery did not mark alert delivered'; end if;

  begin
    perform public.owner_alert_enqueue(
      'test-sensitive-payload-20261023',
      'ai_failure_spike',
      'high',
      'Authorization: Bearer do-not-store-this'
    );
    raise exception 'sensitive alert summary was unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm <> 'invalid alert event' then raise; end if;
  end;

  begin
    perform public.owner_alert_claim(100);
    raise exception 'out-of-range claim limit unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm <> 'p_limit must be between 1 and 50' then raise; end if;
  end;
end;
$owner_alert_test$;

reset role;

do $owner_alert_permissions$
begin
  if has_table_privilege('anon', 'public.owner_alert_outbox', 'select')
     or has_table_privilege('authenticated', 'public.owner_alert_outbox', 'select') then
    raise exception 'browser roles must not read the alert outbox';
  end if;
  if has_function_privilege('anon', 'public.owner_alert_claim(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.owner_alert_claim(integer)', 'execute') then
    raise exception 'browser roles must not claim alert deliveries';
  end if;
  if not has_function_privilege('service_role', 'public.owner_alert_claim(integer)', 'execute') then
    raise exception 'service_role must be able to claim alert deliveries';
  end if;
end;
$owner_alert_permissions$;
