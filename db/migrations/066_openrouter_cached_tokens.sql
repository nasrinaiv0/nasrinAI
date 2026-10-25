-- NasrinAI migration 066: cached token usage for owner-only OpenRouter telemetry.
-- Values are provider-reported and remain NULL when the response omits cached-token details.
begin;

alter table public.openrouter_logs
  add column if not exists cached_tokens bigint;

alter table public.openrouter_logs
  drop constraint if exists openrouter_logs_cached_tokens_nonnegative;

alter table public.openrouter_logs
  add constraint openrouter_logs_cached_tokens_nonnegative
    check (cached_tokens is null or cached_tokens >= 0);

comment on column public.openrouter_logs.cached_tokens is
  'Provider-reported cached input tokens; NULL means unavailable, not zero.';

commit;
