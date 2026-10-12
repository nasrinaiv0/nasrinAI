-- Migration 036: research scans are owner-scoped and expire; shared facts carry
-- no owner or question; browser roles cannot read either table.
\set ON_ERROR_STOP on
begin;

insert into public.tenants (id, name) values ('00000000-0000-4000-8000-0000000003a6', 'research test') on conflict do nothing;

insert into public.research_scans (tenant_id, owner_type, owner_id, query, expires_at)
values ('00000000-0000-4000-8000-0000000003a6', 'guest', 'g1', 'old question', now() - interval '1 minute'),
       ('00000000-0000-4000-8000-0000000003a6', 'guest', 'g2', 'new question', now() + interval '1 day');
select public.purge_research();

do $$
declare cols text[];
begin
  if (select count(*) from public.research_scans where tenant_id = '00000000-0000-4000-8000-0000000003a6') <> 1 then
    raise exception '036: expired scans must be purged, others kept';
  end if;
  select array_agg(column_name::text order by column_name) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'research_facts';
  if cols && array['query', 'owner_id', 'owner_type', 'tenant_id', 'session_id'] then
    raise exception '036: research_facts must not hold who asked or what: %', cols;
  end if;
  if has_table_privilege('anon', 'public.research_facts', 'select') or has_table_privilege('authenticated', 'public.research_scans', 'select') then
    raise exception '036: browser roles must not read research tables';
  end if;
  begin
    insert into public.research_facts (fact, source_url, fact_hash) values ('short', 'https://example.com', repeat('a', 64));
    raise exception '036: too-short facts must be refused';
  exception when check_violation then null;
  end;
end $$;

rollback;
