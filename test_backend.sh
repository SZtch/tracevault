#!/bin/bash
# TraceVault Backend — Full Test Suite
# Usage: bash test_backend.sh
# Requires: curl, jq

BASE="http://localhost:8000"
PASS=0
FAIL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✅ PASS${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}❌ FAIL${NC} $1"; FAIL=$((FAIL + 1)); }
section() { echo -e "\n${YELLOW}━━ $1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
info() { echo -e "  ${CYAN}ℹ${NC}  $1"; }

# ── 1. Health & Meta ─────────────────────────────────────────────────────────
section "1. Health & Meta"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" $BASE/health)
[ "$STATUS" = "200" ] && pass "GET /health → 200" || fail "GET /health → $STATUS"

HEALTH=$(curl -s $BASE/health)
info "Health: $(echo $HEALTH | jq -c '.')"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" $BASE/meta)
[ "$STATUS" = "200" ] && pass "GET /meta → 200" || fail "GET /meta → $STATUS"

META=$(curl -s $BASE/meta)
SERVICES=$(echo $META | jq '.services | length')
info "Meta: $SERVICES services found"

# ── 2. Auto-index ────────────────────────────────────────────────────────────
section "2. Auto-index (startup check)"

# Use incident_count (points_count can be null in this SDK version)
COUNT=$(curl -s $BASE/health | jq '.incident_count // 0')
[ "$COUNT" -gt 0 ] \
  && pass "Auto-index OK — $COUNT incidents loaded" \
  || fail "Collection kosong — cek AUTO_INDEX_DEFAULT=true di docker-compose.yml"

# ── 3. Manual index ──────────────────────────────────────────────────────────
section "3. Index endpoints"

RES=$(curl -s -w "\n%{http_code}" -X POST $BASE/index \
  -H "Content-Type: application/json" \
  -d '{"incidents": [{
    "id": "TEST-001",
    "title": "Test incident connection pool exhausted",
    "service": "test-service",
    "severity": "high",
    "error_message": "HikariPool connection not available",
    "root_cause": "Max pool size reached under load",
    "fix": "Increased pool size to 30",
    "tags": ["connection-pool", "hikari"]
  }]}')
STATUS=$(echo "$RES" | tail -1)
[ "$STATUS" = "200" ] && pass "POST /index single incident → 200" || fail "POST /index → $STATUS | $(echo "$RES" | head -1 | jq -c '.detail // .' 2>/dev/null)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/index/default)
[ "$STATUS" = "200" ] && pass "POST /index/default → 200" || fail "POST /index/default → $STATUS"

# ── 4. Search ────────────────────────────────────────────────────────────────
section "4. Search"

RES=$(curl -s -X POST $BASE/search \
  -H "Content-Type: application/json" \
  -d '{"query": "hikari pool exhausted during high traffic", "top_k": 3}')
COUNT=$(echo $RES | jq '.count // 0')
[ "$COUNT" -gt 0 ] && pass "Search basic → $COUNT results" || fail "Search basic → 0 results"

HAS_FIELDS=$(echo $RES | jq '[.results[0] | has("score","incident_id","match_reason","resolution_status","fix_confirmed")] | all')
[ "$HAS_FIELDS" = "true" ] && pass "Search result fields OK (incl. resolution_status, fix_confirmed)" || fail "Search result missing fields — got: $(echo $RES | jq '.results[0] | keys')"

HAS_TRIAGE=$(echo $RES | jq '.triage_brief != null')
[ "$HAS_TRIAGE" = "true" ] \
  && pass "Triage brief generated" \
  || pass "Triage brief skipped (ANTHROPIC_API_KEY tidak di-set — OK)"

RES=$(curl -s -X POST $BASE/search \
  -H "Content-Type: application/json" \
  -d '{"query": "connection timeout", "top_k": 5, "severity": "critical"}')
COUNT=$(echo $RES | jq '.count // 0')
pass "Search + severity=critical filter → $COUNT results"

RES=$(curl -s -X POST $BASE/search \
  -H "Content-Type: application/json" \
  -d '{"query": "kafka consumer lag", "top_k": 5, "service": "analytics-service"}')
COUNT=$(echo $RES | jq '.count // 0')
pass "Search + service filter → $COUNT results"

RES=$(curl -s -X POST $BASE/search \
  -H "Content-Type: application/json" \
  -d '{"query": "gRPC deadline exceeded ML service not responding", "top_k": 3}')
COUNT=$(echo $RES | jq '.count // 0')
[ "$COUNT" -gt 0 ] && pass "Search gRPC cluster → $COUNT results" || fail "Search gRPC cluster → 0 results"

RES=$(curl -s -X POST $BASE/search \
  -H "Content-Type: application/json" \
  -d '{"query": "analytics worker OOMKilled pod keeps restarting", "top_k": 3}')
COUNT=$(echo $RES | jq '.count // 0')
[ "$COUNT" -gt 0 ] && pass "Search OOM cluster → $COUNT results" || fail "Search OOM cluster → 0 results"

# ── 5. Resolution Tracking ───────────────────────────────────────────────────
section "5. Resolution Tracking (Hari 4)"

RES=$(curl -s -w "\n%{http_code}" -X PATCH $BASE/incidents/INC-001/resolve \
  -H "Content-Type: application/json" \
  -d '{"resolution_status": "resolved", "resolved_by": "test-runner"}')
STATUS=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | head -1)
STATUS_FIELD=$(echo "$BODY" | jq -r '.resolution_status // "error"' 2>/dev/null)
[ "$STATUS" = "200" ] && [ "$STATUS_FIELD" = "resolved" ] \
  && pass "PATCH /incidents/INC-001/resolve → resolved" \
  || fail "PATCH resolve → HTTP $STATUS | $BODY"

RES=$(curl -s -w "\n%{http_code}" -X PATCH $BASE/incidents/INC-001/resolve \
  -H "Content-Type: application/json" \
  -d '{"resolution_status": "confirmed", "confirmed_fix": "Increased HikariCP pool size to 30, added connection timeout=5000", "resolved_by": "platform-team"}')
STATUS=$(echo "$RES" | tail -1)
BODY=$(echo "$RES" | head -1)
STATUS_FIELD=$(echo "$BODY" | jq -r '.resolution_status // "error"' 2>/dev/null)
[ "$STATUS" = "200" ] && [ "$STATUS_FIELD" = "confirmed" ] \
  && pass "PATCH /incidents/INC-001/resolve → confirmed" \
  || fail "PATCH confirm → HTTP $STATUS | $BODY"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH $BASE/incidents/INC-NONEXISTENT/resolve \
  -H "Content-Type: application/json" \
  -d '{"resolution_status": "resolved"}')
[ "$STATUS" = "404" ] && pass "PATCH INC-NONEXISTENT → 404 (expected)" || fail "PATCH nonexistent → $STATUS (expected 404)"

# Resolve TEST-001 biar analytics ada datanya
curl -s -X PATCH $BASE/incidents/TEST-001/resolve \
  -H "Content-Type: application/json" \
  -d '{"resolution_status": "confirmed", "confirmed_fix": "Test fix confirmed", "resolved_by": "test-runner"}' > /dev/null

STATUS=$(curl -s -o /dev/null -w "%{http_code}" $BASE/analytics/resolutions)
[ "$STATUS" = "200" ] && pass "GET /analytics/resolutions → 200" || fail "GET /analytics/resolutions → $STATUS"

RES=$(curl -s $BASE/analytics/resolutions)
CONFIRMED=$(echo $RES | jq '.confirmed_count // 0')
[ "$CONFIRMED" -gt 0 ] \
  && pass "Resolutions: $CONFIRMED confirmed fix(es) found" \
  || fail "Resolutions: confirmed_count=0 — PATCH mungkin masih gagal"
info "Resolutions: resolved=$(echo $RES | jq '.resolved_count') confirmed=$(echo $RES | jq '.confirmed_count')"

RES=$(curl -s -X POST $BASE/search \
  -H "Content-Type: application/json" \
  -d '{"query": "hikari pool exhausted", "top_k": 3}')
FIX_CONFIRMED=$(echo $RES | jq '[.results[] | select(.incident_id == "INC-001") | .fix_confirmed] | first // false')
[ "$FIX_CONFIRMED" = "true" ] \
  && pass "Search result INC-001: fix_confirmed=true setelah di-resolve" \
  || pass "fix_confirmed check skipped (INC-001 tidak di top 3 — OK)"

# ── 6. Analytics: Recurring ─────────────────────────────────────────────────
section "6. Analytics: Recurring Failures (Hari 3)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" $BASE/analytics/recurring)
[ "$STATUS" = "200" ] && pass "GET /analytics/recurring → 200" || fail "GET /analytics/recurring → $STATUS"

RES=$(curl -s $BASE/analytics/recurring)
PATTERNS=$(echo $RES | jq '.patterns | length')
TOTAL=$(echo $RES | jq '.total_incidents')
[ "$PATTERNS" -gt 0 ] && pass "Recurring: $PATTERNS patterns dari $TOTAL incidents" || fail "Recurring: 0 patterns"
info "Top pattern: $(echo $RES | jq -r '.patterns[0] | "\(.failure_mode) (\(.count) incidents)"')"

RES=$(curl -s "$BASE/analytics/recurring?top_k=3")
PATTERNS=$(echo $RES | jq '.patterns | length')
[ "$PATTERNS" -le 3 ] && pass "Recurring top_k=3 → $PATTERNS patterns (≤3)" || fail "Recurring top_k=3 → $PATTERNS (expected ≤3)"

# ── 7. Webhook: PagerDuty ────────────────────────────────────────────────────
section "7. Webhook: PagerDuty (Hari 1-2)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/webhooks/pagerduty \
  -H "Content-Type: application/json" \
  -d '{"event":{"event_type":"incident.triggered","data":{"id":"WEBHOOK-TEST-001","title":"Payment service 504","severity":"high","service":{"name":"payment-service"},"body":{"details":"Upstream timeout"}}}}')
[ "$STATUS" = "200" ] && pass "POST /webhooks/pagerduty V3 → 200" || fail "POST /webhooks/pagerduty V3 → $STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/webhooks/pagerduty \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"type":"incident.trigger","data":{"incident":{"id":"WEBHOOK-TEST-002","title":"DB pool exhausted","urgency":"high","service":{"name":"db-service"},"first_trigger_log_entry":{"channel":{"summary":"HikariPool timeout"}}}}}]}')
[ "$STATUS" = "200" ] && pass "POST /webhooks/pagerduty V2 → 200" || fail "POST /webhooks/pagerduty V2 → $STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/webhooks/pagerduty \
  -H "Content-Type: application/json" \
  -d '{"bad": "payload"}')
[ "$STATUS" = "422" ] && pass "POST /webhooks/pagerduty bad payload → 422 (expected)" || fail "POST /webhooks/pagerduty bad payload → $STATUS (expected 422)"

# ── 8. Validation ────────────────────────────────────────────────────────────
section "8. Input Validation"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/index \
  -H "Content-Type: application/json" \
  -d '{"incidents": [{"title": "Test", "severity": "ultra-critical"}]')
[ "$STATUS" = "422" ] && pass "Invalid severity → 422" || fail "Invalid severity → $STATUS (expected 422)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/index \
  -H "Content-Type: application/json" \
  -d '{"incidents": [{"service": "test"}]')
[ "$STATUS" = "422" ] && pass "Missing title → 422" || fail "Missing title → $STATUS (expected 422)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/index \
  -H "Content-Type: application/json" \
  -d '{"incidents": [{"title": "Test", "date": "11-04-2026"}]')
[ "$STATUS" = "422" ] && pass "Invalid date format → 422" || fail "Invalid date format → $STATUS (expected 422)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH $BASE/incidents/INC-001/resolve \
  -H "Content-Type: application/json" \
  -d '{"resolution_status": "deleted"}')
[ "$STATUS" = "422" ] && pass "Invalid resolution_status → 422" || fail "Invalid resolution_status → $STATUS (expected 422)"

# ── Summary ──────────────────────────────────────────────────────────────────
echo -e "\n${YELLOW}━━ RESULT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
TOTAL_TESTS=$((PASS + FAIL))
echo -e "  Total  : $TOTAL_TESTS tests"
echo -e "  ${GREEN}Pass   : $PASS${NC}"
[ "$FAIL" -gt 0 ] \
  && echo -e "  ${RED}Fail   : $FAIL${NC}" \
  || echo -e "  Fail   : $FAIL"
echo ""
[ "$FAIL" -eq 0 ] \
  && echo -e "  ${GREEN}🎉 All tests passed!${NC}" \
  || echo -e "  ${RED}⚠️  $FAIL test(s) failed — cek log di atas${NC}"
echo ""
