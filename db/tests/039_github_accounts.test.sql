-- Migration 039: several GitHub accounts per person, one main, at most 10.
\set ON_ERROR_STOP on
begin;

insert into public.github_connections (tenant_id, user_id, login, access_token_enc, is_main)
select '00000000-0000-0000-0000-000000000001', 'user-1', 'acct-' || i, 'v1.a.b.c', i = 1
from generate_series(1, 10) as i;

do $$
begin
  -- The same account again is an update, not an eleventh account.
  insert into public.github_connections (tenant_id, user_id, login, access_token_enc)
  values ('00000000-0000-0000-0000-000000000001', 'user-1', 'acct-3', 'v1.x.y.z')
  on conflict (tenant_id, user_id, login) do update set access_token_enc = excluded.access_token_enc;
  begin
    insert into public.github_connections (tenant_id, user_id, login, access_token_enc)
    values ('00000000-0000-0000-0000-000000000001', 'user-1', 'acct-11', 'v1.a.b.c');
    raise exception '039: an eleventh account must be refused';
  exception when check_violation then null;
  end;
  begin
    update public.github_connections set is_main = true
    where tenant_id = '00000000-0000-0000-0000-000000000001' and user_id = 'user-1' and login = 'acct-2';
    raise exception '039: two main accounts must be refused';
  exception when unique_violation then null;
  end;
  if has_table_privilege('anon', 'public.github_connections', 'select') or has_table_privilege('authenticated', 'public.github_connections', 'select') then
    raise exception '039: browser roles must not use github_connections';
  end if;
end $$;

rollback;
