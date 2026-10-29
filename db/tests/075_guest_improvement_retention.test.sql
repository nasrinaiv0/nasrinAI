-- Regression checks for Guest improvement retention policy (migration 075).
begin;
do $$
declare
  v_nullable text;
  v_purge text;
  v_review text;
begin
  select is_nullable into v_nullable
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'improvement_examples'
     and column_name = 'expires_at';
  if v_nullable <> 'YES' then
    raise exception 'improvement_examples.expires_at must allow NULL for authorized non-expiring examples';
  end if;

  select pg_get_functiondef('public.purge_improvement_examples()'::regprocedure) into v_purge;
  if position('subject_type = ''guest'' and e.created_at < now() - interval ''24 hours''' in v_purge) > 0 then
    raise exception 'Guest improvement examples must not be purged merely due to guest-session age';
  end if;
  if position('expires_at is not null and e.expires_at <= now()' in v_purge) = 0 then
    raise exception 'Purge must delete only examples with an explicit expired timestamp';
  end if;

  select pg_get_functiondef('public.review_improvement_example(uuid,uuid,text,text,text)'::regprocedure) into v_review;
  if position('e.expires_at is null or e.expires_at > now()' in v_review) = 0 then
    raise exception 'Review function must support non-expiring examples';
  end if;
end;
$$;
rollback;
