-- Tenant-scoped hybrid semantic + full-text retrieval for business-owned knowledge.
-- This never places private tenant content in the global public technical index.
begin;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
set local search_path to public, extensions, pg_catalog;

alter table public.knowledge_chunks
  add column if not exists embedding vector(384),
  add column if not exists embedding_model text;

create index if not exists knowledge_chunks_embedding_hnsw
  on public.knowledge_chunks using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create or replace function public.search_knowledge_hybrid(
  p_tenant uuid,
  p_terms text,
  p_query_embedding vector(384),
  p_embedding_model text,
  p_audience text,
  p_limit integer
)
returns table (
  doc_id uuid, title text, source_url text, idx integer, text text,
  rank real, semantic_similarity double precision
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $fn$
  with q as (
    select to_tsquery('simple', coalesce(nullif(p_terms, ''), '')) as tsq
  ),
  candidates as (
    select c.doc_id, d.title, d.source_url, c.idx, c.text,
      case
        when p_query_embedding is not null
          and c.embedding is not null
          and c.embedding_model = p_embedding_model
        then (
          0.65 * (1 - (c.embedding <=> p_query_embedding))
          + 0.35 * least(ts_rank_cd(c.tsv, q.tsq, 32), 1.0)
        )::real
        else ts_rank_cd(c.tsv, q.tsq, 32)
      end as combined_rank,
      case
        when p_query_embedding is not null
          and c.embedding is not null
          and c.embedding_model = p_embedding_model
        then (1 - (c.embedding <=> p_query_embedding))::double precision
        else null::double precision
      end as semantic_similarity
    from public.knowledge_chunks c
    join public.knowledge_docs d on d.id = c.doc_id and d.tenant_id = c.tenant_id
    cross join q
    where c.tenant_id = p_tenant
      and d.tenant_id = p_tenant
      and p_audience = any(d.who)
      and (
        c.tsv @@ q.tsq
        or (
          p_query_embedding is not null
          and c.embedding is not null
          and c.embedding_model = p_embedding_model
          and (c.embedding <=> p_query_embedding) < 0.75
        )
      )
  )
  select doc_id, title, source_url, idx, text, combined_rank, semantic_similarity
  from candidates
  order by combined_rank desc, idx asc
  limit least(greatest(coalesce(p_limit, 8), 1), 10);
$fn$;

revoke all on function public.search_knowledge_hybrid(uuid, text, vector, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.search_knowledge_hybrid(uuid, text, vector, text, text, integer) to service_role;
commit;
