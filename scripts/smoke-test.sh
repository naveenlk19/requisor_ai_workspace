#!/usr/bin/env bash
# Cutover smoke test (render.md Phase 5.8) — run against staging or prod:
#   ./scripts/smoke-test.sh https://requisor-staging.onrender.com
# Unauthenticated checks only; login/AI-chat/upload/Stripe still need a human.
set -uo pipefail

BASE="${1:-}"
[ -n "$BASE" ] || { echo "usage: $0 <base-url>"; exit 1; }
BASE="${BASE%/}"
PASS=0; FAIL=0

check() { # <name> <expected-status-regex> <path>
  local name="$1" want="$2" path="$3"
  local got
  got=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 -L "$BASE$path")
  if [[ "$got" =~ ^($want)$ ]]; then
    echo "  OK   $name ($got)"; PASS=$((PASS+1))
  else
    echo "  FAIL $name — expected $want, got $got  [$path]"; FAIL=$((FAIL+1))
  fi
}

echo "Smoke-testing $BASE"
echo ""
echo "App is up:"
check "frontend serves"            "200"     "/"
check "auth page serves"           "200"     "/auth"

echo "API is alive:"
check "user endpoint answers"      "200|401" "/api/auth/user"
check "google oauth redirects"     "200|302" "/api/auth/google"

echo "Security gates hold (must NOT be public):"
check "log API requires auth"      "401|403" "/api/logs/all"
check "log clear requires auth"    "401|403|404|405" "/api/logs/clear"
check "jira integration gated"     "401|403" "/api/jira/integration"
check "facebook status anonymous"  "200"     "/api/social/facebook/status"  # returns connected:false, no tokens

echo ""
echo "Passed: $PASS  Failed: $FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo "Automated checks green. Manual checklist (render.md 5.8):"
  echo "  - log in as an EXISTING user (Google), verify projects load"
  echo "  - run one AI chat; upload one file"
  echo "  - check Stripe webhook delivery log after a test event"
  echo "  - connect one MCP client"
fi
exit "$FAIL"
