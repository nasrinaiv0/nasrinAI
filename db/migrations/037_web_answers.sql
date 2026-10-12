-- NasrinAI web answers (migration 037). docs/web-answers.md
-- =============================================================================
-- Run once in the Supabase SQL editor, after 001-036. Safe to run again.
--
-- Owner decision (2026-10-12): every NasrinAI reply that used the internet
-- (web search, or pages from links shared in the chat) is kept permanently,
-- with its sources. No owner, tenant, session or conversation is stored; the
-- question is kept only for signed-in people (guests' input is kept 24 h only).
-- Contact details are removed by the server before saving.
-- Only the server (service role) can read or write this table.
-- =============================================================================

begin;

create table if not exists public.web_answers (
  id          uuid primary key default gen_random_uuid(),
  question    text check (question is null or char_length(question) between 1 and 4000),
  answer      text not null check (char_length(answer) between 1 and 20000),
  sources     jsonb not null check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) between 1 and 10),
  created_at  timestamptz not null default now()
);
create index if not exists web_answers_created_idx on public.web_answers (created_at desc);

do $migration$
begin
  execute 'REVOKE ALL PRIVILEGES ON TABLE public.web_answers FROM PUBLIC, anon, authenticated';
  execute 'ALTER TABLE public.web_answers ENABLE ROW LEVEL SECURITY';
  execute 'DROP POLICY IF EXISTS server_only_deny_browser ON public.web_answers';
  execute 'CREATE POLICY server_only_deny_browser ON public.web_answers FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
end
$migration$;

commit;
