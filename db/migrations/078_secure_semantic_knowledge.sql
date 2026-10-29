-- Secure global index for curated public technical documentation.
-- This deliberately does not reuse tenant-scoped knowledge_docs/chunks.
begin;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
-- Support Supabase installations that keep extensions in either public or extensions.
set local search_path to public, extensions, pg_catalog;

create table if not exists public.public_technical_chunks (
  id uuid primary key default gen_random_uuid(),
  source_url text not null check (char_length(source_url) between 8 and 2000 and source_url ~ '^https://'),
  source_host text not null check (char_length(source_host) between 1 and 253),
  title text not null default '' check (char_length(title) <= 200),
  chunk_index integer not null check (chunk_index between 0 and 100),
  content text not null check (char_length(content) between 1 and 5000),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  embedding vector(384) not null,
  embedding_model text not null check (char_length(embedding_model) between 1 and 120),
  fetched_at timestamptz not null,
  indexed_at timestamptz not null default now(),
  unique(source_url, chunk_index)
);
create index if not exists public_technical_chunks_embedding_hnsw
  on public.public_technical_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists public_technical_chunks_host_idx on public.public_technical_chunks(source_host);
create index if not exists public_technical_chunks_fetched_idx on public.public_technical_chunks(fetched_at desc);

alter table public.public_technical_chunks enable row level security;
revoke all on table public.public_technical_chunks from public, anon, authenticated;
grant select, insert, update, delete on table public.public_technical_chunks to service_role;

create table if not exists public.knowledge_learning_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running','succeeded','partial','failed')),
  seed_count integer not null default 0 check (seed_count between 0 and 100),
  crawl_processed integer not null default 0 check (crawl_processed between 0 and 20),
  indexed_pages integer not null default 0 check (indexed_pages between 0 and 20),
  indexed_chunks integer not null default 0 check (indexed_chunks between 0 and 100),
  skipped_unchanged integer not null default 0 check (skipped_unchanged between 0 and 100),
  embedding_failures integer not null default 0 check (embedding_failures between 0 and 100),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz not null default now()
);
create index if not exists knowledge_learning_runs_started_idx on public.knowledge_learning_runs(started_at desc);
alter table public.knowledge_learning_runs enable row level security;
revoke all on table public.knowledge_learning_runs from public, anon, authenticated;
grant select, insert, update on table public.knowledge_learning_runs to service_role;

create or replace function public.match_public_technical_chunks(
  query_embedding vector(384),
  allowed_hosts text[],
  match_model text,
  match_count integer default 5
)
returns table (
  source_url text, title text, content text, similarity double precision,
  fetched_at timestamptz, embedding_model text
)
language sql stable security invoker
set search_path = pg_catalog, public, extensions
as $fn$
  select c.source_url, c.title, c.content,
         (1 - (c.embedding <=> query_embedding))::double precision as similarity,
         c.fetched_at, c.embedding_model
  from public.public_technical_chunks c
  where c.source_host = any(allowed_hosts)
    and c.source_url like 'https://%'
    and c.embedding_model = match_model
  order by c.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 5), 5));
$fn$;
revoke all on function public.match_public_technical_chunks(vector, text[], text, integer) from public, anon, authenticated;
grant execute on function public.match_public_technical_chunks(vector, text[], text, integer) to service_role;
commit;
