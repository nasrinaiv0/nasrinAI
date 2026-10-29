-- Long-term recall: ranked full-text search over ALL of one signed-in user's
-- saved messages (not only the latest chats). Used only when that person has
-- Memory turned on (checked in the server). Service-role only; it is always
-- scoped to one tenant + one user and skips expired conversations.

begin;

create index if not exists messages_content_fts_idx
  on public.messages using gin (to_tsvector('simple', content));

create or replace function public.search_user_messages(
  p_tenant uuid, p_owner_id text, p_terms text[], p_since timestamptz default null,
  p_exclude uuid default null, p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $recall$
declare
  v_query tsquery;
  v_result jsonb;
begin
  if p_tenant is null or coalesce(p_owner_id, '') = '' or char_length(p_owner_id) > 80 then
    raise exception 'tenant and owner are required';
  end if;
  if p_terms is null or cardinality(p_terms) not between 1 and 8
     or exists (select 1 from unnest(p_terms) t where t !~ '^[a-z0-9]{3,40}$') then
    raise exception 'terms must be 1 to 8 lowercase words';
  end if;
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'limit must be 1 to 20'; end if;
  v_query := to_tsquery('simple', array_to_string(array(select t || ':*' from unnest(p_terms) t), ' | '));
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.rank desc, x.created_at desc), '[]'::jsonb) into v_result
  from (
    select m.conversation_id, c.title, m.role, left(m.content, 900) as content, m.created_at,
      ts_rank_cd(to_tsvector('simple', m.content), v_query) as rank
    from public.messages m
    join public.conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
    where m.tenant_id = p_tenant and c.owner_type = 'user' and c.owner_id = p_owner_id
      and (c.expires_at is null or c.expires_at > now())
      and (p_since is null or m.created_at >= p_since)
      and (p_exclude is null or m.conversation_id <> p_exclude)
      and to_tsvector('simple', m.content) @@ v_query
    order by rank desc, m.created_at desc
    limit p_limit
  ) x;
  return v_result;
end;
$recall$;

revoke execute on function public.search_user_messages(uuid, text, text[], timestamptz, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.search_user_messages(uuid, text, text[], timestamptz, uuid, integer) to service_role;

commit;
