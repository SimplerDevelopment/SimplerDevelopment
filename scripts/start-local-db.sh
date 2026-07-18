#!/usr/bin/env bash
# Start a local Postgres 17 via Homebrew and ensure a `simplerdev_test` DB
# exists. Idempotent — safe to re-run.
#
# Used by `npm run test:integration:local` to give integration-api specs a
# throwaway DB without touching staging/prod. Homebrew install required:
#   brew install postgresql@17
set -euo pipefail

PG_BIN="/usr/local/opt/postgresql@17/bin"
DB_NAME="simplerdev_test"
DATA_DIR="/usr/local/var/postgresql@17"
LOG_FILE="/tmp/pg17.log"

if [[ ! -x "$PG_BIN/pg_ctl" ]]; then
  echo "postgresql@17 not installed at $PG_BIN — run: brew install postgresql@17" >&2
  exit 1
fi

# Clean up a stale pidfile (leftover from a previous hard crash). If the pid
# in the file doesn't match a running postgres process, it's safe to remove.
if [[ -f "$DATA_DIR/postmaster.pid" ]]; then
  PID=$(head -1 "$DATA_DIR/postmaster.pid" 2>/dev/null || echo "")
  if [[ -n "$PID" ]] && ! ps -p "$PID" -o comm= 2>/dev/null | grep -q postgres; then
    echo ">> removing stale postmaster.pid ($PID is not a postgres process)"
    rm -f "$DATA_DIR/postmaster.pid"
  fi
fi

# Start postgres if it isn't already running on port 5432.
if ! "$PG_BIN/pg_isready" -q 2>/dev/null; then
  echo ">> starting postgresql@17"
  "$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$LOG_FILE" start
fi

# Create the test DB if it doesn't exist.
if ! "$PG_BIN/psql" -lqt | cut -d\| -f1 | grep -qw "$DB_NAME"; then
  echo ">> creating database: $DB_NAME"
  "$PG_BIN/createdb" "$DB_NAME"
fi

echo ">> ready — postgresql://$USER@localhost:5432/$DB_NAME"
