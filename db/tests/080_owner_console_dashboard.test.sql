-- Owner dashboard series must be service-role-only, bounded, correct, and mask emails.
\set ON_ERROR_STOP on

do $owner_dashboard_permissions$
begin
  if has_function_privilege('anon', 'public.owner_console_dashboard(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.owner_console_dashboard(integer)', 'EXECUTE') then
    raise exception 'only service_role may execute the owner dashboard';
  end if;
  if not has_function_privilege('service_role', 'public.owner_console_dashboard(integer)', 'EXECUTE') then
    raise exception 'service_role must execute the owner dashboard';
  end if;
end;
$owner_dashboard_permissions$;

do $owner_dashboard_counts$
declare
  v_before jsonb;
  v_after jsonb;
  d text;
begin
  v_before := public.owner_console_dashboard(14)->'series'->13;
  insert into auth.users (email, created_at) values ('dashboard.owner.test@example.com', now());
  insert into public.usage_events (tenant_id, actor_type, actor_id, provider, model, input_tokens, output_tokens, latency_ms, outcome, task)
  values ('00000000-0000-0000-0000-000000000001', 'user', 'dash-user', 'openai', 'test-model', 10, 20, 300, 'ok', 'chat'),
         ('00000000-0000-0000-0000-000000000001', 'guest', 'dash-guest', 'google', 'test-model', 5, 5, 900, 'timeout', 'image');
  insert into public.plan_periods (tenant_id, user_id, plan, ends_at, provider, provider_ref, amount, currency)
  select '00000000-0000-0000-0000-000000000001', id::text, 'pro', now() + interval '30 days', 'paymongo', 'dash-test-ref', 30000, 'PHP'
  from auth.users where email = 'dashboard.owner.test@example.com';
  v_after := public.owner_console_dashboard(14)->'series'->13;
  foreach d in array array['requests:2', 'tokens:40', 'failures:1', 'image:1', 'new_users:1', 'payments:1', 'gross_php_minor:30000', 'new_pro:1'] loop
    if (v_after->>split_part(d, ':', 1))::bigint - (v_before->>split_part(d, ':', 1))::bigint <> split_part(d, ':', 2)::bigint then
      raise exception 'series field % changed wrongly: % -> %', d, v_before, v_after;
    end if;
  end loop;
end;
$owner_dashboard_counts$;

set role service_role;
do $owner_dashboard_shape$
declare
  v jsonb;
  v_text text;
begin
  v := public.owner_console_dashboard(14);
  if jsonb_array_length(v->'series') <> 14 then
    raise exception 'series must hold one row per day, got %', jsonb_array_length(v->'series');
  end if;
  if jsonb_typeof(v->'recent_users') <> 'array' or jsonb_typeof(v->'media_totals') <> 'object'
     or jsonb_typeof(v->'automation') <> 'object' or jsonb_typeof(v->'recent_activity') <> 'array'
     or jsonb_typeof(v->'provider_health') <> 'array' or jsonb_typeof(v->'revenue_by_plan') <> 'array' then
    raise exception 'dashboard is missing sections';
  end if;
  v_text := v::text;
  if v_text like '%dashboard.owner.test@%' then
    raise exception 'dashboard must not return full email addresses';
  end if;
  if v_text not like '%d***@example.com%' then
    raise exception 'dashboard must return masked emails';
  end if;
  begin
    perform public.owner_console_dashboard(63);
    raise exception 'out-of-range window accepted';
  exception when raise_exception then
    if sqlerrm = 'out-of-range window accepted' then raise; end if;
  end;
end;
$owner_dashboard_shape$;
reset role;

delete from public.plan_periods where provider_ref = 'dash-test-ref';
delete from public.usage_events where actor_id in ('dash-user', 'dash-guest');
delete from auth.users where email = 'dashboard.owner.test@example.com';
