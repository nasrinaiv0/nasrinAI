-- Long-term recall is service-role only, scoped to one user, and finds old chats.
\set ON_ERROR_STOP on

do $recall_permissions$
begin
  if has_function_privilege('anon', 'public.search_user_messages(uuid, text, text[], timestamptz, uuid, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.search_user_messages(uuid, text, text[], timestamptz, uuid, integer)', 'EXECUTE') then
    raise exception 'recall search must not be callable by browser roles';
  end if;
end;
$recall_permissions$;

do $recall_flow$
declare
  v_t constant uuid := '00000000-0000-0000-0000-000000000001';
  v_old uuid; v_other uuid; v_expired uuid;
  v jsonb;
begin
  insert into public.conversations (tenant_id, owner_type, owner_id, title) values (v_t, 'user', 'recall-a', 'Old chat') returning id into v_old;
  insert into public.conversations (tenant_id, owner_type, owner_id, title) values (v_t, 'user', 'recall-b', 'Someone else') returning id into v_other;
  insert into public.conversations (tenant_id, owner_type, owner_id, title, expires_at) values (v_t, 'user', 'recall-a', 'Expired', now() - interval '1 day') returning id into v_expired;
  insert into public.messages (conversation_id, tenant_id, role, content, created_at) values
    (v_old, v_t, 'user', 'My bakery invoice template uses Supabase webhooks', now() - interval '400 days'),
    (v_other, v_t, 'user', 'Private bakery invoice of another person', now()),
    (v_expired, v_t, 'user', 'Expired bakery invoice', now());
  v := public.search_user_messages(v_t, 'recall-a', array['bakery', 'invoic'], null, null, 12);
  if jsonb_array_length(v) <> 1 or v->0->>'title' <> 'Old chat' then raise exception 'expected only the user''s own unexpired old chat: %', v; end if;
  if public.search_user_messages(v_t, 'recall-a', array['bakery'], now() - interval '30 days', null, 12) <> '[]'::jsonb then raise exception 'time window not applied'; end if;
  if public.search_user_messages(v_t, 'recall-a', array['bakery'], null, v_old, 12) <> '[]'::jsonb then raise exception 'excluded chat returned'; end if;
  begin
    perform public.search_user_messages(v_t, 'recall-a', array['x'' | y'], null, null, 12);
    raise exception 'unsafe term accepted';
  exception when raise_exception then
    if sqlerrm = 'unsafe term accepted' then raise; end if;
  end;
  delete from public.conversations where id in (v_old, v_other, v_expired);
end;
$recall_flow$;
