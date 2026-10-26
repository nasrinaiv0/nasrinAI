-- Migration 073: persist sanitized response usage metadata with each assistant message.
-- Contains counts/timing only; never provider payloads or prompt/completion content.
begin;

alter table public.messages
  add column if not exists response_metadata jsonb;

alter table public.messages
  drop constraint if exists messages_response_metadata_object;

alter table public.messages
  add constraint messages_response_metadata_object
  check (response_metadata is null or jsonb_typeof(response_metadata) = 'object');

comment on column public.messages.response_metadata is
  'Sanitized response details for this exact saved message: timestamp, duration, and provider-reported input/output token counts with provenance.';

commit;
