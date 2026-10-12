-- Migration 037: web answers carry no owner or session; browsers cannot read them.
\set ON_ERROR_STOP on
begin;

insert into public.web_answers (question, answer, sources)
values (null, 'Tea comes from Camellia sinensis.', '[{"url": "https://example.com", "title": "Tea"}]');

do $$
declare cols text[];
begin
  select array_agg(column_name::text) into cols from information_schema.columns
   where table_schema = 'public' and table_name = 'web_answers';
  if cols && array['tenant_id', 'owner_id', 'owner_type', 'conversation_id', 'session_id', 'user_id'] then
    raise exception '037: web_answers must not hold who asked: %', cols;
  end if;
  if has_table_privilege('anon', 'public.web_answers', 'select') or has_table_privilege('authenticated', 'public.web_answers', 'insert') then
    raise exception '037: browser roles must not use web_answers';
  end if;
  begin
    insert into public.web_answers (answer, sources) values ('x', '[]');
    raise exception '037: an answer needs at least one source';
  exception when check_violation then null;
  end;
end $$;

rollback;
