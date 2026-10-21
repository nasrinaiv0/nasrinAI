-- Migration 052: final video cost reconciliation is idempotent and cannot overwrite a conflicting final amount.
\set ON_ERROR_STOP on

do $$
declare
  tenant uuid := '00000000-0000-0000-0000-000000000001';
  reservation uuid := '52000000-0000-4000-8000-000000000001';
  r record;
  before_cost numeric;
  after_cost numeric;
begin
  select * into r from public.reserve_global_spend(reservation, 'reasoning', tenant, 'user', 'video-cost-test',
    0.200000, 1000, 1000, 1000, null);
  if not r.allowed then raise exception 'video reservation should fit: %', r.reason; end if;
  if not public.settle_global_spend(reservation, 0.200000) then raise exception 'initial estimate settlement failed'; end if;

  select public.usage_cost_since(pg_catalog.now() - interval '1 minute') into before_cost;
  if not public.reconcile_global_spend(reservation, 0.200000, 0.120000) then raise exception 'final cost reconciliation failed'; end if;
  if not public.reconcile_global_spend(reservation, 0.200000, 0.120000) then raise exception 'same final cost must be idempotent'; end if;
  if public.reconcile_global_spend(reservation, 0.200000, 0.180000) then raise exception 'conflicting final cost must not overwrite reconciliation'; end if;

  select public.usage_cost_since(pg_catalog.now() - interval '1 minute') into after_cost;
  if abs((before_cost - after_cost) - 0.080000) > 0.000001 then
    raise exception 'ledger did not reflect final cost: before %, after %', before_cost, after_cost;
  end if;
end $$;

do $$
begin
  if has_function_privilege('anon', 'public.reconcile_global_spend(uuid,numeric,numeric)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reconcile_global_spend(uuid,numeric,numeric)', 'EXECUTE') then
    raise exception 'browser roles must not reconcile global spend';
  end if;
end $$;

select 'global video spend reconciliation tests passed' as result;
