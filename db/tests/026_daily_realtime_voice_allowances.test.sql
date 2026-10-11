-- Migration 026: shared Manila-day realtime voice quota, tenant isolation, and RPC grants.
\set ON_ERROR_STOP on

do $$
declare
  tenant uuid := '00000000-0000-0000-0000-000000000001';
  first_id uuid := '20000000-0000-4000-8000-000000000001';
  second_id uuid := '20000000-0000-4000-8000-000000000002';
  third_id uuid := '20000000-0000-4000-8000-000000000003';
  r record;
begin
  select * into r from public.reserve_daily_realtime_voice(first_id, tenant, 'user', 'voice-quota-test', 300, 300);
  if not r.allowed or r.reserved_seconds <> 300 or r.used_seconds <> 0 then
    raise exception 'first five-minute reservation should fit: %', row_to_json(r);
  end if;

  select * into r from public.reserve_daily_realtime_voice(second_id, tenant, 'user', 'voice-quota-test', 300, 300);
  if r.allowed or r.reason <> 'daily_voice_limit' or r.used_seconds <> 300 then
    raise exception 'repeated session must not exceed daily limit: %', row_to_json(r);
  end if;

  if not public.settle_daily_realtime_voice(first_id) then raise exception 'voice settlement failed'; end if;
  if not public.settle_daily_realtime_voice(first_id) then raise exception 'voice settlement must be idempotent'; end if;

  -- A higher current tier can use only the remaining allowance; this is still
  -- cumulative per actor, not per device or per session.
  select * into r from public.reserve_daily_realtime_voice(third_id, tenant, 'user', 'voice-quota-test', 1200, 1500);
  if not r.allowed or r.reserved_seconds <> 1200 or r.used_seconds <> 300 then
    raise exception 'higher-tier allowance should reserve only its remaining seconds: %', row_to_json(r);
  end if;
  if not public.release_daily_realtime_voice(third_id) then raise exception 'voice release failed'; end if;
  if not public.release_daily_realtime_voice(third_id) then raise exception 'voice release must be idempotent'; end if;
end $$;

do $$
begin
  if has_table_privilege('anon', 'public.realtime_voice_reservations', 'SELECT')
     or has_table_privilege('authenticated', 'public.realtime_voice_reservations', 'SELECT')
     or has_table_privilege('anon', 'public.realtime_voice_reservations', 'INSERT')
     or has_table_privilege('authenticated', 'public.realtime_voice_reservations', 'INSERT') then
    raise exception 'browser roles must not access realtime voice reservations';
  end if;
  if has_function_privilege('anon', 'public.reserve_daily_realtime_voice(uuid,uuid,text,text,integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reserve_daily_realtime_voice(uuid,uuid,text,text,integer,integer)', 'EXECUTE') then
    raise exception 'browser roles must not reserve realtime voice';
  end if;
  if exists (
    select 1
      from pg_catalog.pg_proc p
      cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
     where p.oid = 'public.reserve_daily_realtime_voice(uuid,uuid,text,text,integer,integer)'::regprocedure
       and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC must not execute realtime voice reservation RPC';
  end if;
end $$;

select 'daily realtime voice allowance checks passed' as result;
