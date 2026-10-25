-- Regional analytics for NasrinAI platform users and guests.
-- Persist coarse edge-derived location only; never store raw IPs, emails, or GPS.
begin;

create schema if not exists private;

create table if not exists private.regional_analytics_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  actor_type text not null default 'unknown',
  actor_key_hash text,
  country_code char(2),
  region text,
  city text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

create index if not exists regional_analytics_created_at_idx
  on private.regional_analytics_events (created_at desc);
create index if not exists regional_analytics_geo_idx
  on private.regional_analytics_events (country_code, region, city, created_at desc);
create index if not exists regional_analytics_event_type_idx
  on private.regional_analytics_events (event_type, created_at desc);
create index if not exists regional_analytics_expiry_idx
  on private.regional_analytics_events (expires_at);

alter table private.regional_analytics_events enable row level security;
revoke all on table private.regional_analytics_events from public, anon, authenticated;
grant select, insert, delete on table private.regional_analytics_events to service_role;

create or replace function public.record_regional_analytics_event(
  p_event_type text,
  p_actor_type text,
  p_actor_key_hash text,
  p_country_code text,
  p_region text,
  p_city text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $regional_event$
begin
  if p_event_type <> 'session_start'
    or p_actor_type not in ('user', 'guest')
    or p_actor_key_hash is null or p_actor_key_hash !~ '^[a-f0-9]{64}$'
    or (p_country_code is not null and p_country_code !~ '^[A-Z]{2}$')
    or coalesce(char_length(p_region), 0) > 100
    or coalesce(char_length(p_city), 0) > 100 then
    raise exception 'invalid regional analytics event';
  end if;

  -- Keep the 90-day retention promise operational without requiring pg_cron.
  delete from private.regional_analytics_events where expires_at <= now();

  -- At most one session-start location per pseudonymous actor per 30 minutes.
  if exists (
    select 1
    from private.regional_analytics_events e
    where e.event_type = 'session_start'
      and e.actor_type = p_actor_type
      and e.actor_key_hash = p_actor_key_hash
      and e.created_at >= now() - interval '30 minutes'
  ) then
    return false;
  end if;

  insert into private.regional_analytics_events
    (event_type, actor_type, actor_key_hash, country_code, region, city, expires_at)
  values
    (p_event_type, p_actor_type, p_actor_key_hash, p_country_code,
     nullif(btrim(p_region), ''), nullif(btrim(p_city), ''), now() + interval '90 days');

  return true;
end;
$regional_event$;

revoke execute on function public.record_regional_analytics_event(text,text,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_regional_analytics_event(text,text,text,text,text,text)
  to service_role;

commit;
