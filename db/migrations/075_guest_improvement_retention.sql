-- Guest improvement retention: preserve eligible examples without routine expiry.
-- Raw Guest conversations retain their existing 24-hour expiry. This migration
-- changes only the separate, screened improvement-example store.
begin;
alter table public.improvement_examples alter column expires_at drop not null;
create or replace function public.review_improvement_example(
  p_tenant_id uuid,
  p_example_id uuid,
  p_reviewer_id text,
  p_decision text,
  p_reason_code text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_count integer;
begin
  if p_tenant_id is null or p_example_id is null
     or p_reviewer_id is null or char_length(trim(p_reviewer_id)) not between 1 and 80 then
    raise exception 'invalid review request' using errcode = '22023';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'invalid review decision' using errcode = '22023';
  end if;
  if p_reason_code is null or p_reason_code not in (
    'meets_quality_bar', 'unclear', 'sensitive_content',
    'possible_identifier', 'duplicate', 'out_of_scope', 'other'
  ) then
    raise exception 'invalid review reason' using errcode = '22023';
  end if;

  update public.improvement_examples e
     set status = p_decision,
         reviewed_at = now(),
         reviewer_id = trim(p_reviewer_id)
   where e.id = p_example_id
     and e.tenant_id = p_tenant_id
     and e.status = 'pending_review'
     and (e.expires_at is null or e.expires_at > now())
     and exists (
       select 1
         from public.improvement_consent_events c
        where c.tenant_id = e.tenant_id
          and c.subject_type = e.subject_type
          and c.subject_id = e.subject_id
          and c.version = e.consent_version
          and c.decision = 'granted'
          and c.id = (
            select c2.id
              from public.improvement_consent_events c2
             where c2.tenant_id = e.tenant_id
               and c2.subject_type = e.subject_type
               and c2.subject_id = e.subject_id
             order by c2.created_at desc, c2.id desc
             limit 1
          )
     );
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'example is missing, expired, already reviewed, or lacks active consent'
      using errcode = 'P0002';
  end if;

  insert into public.improvement_example_review_events
    (tenant_id, example_id, reviewer_id, decision, reason_code)
  values
    (p_tenant_id, p_example_id, trim(p_reviewer_id), p_decision, p_reason_code);
end;
$function$;
create or replace function public.purge_improvement_consent()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  delete from public.improvement_consent_events
    where subject_type = 'guest' and created_at < now() - interval '24 hours'
      and not exists (select 1 from public.improvement_examples e where e.tenant_id = improvement_consent_events.tenant_id and e.subject_type = improvement_consent_events.subject_type and e.subject_id = improvement_consent_events.subject_id);
  delete from public.improvement_consent_events
    where subject_type = 'user' and created_at < now() - interval '10 years'
      and not exists (select 1 from public.improvement_examples e where e.tenant_id = improvement_consent_events.tenant_id and e.subject_type = improvement_consent_events.subject_type and e.subject_id = improvement_consent_events.subject_id);
end;
$function$;
create or replace function public.purge_improvement_examples()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  r record;
  v_ids uuid[];
  v_reason text;
begin
  for r in
    select e.tenant_id,
           'retention_expiry' as reason_code,
           array_agg(e.id) as ids
      from public.improvement_examples e
     where e.expires_at is not null and e.expires_at <= now()
     group by e.tenant_id
  loop
    delete from public.improvement_examples e
     where e.tenant_id = r.tenant_id and e.id = any(r.ids);
    insert into public.improvement_example_deletion_events
      (request_id, tenant_id, reason_code, deleted_example_ids, deleted_count)
    values (gen_random_uuid(), r.tenant_id, r.reason_code, r.ids, cardinality(r.ids));
  end loop;

  for r in
    select e.tenant_id, e.subject_type, e.subject_id, array_agg(e.id) as ids
      from public.improvement_examples e
     where not exists (
       select 1
         from public.improvement_consent_events c
        where c.tenant_id = e.tenant_id
          and c.subject_type = e.subject_type
          and c.subject_id = e.subject_id
          and c.version = e.consent_version
          and c.decision = 'granted'
          and c.id = (
            select c2.id
              from public.improvement_consent_events c2
             where c2.tenant_id = e.tenant_id
               and c2.subject_type = e.subject_type
               and c2.subject_id = e.subject_id
             order by c2.created_at desc, c2.id desc
             limit 1
          )
     )
     group by e.tenant_id, e.subject_type, e.subject_id
  loop
    delete from public.improvement_examples e
     where e.tenant_id = r.tenant_id
       and e.subject_type = r.subject_type
       and e.subject_id = r.subject_id;
    v_reason := 'no_active_consent';
    insert into public.improvement_example_deletion_events
      (request_id, tenant_id, reason_code, deleted_example_ids, deleted_count)
    values (gen_random_uuid(), r.tenant_id, v_reason, r.ids, cardinality(r.ids));
  end loop;
end;
$function$;
commit;
