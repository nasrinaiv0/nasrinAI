-- Regression tests for the trusted public knowledge index.
\set ON_ERROR_STOP on
begin;
do $$
declare
  v_first jsonb;
  v_same jsonb;
  v_update jsonb;
  v_doc_id uuid;
  v_docs integer;
  v_chunks integer;
  v_def text;
  v_hash_a text := md5('ci-index-test-a') || md5('ci-index-test-b');
  v_hash_b text := md5('ci-index-test-c') || md5('ci-index-test-d');
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='knowledge_docs' and column_name='source_content_hash'
  ) then
    raise exception 'source_content_hash column is missing';
  end if;

  if has_function_privilege('anon', 'public.upsert_platform_knowledge_doc(uuid,text,text,text,integer,text[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.upsert_platform_knowledge_doc(uuid,text,text,text,integer,text[])', 'EXECUTE') then
    raise exception 'browser roles must not execute the platform knowledge index function';
  end if;
  if not has_function_privilege('service_role', 'public.upsert_platform_knowledge_doc(uuid,text,text,text,integer,text[])', 'EXECUTE') then
    raise exception 'service_role must be able to execute the platform knowledge index function';
  end if;

  select pg_get_functiondef('public.upsert_platform_knowledge_doc(uuid,text,text,text,integer,text[])'::regprocedure) into v_def;
  if position('SECURITY DEFINER' in upper(v_def)) = 0
     or position('search_path=pg_catalog,public,pg_temp' in replace(v_def, ' ', '')) = 0 then
    raise exception 'index function must be SECURITY DEFINER with a fixed safe search_path';
  end if;

  v_first := public.upsert_platform_knowledge_doc(
    '00000000-0000-0000-0000-000000000001',
    'CI indexing test',
    'https://www.typescriptlang.org/continuous-intelligence-test/',
    v_hash_a,
    30,
    array['A trusted TypeScript documentation chunk for idempotency testing.']
  );
  if v_first->>'action' <> 'inserted' or v_first->>'changed' <> 'true' then
    raise exception 'first upsert should insert a managed document: %', v_first;
  end if;
  v_doc_id := (v_first->>'doc_id')::uuid;

  v_same := public.upsert_platform_knowledge_doc(
    '00000000-0000-0000-0000-000000000001',
    'CI indexing test',
    'https://www.typescriptlang.org/continuous-intelligence-test/',
    v_hash_a,
    30,
    array['A trusted TypeScript documentation chunk for idempotency testing.']
  );
  if v_same->>'action' <> 'unchanged' or v_same->>'changed' <> 'false' then
    raise exception 'same hash should be a no-op: %', v_same;
  end if;

  v_update := public.upsert_platform_knowledge_doc(
    '00000000-0000-0000-0000-000000000001',
    'CI indexing test updated',
    'https://www.typescriptlang.org/continuous-intelligence-test/',
    v_hash_b,
    38,
    array['Updated TypeScript documentation chunk.']
  );
  if v_update->>'action' <> 'updated' or v_update->>'changed' <> 'true' then
    raise exception 'changed hash should update existing managed document: %', v_update;
  end if;

  select count(*)::integer into v_docs
    from public.knowledge_docs
   where tenant_id='00000000-0000-0000-0000-000000000001'
     and source_url='https://www.typescriptlang.org/continuous-intelligence-test/'
     and source_content_hash is not null;
  select count(*)::integer into v_chunks
    from public.knowledge_chunks
   where doc_id=v_doc_id and tenant_id='00000000-0000-0000-0000-000000000001';

  if v_docs <> 1 or v_chunks <> 1 then
    raise exception 'upsert must keep exactly one managed document and replace its chunks (docs %, chunks %)', v_docs, v_chunks;
  end if;
  if not exists (
    select 1 from public.knowledge_docs
     where id=v_doc_id and title='CI indexing test updated' and who=array['user','guest']::text[] and source_content_hash=v_hash_b
  ) then
    raise exception 'updated document metadata/audience/hash is incorrect';
  end if;
end;
$$;
rollback;
select 'continuous intelligence knowledge index regression checks passed' as result;
