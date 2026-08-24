#!/usr/bin/env bash
#
# Replit → Render production data migration (render.md Phase 5.5).
#
# Copies ALL data database-to-database. User data never touches git:
# the dump file is written locally and *.dump is gitignored.
#
# Usage:
#   export REPLIT_DATABASE_URL='postgresql://...'   # source (Replit/Neon)
#   export RENDER_DATABASE_URL='postgresql://...'   # target (Render Postgres, EXTERNAL url)
#   ./scripts/migrate-prod-data.sh            # interactive confirm
#   ./scripts/migrate-prod-data.sh --yes      # skip confirmation (CI/rehearsal)
#
# Prereqs: postgres client tools (pg_dump/pg_restore/psql) v16+.
# The target is WIPED and replaced by the source (--clean): run AFTER the
# app has deployed fine against the empty DB, at cutover time.

set -euo pipefail

SRC="${REPLIT_DATABASE_URL:-}"
DST="${RENDER_DATABASE_URL:-}"
YES="${1:-}"
DUMP_FILE="prod-migration-$(date +%Y%m%d-%H%M%S).dump"
# Tables whose *data* is transient and not worth carrying over (schema still moves)
SKIP_DATA_TABLES=(sessions)
# Tables to verify row-count parity on after restore
VERIFY_TABLES=(users projects tasks conversations subscription_plans)

fail() { echo "ERROR: $*" >&2; exit 1; }

# ---------- preflight ----------
command -v pg_dump >/dev/null || fail "pg_dump not found (brew install libpq / apt install postgresql-client)"
command -v pg_restore >/dev/null || fail "pg_restore not found"
command -v psql >/dev/null || fail "psql not found"
[ -n "$SRC" ] || fail "REPLIT_DATABASE_URL is not set"
[ -n "$DST" ] || fail "RENDER_DATABASE_URL is not set"
[ "$SRC" != "$DST" ] || fail "source and target are the same database"

echo "Checking connectivity..."
psql "$SRC" -tAc "SELECT 1" >/dev/null || fail "cannot connect to source (REPLIT_DATABASE_URL)"
psql "$DST" -tAc "SELECT 1" >/dev/null || fail "cannot connect to target (RENDER_DATABASE_URL)"

echo "Ensuring pgvector exists on target (render.md 3.3)..."
psql "$DST" -tAc "CREATE EXTENSION IF NOT EXISTS vector" >/dev/null \
  || fail "could not enable pgvector on target — enable it from the Render dashboard first"

SRC_USERS=$(psql "$SRC" -tAc "SELECT count(*) FROM users" 2>/dev/null || echo "n/a")
DST_TABLES=$(psql "$DST" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
echo ""
echo "  Source users:        $SRC_USERS"
echo "  Target tables now:   $DST_TABLES (will be dropped and recreated from the dump)"
echo ""

if [ "$YES" != "--yes" ]; then
  read -r -p "This REPLACES all data on the target with the source. Type 'migrate' to continue: " answer
  [ "$answer" = "migrate" ] || fail "aborted"
fi

# ---------- dump ----------
EXCLUDES=()
for t in "${SKIP_DATA_TABLES[@]}"; do EXCLUDES+=(--exclude-table-data="$t"); done

echo "Dumping source → $DUMP_FILE ..."
pg_dump "$SRC" -Fc --no-owner --no-privileges "${EXCLUDES[@]}" -f "$DUMP_FILE"
echo "  dump size: $(du -h "$DUMP_FILE" | cut -f1)"

# ---------- restore ----------
# --clean --if-exists: drop target objects first so re-runs and boot-seeded
# rows (plans, AI tools, demo account) can't collide with restored data.
# pg_restore orders schema → COPY data → constraints/indexes, so FK ordering
# is never an issue. Harmless "extension vector already exists"-style notices
# from --clean are expected; real failures abort via --exit-on-error.
echo "Restoring into target..."
pg_restore -d "$DST" --clean --if-exists --no-owner --no-privileges --exit-on-error "$DUMP_FILE"

# ---------- verify ----------
echo ""
echo "Verification (source vs target row counts):"
STATUS=0
for t in "${VERIFY_TABLES[@]}"; do
  s=$(psql "$SRC" -tAc "SELECT count(*) FROM \"$t\"" 2>/dev/null || echo "?")
  d=$(psql "$DST" -tAc "SELECT count(*) FROM \"$t\"" 2>/dev/null || echo "?")
  if [ "$s" = "$d" ]; then mark="OK "; else mark="MISMATCH"; STATUS=1; fi
  printf "  %-20s source=%-8s target=%-8s %s\n" "$t" "$s" "$d" "$mark"
done

if [ "$STATUS" -ne 0 ]; then
  fail "row-count mismatch — do not cut over; investigate before retrying"
fi

echo ""
echo "Done. Next (render.md Phase 5):"
echo "  1. Boot/restart the Render service — db-setup self-heal will patch anything schema-drifted."
echo "  2. Smoke-test: log in as an existing user, open a project, run one AI chat."
echo "  3. Delete the local dump when the cutover is confirmed: rm $DUMP_FILE"
