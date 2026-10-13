-- Checks for migration 041 (NCC Meta channels and outbox). Run via db/tests/run.sh.
\set ON_ERROR_STOP on
set role service_role;
do $$
declare t constant uuid := '00000000-0000-0000-0000-000000000001';
declare c uuid; a uuid; ch uuid; o uuid;
begin
  insert into public.ncc_contacts (tenant_id, user_id, name) values (t, 'u-ch', 'Ana') returning id into c;
  insert into public.ncc_automations (tenant_id, user_id, name, trigger, actions) values (t, 'u-ch', 'Welcome', '{"type":"contact_created"}', '[]') returning id into a;
  insert into public.ncc_channels (tenant_id, user_id, kind, external_id, name, token_enc) values (t, 'u-ch', 'facebook_page', '1234567890', 'Cafe Uno', 'v1.aaa.bbb.ccc') returning id into ch;
  begin
    insert into public.ncc_channels (tenant_id, user_id, kind, external_id, token_enc) values (t, 'u-ch', 'whatsapp', '42', 'EAAplaintoken');
    raise exception 'a readable token was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.ncc_channels (tenant_id, user_id, kind, external_id, token_enc) values (t, 'u-ch', 'tiktok', '42', 'v1.a.b.c');
    raise exception 'an unknown channel kind was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.ncc_channels (tenant_id, user_id, kind, external_id, name, token_enc) values (t, 'u-ch', 'facebook_page', '1234567890', 'Again', 'v1.a.b.c');
    raise exception 'the same channel was connected twice';
  exception when unique_violation then null; end;
  insert into public.ncc_outbox (tenant_id, user_id, channel_id, automation_id, contact_id, action, payload) values (t, 'u-ch', ch, a, c, 'facebook_post', '{"text":"Hello"}') returning id into o;
  begin
    insert into public.ncc_outbox (tenant_id, user_id, channel_id, action, payload, status) values (t, 'u-ch', ch, 'facebook_post', '{}', 'maybe');
    raise exception 'an unknown outbox status was accepted';
  exception when check_violation then null; end;
  -- Deleting the automation keeps the item (no automation); deleting the contact or channel removes it.
  delete from public.ncc_automations where id = a;
  if (select automation_id from public.ncc_outbox where id = o) is not null then raise exception 'outbox kept a deleted automation'; end if;
  delete from public.ncc_contacts where id = c;
  if exists (select 1 from public.ncc_outbox where id = o) then raise exception 'an outbox item survived its contact'; end if;
  delete from public.ncc_channels where id = ch;
end $$;
reset role;
set role authenticated;
do $$ begin
  perform 1 from public.ncc_channels; raise exception 'a signed-in role could read NCC channel tokens';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform 1 from public.ncc_outbox; raise exception 'a signed-in role could read the NCC outbox';
exception when insufficient_privilege then null; end $$;
reset role;
set role anon;
do $$ begin
  perform 1 from public.ncc_channels; raise exception 'anon could read NCC channels';
exception when insufficient_privilege then null; end $$;
reset role;
select 'ncc channels checks passed' as result;
