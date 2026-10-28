-- Index trusted public programming documentation into the existing platform knowledge/RAG path.
-- Idempotent and additive: existing manually curated knowledge documents remain untouched.
begin;

alter table public.knowledge_docs
  add column if not exists source_content_hash text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.knowledge_docs'::regclass
      and conname = 'knowledge_docs_source_content_hash_check'
  ) then
    alter table public.knowledge_docs
      add constraint knowledge_docs_source_content_hash_check
      check (source_content_hash is null or source_content_hash ~ '^[0-9a-f]{64}$');
  end if;
end;
$$;

create unique index if not exists knowledge_docs_managed_source_unique
  on public.knowledge_docs (tenant_id, source_url)
  where source_content_hash is not null and source_url is not null;

create or replace function public.upsert_platform_knowledge_doc(
  p_tenant_id uuid,
  p_title text,
  p_source_url text,
  p_content_hash text,
  p_chars integer,
  p_chunks text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_doc_id uuid;
  v_existing_hash text;
  v_action text;
  v_chunk_count integer;
begin
  if p_tenant_id is null or not exists (
    select 1 from public.tenants t
    where t.id = p_tenant_id and t.kind = 'platform' and t.status = 'active'
  ) then
    raise exception 'platform tenant required' using errcode = '22023';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception 'invalid title' using errcode = '22023';
  end if;
  if p_source_url is null or char_length(p_source_url) not between 9 and 2000
     or p_source_url !~ '^https://[^/@?#]+(/|$)' then
    raise exception 'invalid HTTPS source URL' using errcode = '22023';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid content hash' using errcode = '22023';
  end if;
  if p_chars is null or p_chars < 1 or p_chars > 20000 then
    raise exception 'invalid character count' using errcode = '22023';
  end if;
  if p_chunks is null or coalesce(array_length(p_chunks, 1), 0) < 1
     or array_length(p_chunks, 1) > 100 then
    raise exception 'invalid chunks' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_chunks) as c(chunk)
    where c.chunk is null or char_length(btrim(c.chunk)) < 1 or char_length(c.chunk) > 1200
  ) then
    raise exception 'invalid chunk text' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_source_url, 0));

  select d.id, d.source_content_hash
    into v_doc_id, v_existing_hash
    from public.knowledge_docs d
   where d.tenant_id = p_tenant_id
     and d.source_url = p_source_url
     and d.source_content_hash is not null
   for update;

  if v_doc_id is not null and v_existing_hash = p_content_hash then
    select count(*)::integer into v_chunk_count
      from public.knowledge_chunks c
     where c.doc_id = v_doc_id and c.tenant_id = p_tenant_id;
    return jsonb_build_object('doc_id', v_doc_id, 'changed', false, 'action', 'unchanged', 'chunk_count', v_chunk_count);
  end if;

  if v_doc_id is null then
    insert into public.knowledge_docs (tenant_id, title, source_url, who, chars, source_content_hash)
    values (p_tenant_id, btrim(p_title), p_source_url, array['user','guest']::text[], p_chars, p_content_hash)
    returning id into v_doc_id;
    v_action := 'inserted';
  else
    update public.knowledge_docs
       set title = btrim(p_title),
           who = array['user','guest']::text[],
           chars = p_chars,
           source_content_hash = p_content_hash,
           updated_at = now()
     where id = v_doc_id and tenant_id = p_tenant_id;
    delete from public.knowledge_chunks
     where doc_id = v_doc_id and tenant_id = p_tenant_id;
    v_action := 'updated';
  end if;

  insert into public.knowledge_chunks (doc_id, tenant_id, idx, text)
  select v_doc_id, p_tenant_id, (entry.ordinality - 1)::integer, entry.chunk
    from unnest(p_chunks) with ordinality as entry(chunk, ordinality);

  select count(*)::integer into v_chunk_count
    from public.knowledge_chunks c
   where c.doc_id = v_doc_id and c.tenant_id = p_tenant_id;

  return jsonb_build_object('doc_id', v_doc_id, 'changed', true, 'action', v_action, 'chunk_count', v_chunk_count);
end;
$function$;

revoke all on function public.upsert_platform_knowledge_doc(uuid, text, text, text, integer, text[]) from public, anon, authenticated;
grant execute on function public.upsert_platform_knowledge_doc(uuid, text, text, text, integer, text[]) to service_role;

commit;
