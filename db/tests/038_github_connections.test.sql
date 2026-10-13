-- Migration 038: GitHub tokens are stored only sealed; browsers cannot read them.
\set ON_ERROR_STOP on
begin;

insert into public.github_connections (tenant_id, user_id, login, access_token_enc, refresh_token_enc, expires_at)
values ('00000000-0000-0000-0000-000000000001', 'user-1', 'octo-cat', 'v1.aaa.bbb.ccc', 'v1.ddd.eee.fff', now() + interval '8 hours');

do $$
begin
  if has_table_privilege('anon', 'public.github_connections', 'select') or has_table_privilege('authenticated', 'public.github_connections', 'select')
     or has_table_privilege('authenticated', 'public.github_connections', 'insert') then
    raise exception '038: browser roles must not use github_connections';
  end if;
  begin
    insert into public.github_connections (tenant_id, user_id, login, access_token_enc)
    values ('00000000-0000-0000-0000-000000000001', 'user-2', 'someone', 'ghu_plaintexttoken');
    raise exception '038: a readable token must be refused';
  exception when check_violation then null;
  end;
  begin
    insert into public.github_connections (tenant_id, user_id, login, access_token_enc)
    values ('00000000-0000-0000-0000-000000000001', 'user-3', 'bad login!', 'v1.a.b.c');
    raise exception '038: a malformed login must be refused';
  exception when check_violation then null;
  end;
end $$;

rollback;
