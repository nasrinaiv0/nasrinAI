-- Direct-provider request/activity metadata for Owner Command Center.
-- Metadata only: never store prompts, completions, auth headers, or raw provider errors.
begin;

alter table public.usage_events
  add column if not exists request_id uuid not null default gen_random_uuid(),
  add column if not exists endpoint text,
  add column if not exists http_method text,
  add column if not exists http_status integer,
  add column if not exists error_code text,
  add column if not exists provider_request_id text,
  add column if not exists finish_reason text;

alter table public.usage_events
  drop constraint if exists usage_events_http_method_check,
  add constraint usage_events_http_method_check
    check (http_method is null or http_method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  drop constraint if exists usage_events_http_status_check,
  add constraint usage_events_http_status_check
    check (http_status is null or http_status between 100 and 599),
  drop constraint if exists usage_events_endpoint_check,
  add constraint usage_events_endpoint_check
    check (endpoint is null or (length(endpoint) <= 120 and endpoint ~ '^/[A-Za-z0-9/_-]+$')),
  drop constraint if exists usage_events_error_code_check,
  add constraint usage_events_error_code_check
    check (error_code is null or (length(error_code) <= 100 and error_code ~ '^[A-Za-z0-9_.-]+$')),
  drop constraint if exists usage_events_provider_request_id_check,
  add constraint usage_events_provider_request_id_check
    check (provider_request_id is null or length(provider_request_id) <= 200),
  drop constraint if exists usage_events_finish_reason_check,
  add constraint usage_events_finish_reason_check
    check (finish_reason is null or (length(finish_reason) <= 100 and finish_reason ~ '^[A-Za-z0-9_.-]+$'));

create index if not exists usage_events_provider_activity_idx
  on public.usage_events (provider, created_at desc);
create index if not exists usage_events_request_id_idx
  on public.usage_events (request_id);

comment on column public.usage_events.request_id is 'Stable per-event UUID for protected Owner Command Center activity correlation; not a user identifier.';
comment on column public.usage_events.provider_request_id is 'Provider-supplied request ID only; never a credential.';
comment on column public.usage_events.error_code is 'Sanitized error code only, not provider error body or message.';

commit;
