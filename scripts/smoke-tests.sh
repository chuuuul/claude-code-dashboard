#!/bin/bash

# Smoke Tests - Basic sanity checks for deployed application
# Usage: ./scripts/smoke-tests.sh <base-url>

set -e

URL="${1:-http://localhost:3000}"
TESTS_PASSED=0
TESTS_FAILED=0

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

test_info() {
  echo -e "${BLUE}[Test]${NC} $1"
}

test_pass() {
  echo -e "${GREEN}  ✓${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

test_fail() {
  echo -e "${RED}  ✗${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

if [ -z "$URL" ]; then
  echo "Usage: ./scripts/smoke-tests.sh <base-url>"
  exit 1
fi

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Claude Dashboard - Smoke Tests${NC}"
echo -e "${BLUE}Target: $URL${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Test 1: Health Check Endpoint
test_info "Health check endpoint..."
if curl -sf "${URL}/health" > /dev/null 2>&1; then
  health_response=$(curl -s "${URL}/health" | grep -o '"status":"[^"]*"')
  test_pass "Health check endpoint accessible ($health_response)"
else
  test_fail "Health check endpoint failed or unreachable"
fi

# Test 2: Health check response validity
test_info "Health check response structure..."
health_json=$(curl -s "${URL}/health")
if echo "$health_json" | grep -q '"status":' && echo "$health_json" | grep -q '"checks":'; then
  test_pass "Health check returns valid JSON structure"
else
  test_fail "Health check response missing expected fields"
fi

# Test 3: Security headers - X-Content-Type-Options
test_info "Security headers - X-Content-Type-Options..."
if curl -sI "${URL}" | grep -qi "X-Content-Type-Options: nosniff"; then
  test_pass "X-Content-Type-Options header present"
else
  test_fail "X-Content-Type-Options header missing (expected for production)"
fi

# Test 4: Security headers - X-Frame-Options
test_info "Security headers - X-Frame-Options..."
if curl -sI "${URL}" | grep -qi "X-Frame-Options"; then
  test_pass "X-Frame-Options header present"
else
  test_fail "X-Frame-Options header missing (expected for production)"
fi

# Test 5: Security headers - Strict-Transport-Security
test_info "Security headers - HSTS (Strict-Transport-Security)..."
if curl -sI "${URL}" | grep -qi "Strict-Transport-Security"; then
  test_pass "HSTS header present (for HTTPS environments)"
else
  if [[ "$URL" == https://* ]]; then
    test_fail "HSTS header missing (required for HTTPS)"
  else
    test_pass "HSTS header not required for HTTP (localhost)"
  fi
fi

# Test 6: API Auth endpoint exists
test_info "API auth endpoint..."
if curl -sf "${URL}/api/auth/login" -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}' > /dev/null 2>&1; then
  test_pass "Auth endpoint is accessible"
elif curl -sI "${URL}/api/auth/login" | grep -q "404"; then
  test_fail "Auth endpoint not found (404)"
else
  test_pass "Auth endpoint is accessible (may require auth)"
fi

# Test 7: No sensitive information in response headers
test_info "Checking for exposed sensitive information..."
response_headers=$(curl -sI "${URL}")
if echo "$response_headers" | grep -qi "Server:" && ! echo "$response_headers" | grep -qi "Server: Express"; then
  test_pass "Server identity masked in headers"
elif echo "$response_headers" | grep -qi "Server:"; then
  test_fail "Server information exposed in headers (should be hidden)"
fi

# Test 8: CORS handling
test_info "CORS configuration..."
cors_header=$(curl -sI "${URL}" -H "Origin: http://example.com" | grep -i "Access-Control-Allow-Origin" | cut -d' ' -f2)
if [ -n "$cors_header" ]; then
  if [ "$cors_header" = "*" ]; then
    test_fail "CORS allows wildcard origin (security issue for production)"
  else
    test_pass "CORS properly configured with specific origins"
  fi
else
  test_pass "CORS not set (restrictive, acceptable)"
fi

# Test 9: Response time check
test_info "Performance - Health check response time..."
start=$(date +%s%N)
curl -sf "${URL}/health" > /dev/null 2>&1
end=$(date +%s%N)
response_time=$(( (end - start) / 1000000 ))  # Convert to milliseconds

if [ $response_time -lt 1000 ]; then
  test_pass "Health check responds in ${response_time}ms (acceptable)"
elif [ $response_time -lt 5000 ]; then
  test_fail "Health check responds in ${response_time}ms (slower than expected)"
else
  test_fail "Health check timeout or very slow (${response_time}ms)"
fi

# Test 10: Database connectivity (from health check)
test_info "Database connectivity (from health check)..."
db_status=$(curl -s "${URL}/health" | grep -o '"database":"[^"]*"')
if echo "$db_status" | grep -q "ok"; then
  test_pass "Database is healthy ($db_status)"
else
  test_fail "Database is not healthy ($db_status)"
fi

# Test 11: tmux server status (from health check)
test_info "tmux server status (from health check)..."
tmux_status=$(curl -s "${URL}/health" | grep -o '"tmux":"[^"]*"')
if echo "$tmux_status" | grep -q "ok\|no-sessions"; then
  test_pass "tmux server is accessible ($tmux_status)"
else
  test_fail "tmux server has issues ($tmux_status)"
fi

# Summary
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}================================================${NC}"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo -e "${BLUE}================================================${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}All smoke tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed. Check logs above.${NC}"
  exit 1
fi
