-- Migration 033: automation run/workflow identity must match exactly.
\set ON_ERROR_STOP on
do $$
declare
  tenant_a uuid := '00000000-0000-0000-0000-000000000001';
  tenant_b uuid;
  workflow_id uuid := '33000000-0000-4000-8000-000000000001';
  run_id uuid := '33000000-0000-4000-8000-000000000002';
begin
  select id into tenant_b from public.tenants where id <> tenant_a order by id limit 1;
  if tenant_b is null then
    raise exception '033 test requires a second tenant fixture to test cross-tenant mismatch';
  end if;
  insert into public.automation_workflows (id, tenant_id, owner_type, owner_id, name, definition)
  values (workflow_id, tenant_a, 'user', 'identity-test', 'identity-test', '{"steps":[{"type":"test"}]}'::jsonb);
  begin
    insert into public.automation_runs (id, tenant_id, workflow_id, owner_type, owner_id, trigger_type)
    values (run_id, tenant_b, workflow_id, 'user', 'identity-test', 'manual');
    raise exception '033 allowed a run to reference another tenant''s workflow';
  exception when foreign_key_violation then null;
  end;
  if exists (select 1 from public.automation_runs where id = run_id) then
    raise exception '033 invalid automation run row unexpectedly exists';
  end if;
  delete from public.automation_workflows where id = workflow_id;
end $$;
select 'automation workflow identity checks passed' as result;
