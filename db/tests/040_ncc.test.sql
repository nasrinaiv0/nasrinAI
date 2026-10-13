-- Checks for migration 040 (NCC CRM). Run via db/tests/run.sh.
\set ON_ERROR_STOP on
set role service_role;
do $$
declare t constant uuid := '00000000-0000-0000-0000-000000000001';
declare c uuid; d uuid; k uuid; a uuid; ch uuid; o uuid;
begin
  insert into public.ncc_contacts (tenant_id, user_id, name, email, tags) values (t, 'u-ncc', 'Ana Cruz', 'Ana@Example.com', '{vip}') returning id into c;
  insert into public.ncc_deals (tenant_id, user_id, contact_id, title, value) values (t, 'u-ncc', c, 'Catering for 50', 25000) returning id into d;
  update public.ncc_deals set stage = 'won' where id = d;

  -- One contact per email in an account, whatever the case; other accounts are separate.
  begin
    insert into public.ncc_contacts (tenant_id, user_id, name, email) values (t, 'u-ncc', 'Ana again', 'ana@example.COM');
    raise exception 'a duplicate email was accepted';
  exception when unique_violation then null; end;
  insert into public.ncc_contacts (tenant_id, user_id, name, email) values (t, 'u-other', 'Ana', 'ana@example.com');
  insert into public.ncc_contacts (tenant_id, user_id, name) values (t, 'u-ncc', 'No email one');
  insert into public.ncc_contacts (tenant_id, user_id, name) values (t, 'u-ncc', 'No email two');

  begin
    insert into public.ncc_deals (tenant_id, user_id, contact_id, title, stage) values (t, 'u-ncc', c, 'x', 'archived');
    raise exception 'an unknown stage was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.ncc_deals (tenant_id, user_id, contact_id, title, value) values (t, 'u-ncc', c, 'x', -1);
    raise exception 'a negative value was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.ncc_contacts (tenant_id, user_id, name, source) values (t, 'u-ncc', 'x', 'scraped');
    raise exception 'an unknown source was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.ncc_contacts (tenant_id, user_id, name) values (t, 'u-ncc', '');
    raise exception 'an empty name was accepted';
  exception when check_violation then null; end;

  insert into public.ncc_tasks (tenant_id, user_id, title, contact_id, deal_id, due_at) values (t, 'u-ncc', 'Call Ana', c, d, now() + interval '1 day') returning id into k;
  insert into public.ncc_activities (tenant_id, user_id, contact_id, kind, text) values (t, 'u-ncc', c, 'note', 'Wants a tasting first.');
  insert into public.ncc_automations (tenant_id, user_id, name, trigger, actions) values (t, 'u-ncc', 'Welcome', '{"type":"contact_created"}', '[{"type":"add_tag","tag":"new"}]') returning id into a;
  begin
    insert into public.ncc_activities (tenant_id, user_id, contact_id, kind, text) values (t, 'u-ncc', c, 'email_sent', 'x');
    raise exception 'an unknown timeline kind was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.ncc_automations (tenant_id, user_id, name, trigger, actions) values (t, 'u-ncc', 'Bad', '[]', '[]');
    raise exception 'a trigger that is not an object was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.ncc_automations (tenant_id, user_id, name, trigger, actions) values (t, 'u-ncc', 'Huge', '{"type":"contact_created"}', jsonb_build_array(repeat('x', 9000)));
    raise exception 'oversized actions were accepted';
  exception when check_violation then null; end;
  begin
    insert into public.ncc_tasks (tenant_id, user_id, title, origin) values (t, 'u-ncc', 'x', 'ai');
    raise exception 'an unknown task origin was accepted';
  exception when check_violation then null; end;

  insert into public.ncc_channels (tenant_id, user_id, kind, external_id, name, token_enc) values (t, 'u-ncc', 'facebook_page', '1234567890', 'Cafe Uno', 'v1.aaa.bbb.ccc') returning id into ch;
  begin
    insert into public.ncc_channels (tenant_id, user_id, kind, external_id, token_enc) values (t, 'u-ncc', 'whatsapp', '42', 'EAAplaintoken');
    raise exception 'a readable token was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.ncc_channels (tenant_id, user_id, kind, external_id, token_enc) values (t, 'u-ncc', 'tiktok', '42', 'v1.a.b.c');
    raise exception 'an unknown channel kind was accepted';
  exception when check_violation then null; end;
  insert into public.ncc_outbox (tenant_id, user_id, channel_id, automation_id, contact_id, action, payload) values (t, 'u-ncc', ch, a, c, 'facebook_post', '{"text":"Hello"}') returning id into o;
  begin
    insert into public.ncc_outbox (tenant_id, user_id, channel_id, action, payload, status) values (t, 'u-ncc', ch, 'facebook_post', '{}', 'maybe');
    raise exception 'an unknown outbox status was accepted';
  exception when check_violation then null; end;
  delete from public.ncc_automations where id = a;
  if (select automation_id from public.ncc_outbox where id = o) is not null then raise exception 'outbox kept a deleted automation'; end if;
  insert into public.ncc_automations (tenant_id, user_id, name, trigger, actions) values (t, 'u-ncc', 'Welcome', '{"type":"contact_created"}', '[{"type":"add_tag","tag":"new"}]') returning id into a;

  -- Deleting a contact deletes its deals, tasks and timeline; automations stay.
  delete from public.ncc_contacts where id = c;
  if exists (select 1 from public.ncc_deals where id = d) then raise exception 'a deal survived its contact'; end if;
  if exists (select 1 from public.ncc_tasks where id = k) then raise exception 'a task survived its contact'; end if;
  if exists (select 1 from public.ncc_activities where contact_id = c) then raise exception 'a timeline survived its contact'; end if;
  if not exists (select 1 from public.ncc_automations where id = a) then raise exception 'deleting a contact deleted an automation'; end if;
  if exists (select 1 from public.ncc_outbox where id = o) then raise exception 'an outbox item survived its contact'; end if;
  delete from public.ncc_automations where id = a;
  delete from public.ncc_channels where id = ch;
  delete from public.ncc_contacts where tenant_id = t and user_id in ('u-ncc', 'u-other');
end $$;
reset role;
set role anon;
do $$ begin
  perform 1 from public.ncc_contacts; raise exception 'anon could read NCC contacts';
exception when insufficient_privilege then null; end $$;
reset role;
set role authenticated;
do $$ begin
  perform 1 from public.ncc_deals; raise exception 'a signed-in role could read NCC deals directly';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform 1 from public.ncc_channels; raise exception 'a signed-in role could read NCC channel tokens';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform 1 from public.ncc_automations; raise exception 'a signed-in role could read NCC automations directly';
exception when insufficient_privilege then null; end $$;
reset role;
select 'ncc checks passed' as result;
