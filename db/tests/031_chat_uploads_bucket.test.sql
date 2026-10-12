-- Migration 031: a private `chat-uploads` bucket with a 50 MB per-file limit;
-- other buckets are untouched.
\set ON_ERROR_STOP on

select to_regclass('storage.buckets') is null as no_storage \gset

\if :no_storage
  -- Plain Postgres (CI): exercise the migration against a minimal stand-in
  -- for Supabase's storage.buckets, then remove it.
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    updated_at timestamptz not null default now()
  );
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('media', 'media', false, 52428800, array['image/png']);

  \i db/migrations/031_chat_uploads_bucket.sql
  -- A bucket someone made public by hand is made private again.
  update storage.buckets set public = true where id = 'chat-uploads';
  \i db/migrations/031_chat_uploads_bucket.sql

  do $$
  begin
    if not exists (select 1 from storage.buckets where id = 'chat-uploads' and name = 'chat-uploads'
                   and not public and file_size_limit = 52428800 and allowed_mime_types is null) then
      raise exception '031: chat-uploads must be private with a 52428800-byte limit and no type list';
    end if;
    if (select allowed_mime_types from storage.buckets where id = 'media') is distinct from array['image/png'] then
      raise exception '031: other buckets must be untouched';
    end if;
  end $$;

  drop schema storage cascade;
\else
  -- Real Supabase database: check the applied state only.
  do $$
  begin
    if not exists (select 1 from storage.buckets where id = 'chat-uploads' and not public and file_size_limit = 52428800) then
      raise exception '031: chat-uploads must exist, private, with a 52428800-byte limit';
    end if;
  end $$;
\endif
