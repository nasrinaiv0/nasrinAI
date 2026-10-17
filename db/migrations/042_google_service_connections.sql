-- Independent Gmail and Google Calendar connections.
-- Encrypted tokens use tenant/user AAD; copying a row preserves decryptability.
begin;
alter table public.google_connections add column if not exists service text;
update public.google_connections set service='calendar' where service is null;
insert into public.google_connections (tenant_id,user_id,service,email,access_token_enc,refresh_token_enc,expires_at,scopes,connected_at,updated_at)
select tenant_id,user_id,'gmail',email,access_token_enc,refresh_token_enc,expires_at,scopes,connected_at,updated_at
from public.google_connections
where service='calendar' and scopes && array['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.modify','https://www.googleapis.com/auth/gmail.send']::text[]
on conflict (tenant_id,user_id,service) do nothing;
delete from public.google_connections where service='calendar' and not (scopes && array['https://www.googleapis.com/auth/calendar.readonly','https://www.googleapis.com/auth/calendar.events']::text[]);
alter table public.google_connections alter column service set not null;
alter table public.google_connections drop constraint if exists google_connections_pkey;
alter table public.google_connections add constraint google_connections_pkey primary key (tenant_id,user_id,service);
alter table public.google_connections add constraint google_connections_service_check check (service in ('gmail','calendar'));
commit;
