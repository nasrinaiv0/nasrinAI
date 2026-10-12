-- ============================================================
--  IS EVERYTHING SET UP?   (safe: it only LOOKS, never changes)
-- ============================================================
--  How to use:
--    1. Supabase -> SQL Editor -> New query
--    2. Paste this whole file, press Run
--    3. Read the table that appears:
--         ✅ = good, nothing to do
--         ❌ = not done yet -> run the file named in "what to do"
-- ============================================================

with checks(step, thing, ok, what_to_do) as (
  values
  (1, 'Answer cache table (semantic_cache)',
      to_regclass('public.semantic_cache') is not null,
      'Run db/semantic_cache.sql'),

  (2, 'Upload box (chat-uploads bucket) exists',
      exists (select 1 from storage.buckets where id = 'chat-uploads'),
      'Run db/migrations/031_chat_uploads_bucket.sql'),

  (3, 'Upload box is private (nobody can peek)',
      exists (select 1 from storage.buckets where id = 'chat-uploads' and public = false),
      'Run db/migrations/031_chat_uploads_bucket.sql'),

  (4, 'Upload box takes any file type',
      exists (select 1 from storage.buckets where id = 'chat-uploads' and allowed_mime_types is null),
      'Run db/migrations/035_chat_uploads_allow_any_type.sql'),

  (5, 'Research notebook (research_scans)',
      to_regclass('public.research_scans') is not null,
      'Run db/migrations/036_research.sql'),

  (6, 'Shared facts list (research_facts)',
      to_regclass('public.research_facts') is not null,
      'Run db/migrations/036_research.sql'),

  (7, 'Research clean-up helper (purge_research)',
      to_regprocedure('public.purge_research()') is not null,
      'Run db/migrations/036_research.sql'),

  (8, 'Internet answers library (web_answers)',
      to_regclass('public.web_answers') is not null,
      'Run db/migrations/037_web_answers.sql')
)
select
  step,
  case when ok then '✅' else '❌' end as status,
  thing,
  case when ok then 'nothing - all good' else what_to_do end as what_to_do
from checks
order by step;

-- ------------------------------------------------------------
-- PART 2 (optional): how many things are stored right now.
-- Supabase shows only the LAST answer, so run this part on its own:
-- select just the 4 lines below (remove the "-- " first), then Run.
-- If it shows an error, something above was ❌ - fix that first.
-- ------------------------------------------------------------
-- select (select count(*) from public.semantic_cache) as answer_cache_rows,
--        (select count(*) from public.research_facts where status = 'pending') as facts_waiting_for_you,
--        (select count(*) from public.web_answers) as internet_answers_kept;
