-- Migration 033: a run must belong to the exact tenant/owner identity of its workflow.
-- Fail closed if existing rows violate the relationship; do not silently rewrite data.
begin;
do $migration$
begin
  if exists (
    select 1 from public.automation_runs r
    join public.automation_workflows w on w.id = r.workflow_id
    where (r.tenant_id, r.owner_type, r.owner_id)
      is distinct from (w.tenant_id, w.owner_type, w.owner_id)
  ) then
    raise exception '033 cannot apply: automation_runs contains workflow identity mismatches; investigate rows before retrying';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.automation_workflows'::regclass
      and conname = 'automation_workflows_identity_key') then
    alter table public.automation_workflows
      add constraint automation_workflows_identity_key unique (id, tenant_id, owner_type, owner_id);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.automation_runs'::regclass
      and conname = 'automation_runs_workflow_identity_fkey') then
    alter table public.automation_runs
      add constraint automation_runs_workflow_identity_fkey
      foreign key (workflow_id, tenant_id, owner_type, owner_id)
      references public.automation_workflows (id, tenant_id, owner_type, owner_id)
      on delete cascade;
  end if;
end
$migration$;
commit;
