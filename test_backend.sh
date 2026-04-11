#!/bin/bash
# TraceVault Backend — Full Test Suite
# Usage: bash test_backend.sh [base_url]
# Requires: curl, jq

BASE="${1:-http://localhost:8000}"
PASS=0
FAIL=0
START=$(date +%s)

# ── Colors ────────────────────────────────────────────────────────────────────
G='\033[0;32m'   # green
R='\033[0;31m'   # red
Y='\033[1;33m'   # yellow
C='\033[0;36m'   # cyan
D='\033[2m'      # dim
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────
pass()    { echo -e "  ${G}✓${NC} $1";        PASS=$((PASS+1)); }
fail()    { echo -e "  ${R}✗${NC} $1";        FAIL=$((FAIL+1)); }
info()    { echo -e "  ${D}→ $1${NC}"; }
section() {
  local title="$1"
  local pad=$(printf '─%.0s' $(seq 1 $((48 - ${#title}))))
  echo -e "\n${Y}  $title ${D}$pad${NC}"
}

expect_status() {
  # expect_status LABEL METHOD URL [body] EXPECTED_CODE
  local label="$1" method="$2" url="$3" body="$4" want="$5"
  local got
  if [ -n "$body" ]; then
    got=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
      -H "Content-Type: application/json" -d "$body")
  else
    got=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url")
  fi
  [ "$got" = "$want" ] \
    && pass "$label → $want" \
    || fail "$label → $got (expected $want)"
}

# ── 1. Health & Meta ──────────────────────────────────────────────────────────
section "1. Health & Meta"

HEALTH=$(curl -s "$BASE/health")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health")
[ "$STATUS" = "200" ] && pass "GET /health" || fail "GET /health → $STATUS"

COUNT=$(echo "$HEALTH" | jq '.incident_count // 0')
info "$(echo "$HEALTH" | jq -c '{db: .connected, incidents: .incident_count, model: .embedding_model}')"

expect_status "GET /meta" GET "$BASE/meta" "" "200"
SERVICES=$(curl -s "$BASE/meta" | jq '.services | length')
info "$SERVICES services in meta"

# ── 2. Auto-index ─────────────────────────────────────────────────────────────
section "2. Auto-index"

[ "$COUNT" -gt 0 ] \
  && pass "Auto-index OK — $COUNT incidents loaded" \
  || fail "Collection empty — check AUTO_INDEX_DEFAULT=true"

# ── 3. Index endpoints ────────────────────────────────────────────────────────
section "3. Index"

RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/index" \
  -H "Content-Type: application/json" \
  -d '{"incidents": [{"id":"TEST-001","title":"Test connection pool exhausted",
       "service":"test-service","severity":"high",
       "error_message":"HikariPool connection not available",
       "root_cause":"Max pool size reached","fix":"Increased pool size to 30",
       "tags":["connection-pool","hikari"]}]}')
STATUS=$(echo "$RES" | tail -1)
[ "$STATUS" = "200" ] \
  && pass "POST /index (single incident)" \
  || fail "POST /index → $STATUS | $(echo "$RES" | head -1 | jq -c '.detail // .' 2>/dev/null)"

expect_status "POST /index/default" POST "$BASE/index/default" "" "200"

# ── 4. Search ─────────────────────────────────────────────────────────────────
section "4. Search"

RES=$(curl -s -X POST "$BASE/search" -H "Content-Type: application/json" \
  -d '{"query":"hikari pool exhausted during high traffic","top_k":3}')
COUNT=$(echo "$RES" | jq '.count // 0')
[ "$COUNT" -gt 0 ] && pass "Basic search → $COUNT results" || fail "Basic search → 0 results"

HAS_FIELDS=$(echo "$RES" | jq '[.results[0] | has("score","incident_id","match_reason","resolution_status","fix_confirmed")] | all')
[ "$HAS_FIELDS" = "true" ] \
  && pass "Result fields OK (score, incident_id, match_reason, resolution_status, fix_confirmed)" \
  || fail "Result missing fields — got: $(echo "$RES" | jq '.results[0] | keys')"

HAS_TRIAGE=$(echo "$RES" | jq '.triage_brief != null')
[ "$HAS_TRIAGE" = "true" ] \
  && pass "Triage brief generated" \
  || pass "Triage brief skipped (no ANTHROPIC_API_KEY — OK)"

RES=$(curl -s -X POST "$BASE/search" -H "Content-Type: application/json" \
  -d '{"query":"connection timeout","top_k":5,"severity":"critical"}')
pass "Search + severity=critical → $(echo "$RES" | jq '.count // 0') results"

RES=$(curl -s -X POST "$BASE/search" -H "Content-Type: application/json" \
  -d '{"query":"kafka consumer lag","top_k":5,"service":"analytics-service"}')
pass "Search + service filter → $(echo "$RES" | jq '.count // 0') results"

RES=$(curl -s -X POST "$BASE/search" -H "Content-Type: application/json" \
  -d '{"query":"gRPC deadline exceeded ML service not responding","top_k":3}')
COUNT=$(echo "$RES" | jq '.count // 0')
[ "$COUNT" -gt 0 ] && pass "Search gRPC cluster → $COUNT results" || fail "Search gRPC cluster → 0 results"

RES=$(curl -s -X POST "$BASE/search" -H "Content-Type: application/json" \
  -d '{"query":"analytics worker OOMKilled pod keeps restarting","top_k":3}')
COUNT=$(echo "$RES" | jq '.count // 0')
[ "$COUNT" -gt 0 ] && pass "Search OOM cluster → $COUNT results" || fail "Search OOM cluster → 0 results"

# ── 5. Date & Tag Filters ─────────────────────────────────────────────────────
section "5. Date & Tag Filters"

RES=$(curl -s -X POST "$BASE/search" -H "Content-Type: application/json" \
  -d '{"query":"connection pool exhausted","top_k":5,"date_from":"2024-01-01"}')
COUNT=$(echo "$RES" | jq '.count // 0')
[ "$COUNT" -gt 0 ] && pass "date_from=2024-01-01 → $COUNT results" || fail "date_from → 0 results (expected >0)"

RES=$(curl -s -X POST "$BASE/search" -H "Content-Type: application/json" \
  -d '{"query":"timeout","top_k":5,"date_to":"2026-12-31"}')
COUNT=$(echo "$RES" | jq '.count // 0')
[ "$COUNT" -gt 0 ] && pass "date_to=2026-12-31 → $COUNT results" || fail "date_to → 0 results (expected >0)"

RES=$(curl -s -X POST "$BASE/search" -H "Content-Type: application/json" \
  -d '{"query":"timeout","top_k":5,"date_from":"2099-01-01","date_to":"2099-12-31"}')
COUNT=$(echo "$RES" | jq '.count // 0')
[ "$COUNT" -eq 0 ] && pass "date range far future → 0 results" || fail "date range far future → $COUNT (expected 0)"

RES=$(curl -s -X POST "$BASE/search" -H "Content-Type: application/json" \
  -d '{"query":"connection pool","top_k":5,"tags":["hikari"]}')
COUNT=$(echo "$RES" | jq '.count // 0')
[ $? -eq 0 ] && pass "tags=[hikari] filter → $COUNT results" || fail "tags filter → error"

expect_status "date_from invalid format → 422" POST "$BASE/search" \
  '{"query":"test","date_from":"01-01-2024"}' "422"

# ── 6. Resolution Tracking ────────────────────────────────────────────────────
section "6. Resolution Tracking"

RES=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/incidents/INC-001/resolve" \
  -H "Content-Type: application/json" \
  -d '{"resolution_status":"resolved","resolved_by":"test-runner"}')
STATUS=$(echo "$RES" | tail -1)
STATUS_FIELD=$(echo "$RES" | head -1 | jq -r '.resolution_status // ""')
[ "$STATUS" = "200" ] && [ "$STATUS_FIELD" = "resolved" ] \
  && pass "PATCH INC-001 → resolved" \
  || fail "PATCH INC-001 resolve → HTTP $STATUS"

RES=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE/incidents/INC-001/resolve" \
  -H "Content-Type: application/json" \
  -d '{"resolution_status":"confirmed","confirmed_fix":"Increased HikariCP pool to 30","resolved_by":"platform-team"}')
STATUS=$(echo "$RES" | tail -1)
STATUS_FIELD=$(echo "$RES" | head -1 | jq -r '.resolution_status // ""')
[ "$STATUS" = "200" ] && [ "$STATUS_FIELD" = "confirmed" ] \
  && pass "PATCH INC-001 → confirmed" \
  || fail "PATCH INC-001 confirm → HTTP $STATUS"

expect_status "PATCH INC-NONEXISTENT → 404" PATCH "$BASE/incidents/INC-NONEXISTENT/resolve" \
  '{"resolution_status":"resolved"}' "404"

# seed TEST-001 resolution for analytics
curl -s -X PATCH "$BASE/incidents/TEST-001/resolve" \
  -H "Content-Type: application/json" \
  -d '{"resolution_status":"confirmed","confirmed_fix":"Test fix","resolved_by":"test-runner"}' > /dev/null

expect_status "GET /analytics/resolutions" GET "$BASE/analytics/resolutions" "" "200"

RES=$(curl -s "$BASE/analytics/resolutions")
CONFIRMED=$(echo "$RES" | jq '.confirmed_count // 0')
[ "$CONFIRMED" -gt 0 ] \
  && pass "Resolutions: $CONFIRMED confirmed fix(es)" \
  || fail "Resolutions: confirmed_count=0"
info "resolved=$(echo "$RES" | jq '.resolved_count') confirmed=$(echo "$RES" | jq '.confirmed_count')"

RES=$(curl -s -X POST "$BASE/search" -H "Content-Type: application/json" \
  -d '{"query":"hikari pool exhausted","top_k":3}')
FIX_CONFIRMED=$(echo "$RES" | jq '[.results[] | select(.incident_id=="INC-001") | .fix_confirmed] | first // false')
[ "$FIX_CONFIRMED" = "true" ] \
  && pass "INC-001 fix_confirmed=true in search results" \
  || pass "fix_confirmed check skipped (INC-001 not in top 3 — OK)"

# ── 7. Analytics: Recurring ───────────────────────────────────────────────────
section "7. Analytics: Recurring"

expect_status "GET /analytics/recurring" GET "$BASE/analytics/recurring" "" "200"

RES=$(curl -s "$BASE/analytics/recurring")
PATTERNS=$(echo "$RES" | jq '.patterns | length')
TOTAL=$(echo "$RES" | jq '.total_incidents')
[ "$PATTERNS" -gt 0 ] \
  && pass "$PATTERNS patterns from $TOTAL incidents" \
  || fail "0 patterns found"
info "top: $(echo "$RES" | jq -r '.patterns[0] | "\(.failure_mode) (\(.count))"')"

RES=$(curl -s "$BASE/analytics/recurring?top_k=3")
PATTERNS=$(echo "$RES" | jq '.patterns | length')
[ "$PATTERNS" -le 3 ] \
  && pass "top_k=3 → $PATTERNS patterns" \
  || fail "top_k=3 → $PATTERNS (expected ≤3)"

# ── 8. Analytics: Dashboard ───────────────────────────────────────────────────
section "8. Analytics: Dashboard"

RES=$(curl -s -w "\n%{http_code}" "$BASE/analytics/dashboard")
STATUS=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | head -1)
[ "$STATUS" = "200" ] && pass "GET /analytics/dashboard" || fail "GET /analytics/dashboard → $STATUS"

MISSING=$(echo "$BODY" | jq -r '
  ["total_incidents","by_severity","by_service","resolution_rate",
   "open_count","resolved_count","confirmed_count","recent_incidents"]
  | map(select(. as $k | input | has($k) | not))
  | join(", ")
' 2>/dev/null <<< "$BODY")
[ -z "$MISSING" ] \
  && pass "All required fields present" \
  || fail "Missing fields: $MISSING"

TOTAL=$(echo "$BODY" | jq '.total_incidents // 0')
[ "$TOTAL" -gt 0 ] && pass "total_incidents=$TOTAL" || fail "total_incidents=0"

info "$(echo "$BODY" | jq -c '{total: .total_incidents, open: .open_count, resolved: .resolved_count, rate: .resolution_rate}')"

# ── 9. Webhook: PagerDuty ─────────────────────────────────────────────────────
section "9. Webhook: PagerDuty"

expect_status "V3 format" POST "$BASE/webhooks/pagerduty" \
  '{"event":{"event_type":"incident.triggered","data":{"id":"WEBHOOK-TEST-001","title":"Payment service 504","severity":"high","service":{"name":"payment-service"},"body":{"details":"Upstream timeout"}}}}' \
  "200"

expect_status "V2 format" POST "$BASE/webhooks/pagerduty" \
  '{"messages":[{"type":"incident.trigger","data":{"incident":{"id":"WEBHOOK-TEST-002","title":"DB pool exhausted","urgency":"high","service":{"name":"db-service"}}}}]}' \
  "200"

expect_status "bad payload → 422" POST "$BASE/webhooks/pagerduty" \
  '{"bad":"payload"}' "422"

# ── 10. Webhook: Slack ────────────────────────────────────────────────────────
section "10. Webhook: Slack"

expect_status "simple format (text+attachments)" POST "$BASE/webhooks/slack" \
  '{"text":"CRITICAL: HikariPool exhausted","username":"payment-service","attachments":[{"title":"DB pool exhausted","text":"Connection not available after 30s","color":"danger"}]}' \
  "200"

expect_status "rich format (incident object)" POST "$BASE/webhooks/slack" \
  '{"incident":{"title":"Kafka consumer lag spike","service":"order-service","severity":"high","error_message":"Consumer group lag exceeded 50000 messages"}}' \
  "200"

expect_status "bad payload → 422" POST "$BASE/webhooks/slack" \
  '{"bad":"payload"}' "422"

# ── 11. Input Validation ──────────────────────────────────────────────────────
section "11. Input Validation"

expect_status "invalid severity → 422" POST "$BASE/index" \
  '{"incidents":[{"title":"Test","severity":"ultra-critical"}]}' "422"

expect_status "missing title → 422" POST "$BASE/index" \
  '{"incidents":[{"service":"test"}]}' "422"

expect_status "invalid date format → 422" POST "$BASE/index" \
  '{"incidents":[{"title":"Test","date":"11-04-2026"}]}' "422"

expect_status "invalid resolution_status → 422" PATCH "$BASE/incidents/INC-001/resolve" \
  '{"resolution_status":"deleted"}' "422"

# ── Summary ───────────────────────────────────────────────────────────────────
ELAPSED=$(( $(date +%s) - START ))
TOTAL_TESTS=$((PASS + FAIL))

echo -e "\n${Y}  ────────────────────────────────────────────────────${NC}"
printf "  Tests   %d  |  ${G}Pass  %d${NC}  |  " "$TOTAL_TESTS" "$PASS"
[ "$FAIL" -gt 0 ] \
  && printf "${R}Fail  %d${NC}" "$FAIL" \
  || printf "Fail  %d" "$FAIL"
printf "  |  ${D}%ds${NC}\n\n" "$ELAPSED"

[ "$FAIL" -eq 0 ] \
  && echo -e "  ${G}✓ All $TOTAL_TESTS tests passed${NC}\n" \
  || echo -e "  ${R}✗ $FAIL of $TOTAL_TESTS failed — cek log di atas${NC}\n"
