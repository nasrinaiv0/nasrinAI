-- Core NasrinAI public-web crawl index (not Connect site knowledge).
begin;
create table if not exists public.web_crawl_queue (
  id uuid primary key default gen_random_uuid(),
  url text not null check (char_length(url) between 8 and 2000 and url ~ '^https?://'),
  url_hash text not null unique check (url_hash ~ '^[0-9a-f]{64}$'),
  priority integer not null default 0 check (priority between 0 and 100),
  source text not null default 'research' check (source in ('research','discovered','owner_seed')),
  depth integer not null default 0 check (depth between 0 and 8),
  status text not null default 'queued' check (status in ('queued','processing','indexed','retry','robots_denied')),
  attempts integer not null default 0,
  next_crawl_at timestamptz not null default now(),
  last_crawled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists web_crawl_queue_due_idx on public.web_crawl_queue(status, next_crawl_at, priority desc);
create table if not exists public.web_crawl_pages (
  id uuid primary key default gen_random_uuid(),
  url text not null check (char_length(url) between 8 and 2000 and url ~ '^https?://'),
  url_hash text not null unique check (url_hash ~ '^[0-9a-f]{64}$'),
  title text not null default '' check (char_length(title) <= 200),
  text_content text not null default '' check (char_length(text_content) <= 20000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  media jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists web_crawl_pages_fetched_idx on public.web_crawl_pages(fetched_at desc);
alter table public.web_crawl_queue enable row level security;
alter table public.web_crawl_pages enable row level security;
revoke all on public.web_crawl_queue, public.web_crawl_pages from public, anon, authenticated;
drop policy if exists web_crawl_queue_server_only on public.web_crawl_queue;
create policy web_crawl_queue_server_only on public.web_crawl_queue for all to anon, authenticated using (false) with check (false);
drop policy if exists web_crawl_pages_server_only on public.web_crawl_pages;
create policy web_crawl_pages_server_only on public.web_crawl_pages for all to anon, authenticated using (false) with check (false);
create or replace function public.claim_web_crawl_jobs(p_limit integer default 5)
returns setof public.web_crawl_queue
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with due as (
    select id from public.web_crawl_queue
    where next_crawl_at <= now()
      and (status in ('queued','retry','indexed') or (status = 'processing' and next_crawl_at < now() - interval '15 minutes'))
      and attempts < 8
    order by priority desc, next_crawl_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,5),10))
  )
  update public.web_crawl_queue q set status='processing', next_crawl_at=now()+interval '15 minutes'
  from due where q.id=due.id returning q.*;
$$;
revoke all on function public.claim_web_crawl_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_web_crawl_jobs(integer) to service_role;
commit;
