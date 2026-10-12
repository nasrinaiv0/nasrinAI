-- Migration 027: zero disables only the tenant-wide ceiling; actor limits remain.
\set ON_ERROR_STOP on
do $$
declare
  tenant uuid := '00000000-0000-0000-0000-000000000001';
  r record;
begin
  select * into r from public.reserve_daily_tokens(
    '27000000-0000-4000-8000-000000000001', tenant, 'service', 'm027-zero-tenant', 10, 0, 0, 0);
  if not r.allowed then raise exception 'zero platform tenant ceiling should allow a service reservation: %', row_to_json(r); end if;

  select * into r from public.reserve_daily_tokens(
    '27000000-0000-4000-8000-000000000001', tenant, 'service', 'm027-zero-tenant', 10, 0, 0, 0);
  if r.allowed or r.reason <> 'duplicate_reservation' then
    raise exception 'duplicate reservation IDs must be rejected: %', row_to_json(r);
  end if;

  select * into r from public.reserve_daily_tokens(
    '27000000-0000-4000-8000-000000000002', tenant, 'user', 'm027-actor-limit', 2, 1, 0, 0);
  if r.allowed or r.reason <> 'weekly_limit' then
    raise exception 'actor allowance must remain enforced when tenant ceiling is disabled: %', row_to_json(r);
  end if;

  select * into r from public.reserve_daily_tokens(
    '27000000-0000-4000-8000-000000000004', tenant, 'guest', 'm027-guest-limit', 2, 0, 1, 0);
  if r.allowed or r.reason <> 'guest_limit' then
    raise exception 'guest limit must remain enforced: %', row_to_json(r);
  end if;

  select * into r from public.reserve_daily_tokens(
    '27000000-0000-4000-8000-000000000003', tenant, 'service', 'm027-positive-tenant', 2, 0, 0, 1);
  if r.allowed or r.reason <> 'tenant_limit' then
    raise exception 'positive tenant ceilings must remain enforced: %', row_to_json(r);
  end if;

  if not public.release_daily_token_reservation('27000000-0000-4000-8000-000000000001') then
    raise exception 'test reservation release failed';
  end if;
end $$;
do $$
begin
  if has_function_privilege('anon', 'public.reserve_daily_tokens(uuid,uuid,text,text,bigint,bigint,bigint,bigint)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reserve_daily_tokens(uuid,uuid,text,text,bigint,bigint,bigint,bigint)', 'EXECUTE') then
    raise exception 'browser roles must not execute reserve_daily_tokens';
  end if;
  if not has_function_privilege('service_role', 'public.reserve_daily_tokens(uuid,uuid,text,text,bigint,bigint,bigint,bigint)', 'EXECUTE') then
    raise exception 'service_role must execute reserve_daily_tokens';
  end if;
end $$;
select 'daily token ceiling checks passed' as result;
