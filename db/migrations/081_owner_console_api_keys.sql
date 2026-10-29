-- Owner Command Center: create, list and revoke NasrinAI API keys.
-- Keys are secret (nss_) keys for the platform tenant with the 'chat' scope.
-- The full key is returned once at creation; only its SHA-256 hash is stored.
-- Every create/revoke writes an owner audit event in the same transaction.
-- Service-role only; the browser never reaches these functions directly.

begin;

alter table public.owner_audit_events drop constraint if exists owner_audit_events_event_type_check;
alter table public.owner_audit_events add constraint owner_audit_events_event_type_check
  check (event_type in ('session_issued','session_revoked','usage_export','incident_created','incident_acknowledged','incident_resolved','api_key_created','api_key_revoked'));

create or replace function public.owner_console_create_api_key(p_label text, p_actor_id text, p_ip_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $owner_key_create$
declare
  v_tenant constant uuid := '00000000-0000-0000-0000-000000000001';
  v_label  text := btrim(coalesce(p_label, ''));
  v_id     text;
  v_secret text;
begin
  if char_length(v_label) not between 1 and 80 or v_label ~ '[[:cntrl:]]' then
    raise exception 'label must be 1 to 80 printable characters';
  end if;
  if p_actor_id is null or char_length(p_actor_id) not between 1 and 80 or coalesce(p_ip_hash, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid owner audit context';
  end if;
  -- Serialise creation so the active-key cap cannot be raced.
  perform pg_advisory_xact_lock(hashtext('owner_console_create_api_key'));
  if (select count(*) from public.api_keys where tenant_id = v_tenant and kind = 'secret' and revoked_at is null) >= 20 then
    raise exception 'active key limit reached; revoke an unused key first';
  end if;
  loop
    v_id := encode(extensions.gen_random_bytes(6), 'hex');
    exit when not exists (select 1 from public.api_keys where id = v_id);
  end loop;
  v_secret := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.api_keys (id, tenant_id, kind, label, secret_hash, scopes, allowed_origins)
  values (v_id, v_tenant, 'secret', v_label, encode(extensions.digest(v_secret, 'sha256'), 'hex'), array['chat']::text[], '{}'::text[]);
  insert into public.owner_audit_events (event_type, actor_id, ip_hash, outcome)
  values ('api_key_created', p_actor_id, p_ip_hash, 'success');
  return 'nss_' || v_id || '_' || v_secret;
end;
$owner_key_create$;

create or replace function public.owner_console_list_api_keys()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $owner_key_list$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', k.id, 'label', k.label, 'scopes', k.scopes, 'created_at', k.created_at, 'revoked_at', k.revoked_at
  ) order by k.revoked_at is not null, k.created_at desc), '[]'::jsonb)
  from (
    select id, label, scopes, created_at, revoked_at from public.api_keys
    where tenant_id = '00000000-0000-0000-0000-000000000001' and kind = 'secret'
    order by created_at desc limit 100
  ) k;
$owner_key_list$;

create or replace function public.owner_console_revoke_api_key(p_id text, p_actor_id text, p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $owner_key_revoke$
declare
  v_count integer;
begin
  if coalesce(p_id, '') !~ '^[0-9a-f]{12}$' then raise exception 'invalid key id'; end if;
  if p_actor_id is null or char_length(p_actor_id) not between 1 and 80 or coalesce(p_ip_hash, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid owner audit context';
  end if;
  update public.api_keys set revoked_at = now()
  where id = p_id and tenant_id = '00000000-0000-0000-0000-000000000001' and kind = 'secret' and revoked_at is null;
  get diagnostics v_count = row_count;
  if v_count = 0 then return false; end if;
  insert into public.owner_audit_events (event_type, actor_id, ip_hash, outcome)
  values ('api_key_revoked', p_actor_id, p_ip_hash, 'success');
  return true;
end;
$owner_key_revoke$;

revoke execute on function public.owner_console_create_api_key(text, text, text),
                           public.owner_console_list_api_keys(),
                           public.owner_console_revoke_api_key(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.owner_console_create_api_key(text, text, text),
                          public.owner_console_list_api_keys(),
                          public.owner_console_revoke_api_key(text, text, text)
  to service_role;

commit;
