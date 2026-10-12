-- Migration 035: a pre-existing bucket must not retain a stale MIME allow-list.
\set ON_ERROR_STOP on
select to_regclass('storage.buckets') is null as no_storage \gset
\if :no_storage
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[], updated_at timestamptz not null default now()
  );
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('chat-uploads', 'chat-uploads', true, 1024, array['image/png']),
         ('other', 'other', true, 1024, array['image/png']);
  \i db/migrations/035_chat_uploads_allow_any_type.sql
  \i db/migrations/035_chat_uploads_allow_any_type.sql
  do $$
  begin
    if not exists (select 1 from storage.buckets where id = 'chat-uploads'
                   and not public and file_size_limit = 52428800 and allowed_mime_types is null) then
      raise exception '035 did not reconcile chat-uploads to intended state';
    end if;
    if not exists (select 1 from storage.buckets where id = 'other'
                   and public and file_size_limit = 1024 and allowed_mime_types = array['image/png']) then
      raise exception '035 must not change other buckets';
    end if;
  end $$;
  drop schema storage cascade;
\else
  do $$
  begin
    if not exists (select 1 from storage.buckets where id = 'chat-uploads'
                   and not public and file_size_limit = 52428800 and allowed_mime_types is null) then
      raise exception '035 chat-uploads bucket is not in the intended state';
    end if;
  end $$;
\endif
