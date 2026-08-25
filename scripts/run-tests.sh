#!/usr/bin/env bash
# Runs every server test script and fails on the first non-zero exit.
# Each test is a standalone tsx script that self-asserts against the real
# Postgres (DATABASE_URL must point at a dev database — never production).
set -euo pipefail

[ -n "${DATABASE_URL:-}" ] || { echo "ERROR: DATABASE_URL not set (source .env first)"; exit 1; }
case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*|*staging*) ;;
  *) echo "ERROR: refusing to run tests against a non-local DATABASE_URL"; exit 1 ;;
esac

FAILED=0
for f in server/tests/*.test.ts; do
  echo ""
  echo "━━━ $f ━━━"
  if npx tsx "$f"; then
    echo "PASS: $f"
  else
    echo "FAIL: $f"
    FAILED=1
  fi
done

echo ""
[ "$FAILED" -eq 0 ] && echo "All server tests passed." || echo "Some tests FAILED."
exit "$FAILED"
