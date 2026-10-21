-- Durable final-cost reconciliation for asynchronous video generation.
begin;

alter table public.generated_videos
  add column if not exists spend_reservation_id uuid references public.spend_reservations(id) on delete set null,
  add column if not exists estimated_cost_usd numeric(12,6),
  add column if not exists actual_cost_usd numeric(12,6),
  add column if not exists cost_reconciled_at timestamptz;

create index if not exists generated_videos_spend_reservation_idx
  on public.generated_videos (spend_reservation_id)
  where spend_reservation_id is not null;

create or replace function public.reconcile_global_spend(
  p_reservation_id uuid,
  p_expected_usd numeric,
  p_actual_usd numeric
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_kind text;
  v_status text;
  v_actual numeric;
begin
  if p_reservation_id is null
     or p_expected_usd is null or p_expected_usd < 0 or p_expected_usd > 100000
     or p_actual_usd is null or p_actual_usd < 0 or p_actual_usd > 100000 then
    raise exception 'reconcile_global_spend: invalid arguments';
  end if;

  select kind into v_kind from public.spend_reservations where id = p_reservation_id;
  if not found then return false; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nasrinai:global-usd:' || v_kind, 0)
  );
  select status, actual_usd into v_status, v_actual
    from public.spend_reservations where id = p_reservation_id for update;
  if not found or v_status <> 'settled' then return false; end if;

  -- Repeated delivery of the same final amount is safe. Otherwise only allow
  -- one transition from the expected conservative estimate to provider usage.
  if v_actual = p_actual_usd then return true; end if;
  if v_actual is distinct from p_expected_usd then return false; end if;

  update public.spend_reservations
     set actual_usd = p_actual_usd
   where id = p_reservation_id and status = 'settled' and actual_usd = p_expected_usd;
  return found;
end;
$$;

revoke all on function public.reconcile_global_spend(uuid,numeric,numeric) from public, anon, authenticated, service_role;
grant execute on function public.reconcile_global_spend(uuid,numeric,numeric) to service_role;

commit;
