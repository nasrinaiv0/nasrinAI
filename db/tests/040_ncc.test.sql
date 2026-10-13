-- Checks for migration 040 (NCC contacts and pipeline). Run via db/tests/run.sh.
\set ON_ERROR_STOP on
set role service_role;
do $$
declare t constant uuid := '00000000-0000-0000-0000-000000000001';
declare c uuid; d uuid;
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

  -- Deleting a contact deletes its deals.
  delete from public.ncc_contacts where id = c;
  if exists (select 1 from public.ncc_deals where id = d) then raise exception 'a deal survived its contact'; end if;
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
reset role;
select 'ncc checks passed' as result;
