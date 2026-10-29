-- Owner Command Center dashboard: daily series and short recent lists for the
-- redesigned console. Service-role only, read-only, bounded. Emails are masked
-- server-side (first letter + domain); no auth IDs, IP addresses, prompts,
-- file names or message content are returned.

create or replace function public.owner_console_mask_email(p_email text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $mask$
  select case
    when p_email is null or position('@' in p_email) < 2 then null
    else left(p_email, 1) || '***@' || split_part(p_email, '@', 2)
  end;
$mask$;

revoke execute on function public.owner_console_mask_email(text) from public, anon, authenticated;
grant execute on function public.owner_console_mask_email(text) to service_role;

create or replace function public.owner_console_dashboard(p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $owner_dashboard$
declare
  v_since timestamptz;
  v_result jsonb;
begin
  if p_days is null or p_days < 1 or p_days > 62 then
    raise exception 'p_days must be between 1 and 62';
  end if;
  v_since := date_trunc('day', now() at time zone 'utc') at time zone 'utc' - make_interval(days => p_days - 1);

  with days as (
    select generate_series(v_since, date_trunc('day', now() at time zone 'utc') at time zone 'utc', interval '1 day') as day
  ),
  usage as (
    select date_trunc('day', created_at at time zone 'utc') at time zone 'utc' as day,
      count(*) as requests,
      count(*) filter (where outcome = 'ok') as successes,
      count(*) filter (where outcome <> 'ok') as failures,
      coalesce(sum(input_tokens + output_tokens), 0) as tokens,
      count(*) filter (where task in ('coding', 'debugging', 'architecture')) as coding,
      count(*) filter (where task in ('image', 'image_brief', 'marketing_cache_hit')) as image,
      count(*) filter (where task in ('video', 'video_sound_effect', 'video_studio_export', 'video_voiceover')) as video,
      count(*) filter (where task in ('realtime', 'speech', 'transcription')) as voice,
      count(distinct actor_id) filter (where actor_type = 'user') as active_users,
      count(distinct actor_id) filter (where actor_type = 'guest') as active_guests,
      percentile_cont(0.95) within group (order by latency_ms) filter (where outcome = 'ok') as latency_p95_ms
    from public.usage_events
    where created_at >= v_since
    group by 1
  ),
  signups as (
    select date_trunc('day', created_at at time zone 'utc') at time zone 'utc' as day, count(*) as new_users
    from auth.users where created_at >= v_since group by 1
  ),
  paid as (
    select date_trunc('day', created_at at time zone 'utc') at time zone 'utc' as day,
      count(*) filter (where provider = 'paymongo' and amount is not null) as payments,
      coalesce(sum(amount) filter (where provider = 'paymongo' and currency = 'PHP'), 0) as gross_php_minor,
      count(*) filter (where plan = 'pro') as new_pro,
      count(*) filter (where plan = 'max') as new_max,
      count(*) filter (where plan = 'ultra') as new_ultra
    from public.plan_periods where created_at >= v_since group by 1
  ),
  images as (
    select date_trunc('day', created_at at time zone 'utc') at time zone 'utc' as day, count(*) as images
    from public.generated_images where created_at >= v_since group by 1
  ),
  videos as (
    select date_trunc('day', created_at at time zone 'utc') at time zone 'utc' as day, count(*) as videos
    from public.generated_videos where created_at >= v_since group by 1
  ),
  files as (
    select date_trunc('day', created_at at time zone 'utc') at time zone 'utc' as day, count(*) as files
    from public.sent_files where created_at >= v_since group by 1
  ),
  chats as (
    select date_trunc('day', created_at at time zone 'utc') at time zone 'utc' as day, count(*) as conversations
    from public.conversations where created_at >= v_since group by 1
  ),
  runs as (
    select date_trunc('day', created_at at time zone 'utc') at time zone 'utc' as day,
      count(*) filter (where status = 'succeeded') as automation_ok,
      count(*) filter (where status = 'failed') as automation_failed
    from public.automation_runs where created_at >= v_since group by 1
  )
  select jsonb_build_object(
    'window_days', p_days,
    'window_start', v_since,
    'generated_at', now(),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', to_char(d.day at time zone 'utc', 'YYYY-MM-DD'),
        'requests', coalesce(u.requests, 0),
        'successes', coalesce(u.successes, 0),
        'failures', coalesce(u.failures, 0),
        'tokens', coalesce(u.tokens, 0),
        'coding', coalesce(u.coding, 0),
        'image', coalesce(u.image, 0),
        'video', coalesce(u.video, 0),
        'voice', coalesce(u.voice, 0),
        'active_users', coalesce(u.active_users, 0),
        'active_guests', coalesce(u.active_guests, 0),
        'latency_p95_ms', round(u.latency_p95_ms::numeric),
        'new_users', coalesce(s.new_users, 0),
        'payments', coalesce(p.payments, 0),
        'gross_php_minor', coalesce(p.gross_php_minor, 0),
        'new_pro', coalesce(p.new_pro, 0),
        'new_max', coalesce(p.new_max, 0),
        'new_ultra', coalesce(p.new_ultra, 0),
        'images', coalesce(i.images, 0),
        'videos', coalesce(v.videos, 0),
        'files', coalesce(f.files, 0),
        'automation_ok', coalesce(r.automation_ok, 0),
        'automation_failed', coalesce(r.automation_failed, 0),
        'conversations', coalesce(c.conversations, 0)
      ) order by d.day)
      from days d
      left join usage u on u.day = d.day
      left join signups s on s.day = d.day
      left join paid p on p.day = d.day
      left join images i on i.day = d.day
      left join videos v on v.day = d.day
      left join files f on f.day = d.day
      left join runs r on r.day = d.day
      left join chats c on c.day = d.day
    ), '[]'::jsonb),
    'providers_daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', to_char(pd.day at time zone 'utc', 'YYYY-MM-DD'), 'provider', pd.provider, 'requests', pd.requests) order by pd.day, pd.provider)
      from (
        select date_trunc('day', ue.created_at at time zone 'utc') at time zone 'utc' as day,
          case when tp.provider is null then 'others' else ue.provider end as provider,
          count(*) as requests
        from public.usage_events ue
        left join (
          select provider from public.usage_events where created_at >= v_since
          group by provider order by count(*) desc limit 4
        ) tp on tp.provider = ue.provider
        where ue.created_at >= v_since
        group by 1, 2
      ) pd
    ), '[]'::jsonb),
    'provider_health', coalesce((
      select jsonb_agg(jsonb_build_object('provider', ph.provider, 'requests', ph.requests, 'successes', ph.successes,
        'latency_p50_ms', round(ph.p50::numeric)) order by ph.requests desc)
      from (
        select provider, count(*) as requests, count(*) filter (where outcome = 'ok') as successes,
          percentile_cont(0.5) within group (order by latency_ms) filter (where outcome = 'ok') as p50
        from public.usage_events where created_at >= v_since
        group by provider order by count(*) desc limit 8
      ) ph
    ), '[]'::jsonb),
    'revenue_by_plan', coalesce((
      select jsonb_agg(jsonb_build_object('plan', rp.plan, 'payments', rp.payments, 'gross_php_minor', rp.gross) order by rp.plan)
      from (
        select plan, count(*) as payments, coalesce(sum(amount), 0) as gross
        from public.plan_periods
        where created_at >= v_since and provider = 'paymongo' and amount is not null and currency = 'PHP'
        group by plan
      ) rp
    ), '[]'::jsonb),
    'recent_users', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.joined_at desc) from (
        select public.owner_console_mask_email(au.email) as email_masked,
          au.created_at as joined_at,
          au.last_sign_in_at,
          (select pp.plan from public.plan_periods pp
            where pp.user_id = au.id::text and pp.status = 'active' and pp.ends_at > now()
            order by pp.ends_at desc limit 1) as plan
        from auth.users au
        order by au.created_at desc
        limit 10
      ) x
    ), '[]'::jsonb),
    'recent_payments', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc) from (
        select pp.created_at, pp.plan, pp.amount as amount_minor, pp.currency, pp.provider, pp.status,
          public.owner_console_mask_email(au.email) as email_masked
        from public.plan_periods pp
        left join auth.users au on au.id::text = pp.user_id
        order by pp.created_at desc
        limit 10
      ) x
    ), '[]'::jsonb),
    'media_totals', jsonb_build_object(
      'images', (select count(*) from public.generated_images),
      'videos', (select count(*) from public.generated_videos),
      'videos_failed', (select count(*) from public.generated_videos where status = 'failed'),
      'sent_files', (select count(*) from public.sent_files),
      'sent_file_bytes', (select coalesce(sum(size), 0) from public.sent_files),
      'library_files', (select count(*) from public.library_files),
      'sent_by_kind', coalesce((
        select jsonb_agg(jsonb_build_object('kind', k.kind, 'files', k.files, 'bytes', k.bytes) order by k.files desc)
        from (select kind, count(*) as files, coalesce(sum(size), 0) as bytes from public.sent_files group by kind) k
      ), '[]'::jsonb)
    ),
    'top_media_users', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.items desc) from (
        select public.owner_console_mask_email(au.email) as email_masked, m.items
        from (
          select owner_id, count(*) as items from (
            select owner_id from public.generated_images where owner_type = 'user' and created_at >= v_since
            union all
            select owner_id from public.generated_videos where owner_type = 'user' and created_at >= v_since
          ) all_media group by owner_id order by count(*) desc limit 5
        ) m
        left join auth.users au on au.id::text = m.owner_id
      ) x
    ), '[]'::jsonb),
    'automation', jsonb_build_object(
      'workflows', (select count(*) from public.automation_workflows),
      'enabled_workflows', (select count(*) from public.automation_workflows where enabled),
      'avg_duration_ms', (select round(avg(extract(epoch from (finished_at - started_at)) * 1000)::numeric)
        from public.automation_runs where created_at >= v_since and finished_at is not null and started_at is not null),
      'recent_runs', coalesce((
        select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc) from (
          select ar.created_at, aw.name as workflow, ar.status, ar.trigger_type,
            case when ar.finished_at is not null and ar.started_at is not null
              then round(extract(epoch from (ar.finished_at - ar.started_at)) * 1000) end as duration_ms
          from public.automation_runs ar
          join public.automation_workflows aw on aw.id = ar.workflow_id
          order by ar.created_at desc
          limit 10
        ) x
      ), '[]'::jsonb)
    ),
    'recent_activity', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.at desc) from (
        select * from (
          (select created_at as at, 'signup' as kind, 'New user registration' as label from auth.users order by created_at desc limit 5)
          union all
          (select created_at, 'payment', initcap(plan) || ' plan ' || case when provider = 'paymongo' then 'payment recorded' else 'period granted' end
            from public.plan_periods order by created_at desc limit 5)
          union all
          (select created_at, 'image', 'Image generated' from public.generated_images order by created_at desc limit 5)
          union all
          (select created_at, 'video', 'Video generated' from public.generated_videos order by created_at desc limit 5)
          union all
          (select created_at, 'owner', 'Owner ' || replace(event_type, '_', ' ') from public.owner_audit_events order by created_at desc limit 5)
          union all
          (select created_at, 'automation', 'Automation run ' || status from public.automation_runs order by created_at desc limit 5)
        ) merged
        order by at desc
        limit 12
      ) x
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$owner_dashboard$;

revoke execute on function public.owner_console_dashboard(integer) from public, anon, authenticated, service_role;
grant execute on function public.owner_console_dashboard(integer) to service_role;
