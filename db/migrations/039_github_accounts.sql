-- NasrinAI GitHub: up to 10 accounts per person (migration 039). docs/github.md
-- =============================================================================
-- Run once in the Supabase SQL editor, after 038. Safe to run again.
--
-- A person may connect several GitHub accounts (at most 10). One of them is
-- the main account: the one Nasrin reads with and opens pull requests from.
-- The connection that already exists becomes the main account.
-- =============================================================================

begin;

alter table public.github_connections add column if not exists is_main boolean not null default false;

do $migration$
begin
  -- Still the one-account key (tenant_id, user_id): the existing row is the main one.
  if (select array_length(conkey, 1) from pg_constraint
      where conrelid = 'public.github_connections'::regclass and contype = 'p') = 2 then
    update public.github_connections set is_main = true;
    alter table public.github_connections drop constraint github_connections_pkey;
    alter table public.github_connections add primary key (tenant_id, user_id, login);
  end if;
end
$migration$;

-- At most one main account per person.
create unique index if not exists github_connections_one_main
  on public.github_connections (tenant_id, user_id) where is_main;

-- At most 10 accounts per person (the server checks too).
create or replace function public.github_connections_limit() returns trigger
language plpgsql set search_path = public as $fn$
begin
  if not exists (select 1 from public.github_connections
                 where tenant_id = new.tenant_id and user_id = new.user_id and login = new.login)
     and (select count(*) from public.github_connections
          where tenant_id = new.tenant_id and user_id = new.user_id) >= 10 then
    raise exception 'github_accounts_limit' using errcode = 'check_violation';
  end if;
  return new;
end
$fn$;
revoke all on function public.github_connections_limit() from public, anon, authenticated;
drop trigger if exists github_connections_limit on public.github_connections;
create trigger github_connections_limit before insert on public.github_connections
  for each row execute function public.github_connections_limit();

commit;
