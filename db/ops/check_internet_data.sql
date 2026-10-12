-- ============================================================
--  WHAT DID NASRIN LEARN FROM THE INTERNET?
--  (safe: it only LOOKS, never changes anything)
-- ============================================================
--  How to use:
--    1. Supabase -> SQL Editor -> New query
--    2. Paste this whole file, press Run
--    3. You get ONE table: the newest saved internet answers,
--       with a summary row at the top.
--
--  Want something else? Each PART below is switched off with "-- ".
--  Supabase shows only the LAST answer, so: select just that part's
--  lines, remove the "-- " in front of them, and press Run.
--
--  If you see an error: run db/ops/check_setup.sql first.
-- ============================================================

-- MAIN: summary on top, then the 20 newest internet answers.
-- (question is empty for guests: only signed-in questions are kept)
(
  select
    now()                                             as saved_at,
    '📊 SUMMARY'                                      as what,
    'total: ' || (select count(*) from public.web_answers)
      || ' · last 24h: ' || (select count(*) from public.web_answers where created_at > now() - interval '1 day')
      || ' · web searches today: ' || (select count(*) from public.usage_events where task = 'web' and outcome = 'ok' and created_at > now() - interval '1 day')
      || ' · facts waiting for review: ' || (select count(*) from public.research_facts where status = 'pending')
                                                      as answer_start,
    null::int                                         as sources,
    null::text                                        as first_source
)
union all
(
  select
    created_at,
    coalesce(left(question, 80), '(guest question)'),
    left(answer, 200),
    jsonb_array_length(sources),
    sources -> 0 ->> 'url'
  from public.web_answers
  order by created_at desc
  limit 20
)
order by saved_at desc;


-- ------------------------------------------------------------
-- PART 2: is the web search working? (newest 10 tries)
--   outcome ok = it worked · provider_error/timeout = it failed
-- ------------------------------------------------------------
-- select created_at, model, outcome
-- from public.usage_events
-- where task = 'web'
-- order by created_at desc
-- limit 10;


-- ------------------------------------------------------------
-- PART 3: facts from research scans (pending = waiting for you)
-- ------------------------------------------------------------
-- select created_at, status, fact, source_url
-- from public.research_facts
-- order by created_at desc
-- limit 20;


-- ------------------------------------------------------------
-- PART 4: one full answer with all its links
--   (copy an answer's first words into the quotes)
-- ------------------------------------------------------------
-- select created_at, question, answer, sources
-- from public.web_answers
-- where answer ilike '%PUT A FEW WORDS HERE%'
-- order by created_at desc
-- limit 1;
