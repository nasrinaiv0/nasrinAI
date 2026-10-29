-- Harden the SECURITY DEFINER owner dashboard against search_path object shadowing.
-- All application relations and helper functions in this function are schema-qualified.
alter function public.owner_console_dashboard(integer)
  set search_path = pg_catalog, pg_temp;
