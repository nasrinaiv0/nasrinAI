-- Shared, atomic daily realtime voice allowances across all server instances.
-- Browser-direct audio cannot report exact turns, so reserve the whole permitted
-- session before minting credentials and consume it conservatively on success.
begin;

create table if not exists public.realtime_voice_reservations (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_type text not null check (actor_type in ('user', 'guest', 'service')),
  actor_id text not null check (char_length(actor_id) between 1 and 80),
  day_start timestamptz not null,
  reserved_seconds integer not null check (reserved_seconds > 0),
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  check ((status = 'reserved' and settled_at is null)
      or (status in ('consumed', 'released') and settled_at is not null))
);
create index if not exists realtime_voice_reservations_actor_day_idx
  on public.realtime_voice_reservations (tenant_id, actor_type, actor_id, day_start, status);

alter table public.realtime_voice_reservations enable row level security;
revoke all on table public.realtime_voice_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.realtime_voice_reservations to service_role;

create or replace function public.reserve_daily_realtime_voice(
  p_reservation_id uuid,
  p_tenant uuid,
  p_actor_type text,
  p_actor_id text,
  p_reserved_seconds integer,
  p_daily_limit_seconds integer
)
returns table (allowed boolean, reason text, reservation_id uuid, used_seconds bigint, reserved_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_day_start timestamptz;
  v_used bigint;
  v_allocated integer;
begin
  if p_reservation_id is null or p_tenant is null
     or p_actor_type is null or p_actor_type not in ('user', 'guest', 'service')
     or p_actor_id is null or pg_catalog.char_length(p_actor_id) < 1 or pg_catalog.char_length(p_actor_id) > 80
     or p_reserved_seconds is null or p_reserved_seconds < 1 or p_reserved_seconds > 3600
     or p_daily_limit_seconds is null or p_daily_limit_seconds < 1 or p_daily_limit_seconds > 86400 then
    raise exception 'reserve_daily_realtime_voice: invalid arguments';
  end if;

  v_day_start := pg_catalog.date_trunc('day', v_now at time zone 'Asia/Manila') at time zone 'Asia/Manila';
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nasrinai:realtime-voice:' || p_tenant::text || ':' || p_actor_type || ':' || p_actor_id || ':' || v_day_start::text, 0)
  );

  -- A process can die after minting a credential. Unknown outcomes consume the
  -- reservation instead of returning allowance that may already have been used.
  update public.realtime_voice_reservations
     set status = 'consumed', settled_at = v_now
   where status = 'reserved' and created_at < v_now - interval '15 minutes';

  if exists (select 1 from public.realtime_voice_reservations r where r.id = p_reservation_id) then
    return query select false, 'duplicate_reservation'::text, null::uuid, 0::bigint, 0;
    return;
  end if;

  select coalesce(sum(r.reserved_seconds), 0)::bigint into v_used
    from public.realtime_voice_reservations r
   where r.tenant_id = p_tenant and r.actor_type = p_actor_type and r.actor_id = p_actor_id
     and r.day_start = v_day_start and r.status in ('reserved', 'consumed');

  v_allocated := least(p_reserved_seconds, greatest(0, p_daily_limit_seconds - v_used)::integer);
  if v_allocated < 1 then
    return query select false, 'daily_voice_limit'::text, null::uuid, v_used, 0;
    return;
  end if;

  insert into public.realtime_voice_reservations
    (id, tenant_id, actor_type, actor_id, day_start, reserved_seconds)
  values
    (p_reservation_id, p_tenant, p_actor_type, p_actor_id, v_day_start, v_allocated);

  return query select true, null::text, p_reservation_id, v_used, v_allocated;
end;
$$;

create or replace function public.settle_daily_realtime_voice(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_status text;
begin
  if p_reservation_id is null then raise exception 'settle_daily_realtime_voice: invalid arguments'; end if;
  select status into v_status from public.realtime_voice_reservations where id = p_reservation_id for update;
  if not found then return false; end if;
  if v_status = 'consumed' then return true; end if;
  if v_status <> 'reserved' then return false; end if;
  update public.realtime_voice_reservations
     set status = 'consumed', settled_at = pg_catalog.now()
   where id = p_reservation_id;
  return true;
end;
$$;

create or replace function public.release_daily_realtime_voice(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_status text;
begin
  if p_reservation_id is null then raise exception 'release_daily_realtime_voice: invalid arguments'; end if;
  select status into v_status from public.realtime_voice_reservations where id = p_reservation_id for update;
  if not found then return false; end if;
  if v_status = 'released' then return true; end if;
  if v_status <> 'reserved' then return false; end if;
  update public.realtime_voice_reservations
     set status = 'released', settled_at = pg_catalog.now()
   where id = p_reservation_id;
  return true;
end;
$$;

revoke all on function public.reserve_daily_realtime_voice(uuid,uuid,text,text,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.settle_daily_realtime_voice(uuid) from public, anon, authenticated, service_role;
revoke all on function public.release_daily_realtime_voice(uuid) from public, anon, authenticated, service_role;
grant execute on function public.reserve_daily_realtime_voice(uuid,uuid,text,text,integer,integer) to service_role;
grant execute on function public.settle_daily_realtime_voice(uuid) to service_role;
grant execute on function public.release_daily_realtime_voice(uuid) to service_role;

commit;
