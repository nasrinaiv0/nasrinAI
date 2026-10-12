#!/usr/bin/env bash
# Two-session regression: tenant-wide advisory locking must prevent concurrent
# reservations from exceeding a positive tenant ceiling.
set -euo pipefail
DB="${NASRINAI_TEST_DB:?run this through db/tests/run.sh}"
tenant="00000000-0000-0000-0000-000000000001"
a_out="$(mktemp)"
b_out="$(mktemp)"
trap 'rm -f "$a_out" "$b_out"' EXIT

psql -qAt -v ON_ERROR_STOP=1 -d "$DB" >"$a_out" <<SQL &
begin;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('${tenant}'::text, 0));
select pg_catalog.pg_sleep(1);
select allowed::text || ':' || coalesce(reason, '')
  from public.reserve_daily_tokens(
    '27000000-0000-4000-8000-000000000011', '${tenant}', 'service', 'm027-concurrent-a', 60, 0, 0, 100);
commit;
SQL
pid_a=$!
sleep 0.2
psql -qAt -v ON_ERROR_STOP=1 -d "$DB" >"$b_out" <<SQL
select allowed::text || ':' || coalesce(reason, '')
  from public.reserve_daily_tokens(
    '27000000-0000-4000-8000-000000000012', '${tenant}', 'service', 'm027-concurrent-b', 60, 0, 0, 100);
SQL
wait "$pid_a"

if ! grep -qx 't:' "$a_out"; then
  echo "expected first concurrent reservation to succeed; output: $(cat "$a_out")" >&2
  exit 1
fi
if ! grep -qx 'f:tenant_limit' "$b_out"; then
  echo "expected second concurrent reservation to hit tenant_limit; output: $(cat "$b_out")" >&2
  exit 1
fi
echo "daily token reservation concurrency check passed"
