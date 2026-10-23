-- Regression checks for provider-authoritative cost semantics.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'owner_console_usage_summary'
     and pg_get_function_identity_arguments(p.oid) = 'p_since timestamp with time zone';
  if v_definition is null then
    raise exception 'owner_console_usage_summary(timestamptz) is missing';
  end if;
  if position('provider_reported_cost_usd' in v_definition) = 0
     or position('cost_known_rows' in v_definition) = 0
     or position('cost_unknown_rows' in v_definition) = 0 then
    raise exception 'owner-console usage summary must expose provider cost and known/unknown coverage';
  end if;
  if position('estimated_cost_usd' in v_definition) > 0
     or position('coalesce(sum(cost_usd), 0)' in v_definition) > 0 then
    raise exception 'owner-console usage summary must not label estimates as actual or coalesce unknown costs to zero';
  end if;
  if has_function_privilege('anon', 'public.owner_console_usage_summary(timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.owner_console_usage_summary(timestamptz)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.owner_console_usage_summary(timestamptz)', 'EXECUTE') then
    raise exception 'owner-console usage RPC grants are not server-only';
  end if;
end $$;
