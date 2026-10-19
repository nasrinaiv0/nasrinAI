-- Extend independent Google app connections to Drive, Meet, and Keep.
-- Keep migration 042 immutable because it may already be applied in production.
begin;
alter table public.google_connections drop constraint if exists google_connections_service_check;
alter table public.google_connections add constraint google_connections_service_check
  check (service in ('gmail','calendar','drive','meet','keep'));
commit;
