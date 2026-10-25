-- Regression checks for migration 069: cached-token telemetry remains optional and nonnegative.
\set ON_ERROR_STOP on
do $$
declare
  v_data_type text;
  v_constraint text;
begin
  if to_regclass('public.openrouter_logs') is null then
    raise exception 'public.openrouter_logs is missing';
  end if;

  select c.data_type
    into v_data_type
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'openrouter_logs'
     and c.column_name = 'cached_tokens';

  if v_data_type is distinct from 'bigint' then
    raise exception 'cached_tokens must exist as bigint; got %', v_data_type;
  end if;

  select pg_get_constraintdef(c.oid)
    into v_constraint
    from pg_catalog.pg_constraint c
   where c.conrelid = 'public.openrouter_logs'::regclass
     and c.conname = 'openrouter_logs_cached_tokens_nonnegative'
     and c.contype = 'c';

  if v_constraint is null or v_constraint not like '%cached_tokens >= 0%' then
    raise exception 'cached_tokens nonnegative constraint missing or incorrect: %', v_constraint;
  end if;
end
$$;

select 'migration 069 cached-token schema checks passed' as result;
