-- Owner-only regional analytics summary.
-- Aggregate-only output: never returns actor hashes, raw IPs, emails, or precise coordinates.
begin;

create index if not exists regional_analytics_created_geo_actor_idx
  on private.regional_analytics_events (created_at desc, country_code, actor_type);

create or replace function public.owner_console_regional_summary(p_since timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private
as $regional_summary$
declare
  v_result jsonb;
begin
  if p_since is null or p_since > now() or p_since < now() - interval '90 days' then
    raise exception 'p_since must be within the last 90 days';
  end if;

  select jsonb_build_object(
    'event_count', count(*),
    'unique_actors', count(distinct actor_key_hash),
    'countries_seen', count(distinct country_code) filter (where country_code is not null),
    'user_events', count(*) filter (where actor_type = 'user'),
    'guest_events', count(*) filter (where actor_type = 'guest'),
    'latest_event_at', max(created_at),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'country_code', grouped.country_code,
        'region', grouped.region,
        'city', grouped.city,
        'actor_type', grouped.actor_type,
        'events', grouped.events,
        'unique_actors', grouped.unique_actors,
        'latest_activity', grouped.latest_activity
      ) order by grouped.events desc, grouped.country_code nulls last, grouped.region nulls last, grouped.city nulls last)
      from (
        select country_code, region, city, actor_type,
               count(*) as events,
               count(distinct actor_key_hash) as unique_actors,
               max(created_at) as latest_activity
        from private.regional_analytics_events
        where created_at >= p_since and expires_at > now()
        group by country_code, region, city, actor_type
        order by count(*) desc
        limit 500
      ) grouped
    ), '[]'::jsonb)
  )
  into v_result
  from private.regional_analytics_events
  where created_at >= p_since and expires_at > now();

  return v_result;
end;
$regional_summary$;

revoke execute on function public.owner_console_regional_summary(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.owner_console_regional_summary(timestamptz)
  to service_role;

commit;
