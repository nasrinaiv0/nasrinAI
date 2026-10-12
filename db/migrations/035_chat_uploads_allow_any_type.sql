-- Migration 035: reconcile existing chat-uploads buckets with the intended state.
-- The server validates file bytes; Storage must not retain stale MIME allow-lists.
begin;
do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
       set public = false, file_size_limit = 52428800, allowed_mime_types = null
     where id = 'chat-uploads'
       and (public is distinct from false
         or file_size_limit is distinct from 52428800
         or allowed_mime_types is not null);
  end if;
end $$;
commit;
