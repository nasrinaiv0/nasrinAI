-- Regression tests for migration 061: every live-advisor FK finding has a leading-column index.
\set ON_ERROR_STOP on
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('public.ncc_activities', 'contact_id'),
      ('public.ncc_outbox', 'automation_id'),
      ('public.ncc_outbox', 'channel_id'),
      ('public.ncc_outbox', 'contact_id'),
      ('public.ncc_tasks', 'contact_id'),
      ('public.ncc_tasks', 'deal_id'),
      ('public.video_studio_audio_assets', 'project_id'),
      ('public.video_studio_timeline_items', 'audio_asset_id')
    ) as expected(table_name, column_name)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_index i
      join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
      join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
      join pg_catalog.pg_attribute a
        on a.attrelid = tbl.oid and a.attnum = i.indkey[0]
      where (ns.nspname || '.' || tbl.relname) = r.table_name
        and a.attname = r.column_name
        and i.indisvalid
        and i.indisready
        and i.indpred is null
    ) then
      raise exception 'missing valid leading-column index for %.%', r.table_name, r.column_name;
    end if;
  end loop;
end $$;
select 'migration 061 foreign-key index regression checks passed' as result;
