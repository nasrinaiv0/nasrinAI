-- Owner API keys: service-role only, hash-only storage, capped, platform-scoped and audited.
\set ON_ERROR_STOP on

do $owner_keys_permissions$
begin
  if has_function_privilege('anon', 'public.owner_console_create_api_key(text, text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.owner_console_create_api_key(text, text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.owner_console_list_api_keys()', 'EXECUTE')
     or has_function_privilege('anon', 'public.owner_console_revoke_api_key(text, text, text)', 'EXECUTE') then
    raise exception 'owner key functions must not be callable by browser roles';
  end if;
  if not has_function_privilege('service_role', 'public.owner_console_create_api_key(text, text, text)', 'EXECUTE') then
    raise exception 'service_role must create owner keys';
  end if;
end;
$owner_keys_permissions$;

set role service_role;
do $owner_keys_flow$
declare
  v_hash constant text := repeat('a', 64);
  v_key text;
  v_id text;
  v_list jsonb;
  v_audits_before bigint;
  v_other_tenant uuid := gen_random_uuid();
begin
  select count(*) into v_audits_before from public.owner_audit_events where event_type in ('api_key_created', 'api_key_revoked');
  v_key := public.owner_console_create_api_key('Test key', 'owner-test', v_hash);
  if v_key !~ '^nss_[0-9a-f]{12}_[0-9a-f]{48}$' then raise exception 'unexpected key shape'; end if;
  v_id := substr(v_key, 5, 12);
  if not exists (select 1 from public.api_keys where id = v_id and tenant_id = '00000000-0000-0000-0000-000000000001'
                 and kind = 'secret' and secret_hash = encode(extensions.digest(substr(v_key, 18), 'sha256'), 'hex')) then
    raise exception 'key must be stored as a platform secret hash';
  end if;
  v_list := public.owner_console_list_api_keys();
  if v_list::text like '%' || substr(v_key, 18) || '%' or v_list::text like '%secret_hash%' then
    raise exception 'list must not expose secrets or hashes';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_list) e where e->>'id' = v_id and e->>'label' = 'Test key') then
    raise exception 'list must include the new key';
  end if;
  begin
    perform public.owner_console_create_api_key('', 'owner-test', v_hash);
    raise exception 'empty label accepted';
  exception when raise_exception then
    if sqlerrm = 'empty label accepted' then raise; end if;
  end;
  if public.owner_console_revoke_api_key(v_id, 'owner-test', v_hash) is not true then raise exception 'revoke failed'; end if;
  if public.owner_console_revoke_api_key(v_id, 'owner-test', v_hash) is not false then raise exception 'second revoke must be a no-op'; end if;
  if (select count(*) from public.owner_audit_events where event_type in ('api_key_created', 'api_key_revoked')) - v_audits_before <> 2 then
    raise exception 'create and revoke must each write one audit event';
  end if;
end;
$owner_keys_flow$;
reset role;

-- Keys of other tenants are invisible to and cannot be revoked by the owner functions.
do $owner_keys_scope$
declare
  v_tenant uuid := gen_random_uuid();
begin
  insert into public.tenants (id, name, kind, daily_token_limit) values (v_tenant, 'Other business', 'business', 1000);
  insert into public.api_keys (id, tenant_id, kind, label, secret_hash) values ('abcabcabcabc', v_tenant, 'secret', 'other', repeat('b', 64));
  if public.owner_console_list_api_keys()::text like '%abcabcabcabc%' then raise exception 'other tenant keys must not be listed'; end if;
  if public.owner_console_revoke_api_key('abcabcabcabc', 'owner-test', repeat('a', 64)) then raise exception 'other tenant keys must not be revocable'; end if;
  delete from public.api_keys where id = 'abcabcabcabc';
  delete from public.tenants where id = v_tenant;
end;
$owner_keys_scope$;

delete from public.api_keys where label = 'Test key' and tenant_id = '00000000-0000-0000-0000-000000000001';
