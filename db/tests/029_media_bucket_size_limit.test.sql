-- Migration 029: the private media bucket gets a 50 MB upload limit; other
-- buckets and the bucket's privacy are untouched.
\set ON_ERROR_STOP on

select to_regclass('storage.buckets') is null as no_storage \gset

\if :no_storage
  -- Plain Postgres (CI): exercise the migration against a minimal stand-in
  -- for Supabase's storage.buckets, then remove it.
  create schema storage;
  create table storage.buckets (
    id text primary key,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    updated_at timestamptz not null default now()
  );
  insert into storage.buckets (id, public, allowed_mime_types)
  values ('media', false, array['image/png', 'video/mp4']),
         ('other', true, null);

  \i db/migrations/029_media_bucket_size_limit.sql
  \i db/migrations/029_media_bucket_size_limit.sql

  do $$
  begin
    if (select file_size_limit from storage.buckets where id = 'media') is distinct from 52428800 then
      raise exception '029: media bucket limit must be 52428800 bytes';
    end if;
    if (select public from storage.buckets where id = 'media') then
      raise exception '029: media bucket must stay private';
    end if;
    if (select allowed_mime_types from storage.buckets where id = 'media') is distinct from array['image/png', 'video/mp4'] then
      raise exception '029: media MIME allow-list must be unchanged';
    end if;
    if (select file_size_limit from storage.buckets where id = 'other') is not null then
      raise exception '029: other buckets must be untouched';
    end if;
  end $$;

  drop schema storage cascade;
\else
  -- Real Supabase database: check the applied state only.
  do $$
  begin
    if exists (select 1 from storage.buckets where id = 'media'
               and (file_size_limit is distinct from 52428800 or public)) then
      raise exception '029: media bucket must be private with a 52428800-byte limit';
    end if;
  end $$;
\endif
