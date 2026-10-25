-- Owner regional analytics must be service-role-only and aggregate-only.
\set ON_ERROR_STOP on

do $regional_analytics_permissions$
begin
  if has_function_privilege('anon', 'public.owner_console_regional_summary(timestamptz)', 'EXECUTE') then
    raise exception 'anon must not execute owner regional summary';
  end if;
  if has_function_privilege('authenticated', 'public.owner_console_regional_summary(timestamptz)', 'EXECUTE') then
    raise exception 'authenticated must not execute owner regional summary';
  end if;
  if not has_function_privilege('service_role', 'public.owner_console_regional_summary(timestamptz)', 'EXECUTE') then
    raise exception 'service_role must execute owner regional summary';
  end if;
  if has_table_privilege('anon', 'private.regional_analytics_events', 'SELECT') then
    raise exception 'anon must not read regional analytics events directly';
  end if;
  if has_table_privilege('authenticated', 'private.regional_analytics_events', 'SELECT') then
    raise exception 'authenticated must not read regional analytics events directly';
  end if;
end;
$regional_analytics_permissions$;

set role service_role;
do $regional_analytics_shape$
declare
  v_summary jsonb;
  v_row jsonb;
begin
  v_summary := public.owner_console_regional_summary(now() - interval '1 hour');
  if jsonb_typeof(v_summary) <> 'object' then
    raise exception 'regional summary must be an object';
  end if;
  if jsonb_typeof(v_summary->'event_count') <> 'number'
    or jsonb_typeof(v_summary->'unique_actors') <> 'number'
    or jsonb_typeof(v_summary->'countries_seen') <> 'number'
    or jsonb_typeof(v_summary->'rows') <> 'array' then
    raise exception 'regional summary is missing aggregate fields';
  end if;
  if v_summary ? 'actor_key_hash' or v_summary ? 'email' or v_summary ? 'ip_address' then
    raise exception 'regional summary must not expose identifiers';
  end if;
  for v_row in select value from jsonb_array_elements(v_summary->'rows')
  loop
    if v_row ? 'actor_key_hash' or v_row ? 'email' or v_row ? 'ip_address' then
      raise exception 'regional summary row must not expose identifiers';
    end if;
  end loop;
end;
$regional_analytics_shape$;
reset role;
