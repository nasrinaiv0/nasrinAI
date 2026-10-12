#!/usr/bin/env bash
# Two-session regression: tenant-wide advisory locking must prevent concurrent
# reservations from exceeding a positive tenant ceiling.
set -euo pipefail
DB="${NASRINAI_TEST_DB:?run this through db/tests/run.sh}"
tenant="00000000-0000-0000-0000-000000000001"
# Compute current fixture usage so the first reservation fits while the second
# must exceed the exact same ceiling.
used="$(psql -qAt -v ON_ERROR_STOP=1 -d "$DB" <<SQL
select
  (select coalesce(sum(e.input_tokens + e.output_tokens), 0)::bigint
     from public.usage_events e
    where e.tenant_id = '${tenant}'::uuid
      and e.created_at >= (date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')
      and e.reservation_id is null)
  +
  (select coalesce(sum(case when r.status = 'reserved' then r.reserved_tokens
                            when r.status = 'settled' then r.actual_tokens else 0 end), 0)::bigint
     from public.daily_token_reservations r
    where r.tenant_id = '${tenant}'::uuid
      and r.day_start = (date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')
      and r.status in ('reserved', 'settled'));
SQL
)"
limit=$((used + 600))
a_out="$(mktemp)"
b_out="$(mktemp)"
trap 'rm -f "$a_out" "$b_out"' EXIT

psql -qAt -v ON_ERROR_STOP=1 -d "$DB" >"$a_out" <<SQL &
begin;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('${tenant}'::text, 0));
select pg_catalog.pg_sleep(1);
select allowed::text || ':' || coalesce(reason, '')
  from public.reserve_daily_tokens(
    '27000000-0000-4000-8000-000000000011', '${tenant}', 'service', 'm027-concurrent-a', 600, 0, 0, ${limit});
commit;
SQL
pid_a=$!
sleep 0.2
psql -qAt -v ON_ERROR_STOP=1 -d "$DB" >"$b_out" <<SQL
select allowed::text || ':' || coalesce(reason, '')
  from public.reserve_daily_tokens(
    '27000000-0000-4000-8000-000000000012', '${tenant}', 'service', 'm027-concurrent-b', 600, 0, 0, ${limit});
SQL
wait "$pid_a"

if ! grep -qx 'true:' "$a_out"; then
  echo "expected first concurrent reservation to succeed; output: $(cat "$a_out")" >&2
  exit 1
fi
if ! grep -qx 'false:tenant_limit' "$b_out"; then
  echo "expected second concurrent reservation to hit tenant_limit; output: $(cat "$b_out")" >&2
  exit 1
fi
echo "daily token reservation concurrency check passed"
