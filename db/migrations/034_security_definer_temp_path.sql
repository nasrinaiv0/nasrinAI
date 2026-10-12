-- Migration 034: explicitly place pg_temp last for SECURITY DEFINER routines
-- configured by migration 024. Application objects remain schema-qualified.
begin;
alter function public.add_plan_period(uuid, text, text, integer, text, text, integer, text) set search_path = pg_catalog, public, pg_temp;
alter function public.delete_user_data(uuid, text) set search_path = pg_catalog, public, pg_temp;
alter function public.grant_plan(text, text, integer) set search_path = pg_catalog, public, pg_temp;
alter function public.purge_retention() set search_path = pg_catalog, public, pg_temp;
alter function public.purge_retention(integer) set search_path = pg_catalog, public, pg_temp;
alter function public.purge_user_data_before(uuid, text, timestamptz, boolean) set search_path = pg_catalog, public, pg_temp;
alter function public.search_knowledge(uuid, text, text, integer) set search_path = pg_catalog, public, pg_temp;
alter function public.search_library(uuid, text, text, integer) set search_path = pg_catalog, public, pg_temp;
alter function public.search_library_scoped(uuid, text, uuid, text, integer) set search_path = pg_catalog, public, pg_temp;
alter function public.usage_cost_since(timestamptz) set search_path = pg_catalog, public, pg_temp;
alter function public.purge_improvement_consent() set search_path = pg_catalog, public, pg_temp;
alter function public.purge_improvement_examples() set search_path = pg_catalog, public, pg_temp;
alter function public.review_improvement_example(uuid, uuid, text, text, text) set search_path = pg_catalog, public, pg_temp;
alter function public.delete_improvement_examples_for_subject(uuid, text, text, uuid, text) set search_path = pg_catalog, public, pg_temp;
commit;
