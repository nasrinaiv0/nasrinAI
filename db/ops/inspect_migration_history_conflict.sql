-- READ-ONLY production diagnostic for the historical migration label conflict.
-- Run in the intended Supabase project's SQL Editor. This script does not write
-- data, alter schema, or modify migration history.
--
-- First inspect the migration-history table's actual shape:
select table_schema, table_name, column_name, data_type
from information_schema.columns
where (table_schema, table_name) = ('supabase_migrations', 'schema_migrations')
order by ordinal_position;

-- If the table above exists and has version/name columns, inspect likely aliases.
-- If your project's schema uses different column names, adapt this SELECT only.
select version, name
from supabase_migrations.schema_migrations
where version like '%026%'
   or version like '%029%'
   or name ilike '%media_bucket_size_limit%'
   or name ilike '%daily_realtime_voice_allowances%'
order by version, name;

-- Check actual schema state independently of migration labels.
select
  to_regclass('public.realtime_voice_reservations') as realtime_voice_reservations_table,
  to_regprocedure('public.reserve_daily_realtime_voice(uuid,uuid,text,text,integer,integer)') as reserve_voice_rpc,
  to_regprocedure('public.settle_daily_realtime_voice(uuid)') as settle_voice_rpc,
  to_regprocedure('public.release_daily_realtime_voice(uuid)') as release_voice_rpc;

-- Inspect actual Storage bucket settings; no files are changed.
select id, public, file_size_limit, allowed_mime_types, updated_at
from storage.buckets
where id in ('media', 'chat-uploads')
order by id;

-- Inspect function execution grants; expected browser roles should not execute
-- the realtime reservation RPCs, and service_role should be able to execute them.
select
  p.oid::regprocedure as routine,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'reserve_daily_realtime_voice',
    'settle_daily_realtime_voice',
    'release_daily_realtime_voice'
  )
order by p.proname;

-- Decision guide:
-- 1. If media.file_size_limit is 52428800 but realtime_voice_reservations/RPCs
--    are absent, the history label likely masked a missing 026 feature migration.
--    Do NOT mark 026 as applied; plan the realtime migration after reviewing the
--    full schema and migration history.
-- 2. If both media cap and realtime objects exist, determine which exact SQL was
--    recorded under each version/name before changing history.
-- 3. If the media cap is absent, review storage bucket existence and current
--    object sizes before applying the media migration.
-- 4. Never edit/delete migration-history rows just to make labels line up.
