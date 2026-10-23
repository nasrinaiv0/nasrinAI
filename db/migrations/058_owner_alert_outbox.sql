-- Owner Console Phase 3: durable, deduplicated operational alert outbox.
-- The outbox is server-only. A later dispatcher may deliver approved event summaries;
-- never store prompts, emails, access tokens, workflow payloads, or raw IP addresses here.
begin;

create table if not exists public.owner_alert_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique check (length(dedupe_key) between 8 and 200),
  event_type text not null check (event_type in (
    'ai_failure_spike', 'automation_failure_spike', 'stale_automation',
    'database_unavailable', 'deployment_failure', 'billing_reconciliation_mismatch'
  )),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  summary text not null check (length(summary) between 1 and 240),
  status text not null default 'pending' check (status in ('pending', 'delivering', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  lock_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,64}$')
);

create index if not exists owner_alert_outbox_due_idx
  on public.owner_alert_outbox (next_attempt_at, created_at)
  where status in ('pending', 'delivering');

alter table public.owner_alert_outbox enable row level security;
drop policy if exists owner_alert_outbox_deny_browser on public.owner_alert_outbox;
create policy owner_alert_outbox_deny_browser on public.owner_alert_outbox
  for all to anon, authenticated using (false) with check (false);
revoke all on public.owner_alert_outbox from public, anon, authenticated;
grant select, insert, update on public.owner_alert_outbox to service_role;

create or replace function public.owner_alert_enqueue(
  p_dedupe_key text,
  p_event_type text,
  p_severity text,
  p_summary text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $owner_alert_enqueue$
declare
  v_id uuid;
begin
  if p_dedupe_key is null or length(p_dedupe_key) not between 8 and 200
     or p_event_type not in ('ai_failure_spike', 'automation_failure_spike', 'stale_automation',
       'database_unavailable', 'deployment_failure', 'billing_reconciliation_mismatch')
     or p_severity not in ('low', 'medium', 'high', 'critical')
     or p_summary is null or length(btrim(p_summary)) not between 1 and 240
     or p_summary ~* '(prompt|authorization:|bearer |api[_ -]?key|password|secret|@)' then
    raise exception 'invalid alert event';
  end if;

  insert into public.owner_alert_outbox (dedupe_key, event_type, severity, summary)
  values (p_dedupe_key, p_event_type, p_severity, btrim(p_summary))
  on conflict (dedupe_key) do update
    set updated_at = now()
    where owner_alert_outbox.status <> 'delivered'
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.owner_alert_outbox where dedupe_key = p_dedupe_key;
  end if;
  return v_id;
end;
$owner_alert_enqueue$;

create or replace function public.owner_alert_claim(p_limit integer default 20)
returns table (
  id uuid, event_type text, severity text, summary text, attempts integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $owner_alert_claim$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'p_limit must be between 1 and 50';
  end if;

  -- A worker may disappear after claiming its eighth attempt. Expire that
  -- lease into a terminal failure instead of leaving it stuck forever.
  update public.owner_alert_outbox
     set status = 'failed', lock_until = null, last_error_code = 'attempt_limit_reached', updated_at = now()
   where status = 'delivering' and lock_until < now() and attempts >= 8;

  return query
  with due as (
    select q.id
    from public.owner_alert_outbox q
    where (q.status = 'pending' and q.next_attempt_at <= now())
       or (q.status = 'delivering' and q.lock_until < now())
    order by q.next_attempt_at, q.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.owner_alert_outbox q
       set status = 'delivering',
           attempts = q.attempts + 1,
           lock_until = now() + interval '2 minutes',
           updated_at = now()
      from due
     where q.id = due.id and q.attempts < 8
    returning q.id, q.event_type, q.severity, q.summary, q.attempts
  )
  select * from claimed;
end;
$owner_alert_claim$;

create or replace function public.owner_alert_finish(
  p_id uuid,
  p_success boolean,
  p_error_code text default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $owner_alert_finish$
declare
  v_rows integer;
  v_error text;
begin
  if p_id is null or p_success is null then raise exception 'invalid alert completion'; end if;
  v_error := case when p_error_code ~ '^[a-z0-9_]{1,64}$' then p_error_code else 'delivery_failed' end;

  update public.owner_alert_outbox
     set status = case when p_success then 'delivered'
                       when attempts >= 8 then 'failed'
                       else 'pending' end,
         delivered_at = case when p_success then now() else null end,
         last_error_code = case when p_success then null else v_error end,
         next_attempt_at = case when p_success then next_attempt_at
           else now() + make_interval(secs => least(3600, 15 * (2 ^ least(attempts, 8))::integer)) end,
         lock_until = null,
         updated_at = now()
   where id = p_id and status = 'delivering';
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$owner_alert_finish$;

revoke execute on function public.owner_alert_enqueue(text, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.owner_alert_claim(integer) from public, anon, authenticated, service_role;
revoke execute on function public.owner_alert_finish(uuid, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.owner_alert_enqueue(text, text, text, text) to service_role;
grant execute on function public.owner_alert_claim(integer) to service_role;
grant execute on function public.owner_alert_finish(uuid, boolean, text) to service_role;

commit;
