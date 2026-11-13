#!/bin/bash

# Multi-Tenant SaaS Backend - API Test Script
# This script tests all Phase 1 endpoints

BASE_URL="http://localhost:5000"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   Multi-Tenant SaaS Backend - Phase 1 API Test                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Test 1: Health Check
echo "📌 Test 1: Health Check"
curl -s "$BASE_URL/health" | jq . || echo "Server not running"
echo ""

# Test 2: Register
echo "📌 Test 2: Register New User"
echo "Registering: newtestuser@example.com"
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email": "newtestuser@example.com"}')
echo "$REGISTER_RESPONSE" | jq .
echo ""

# Extract OTP from console (for testing)
echo "📌 Note: OTP is logged to server console (since SMTP not configured)"
echo "Check server console for 6-digit OTP code"
echo ""

# Test 3: Verify OTP (using test data)
echo "📌 Test 3: Verify OTP (using test@example.com)"
echo "Note: You need to get the OTP from server console first"
read -p "Enter OTP: " OTP_CODE
VERIFY_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/verify" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"test@example.com\", \"otp\": \"$OTP_CODE\"}")
echo "$VERIFY_RESPONSE" | jq .

# Extract token for protected route test
TOKEN=$(echo "$VERIFY_RESPONSE" | jq -r '.data.token' 2>/dev/null)
if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
  echo "✓ Token obtained: ${TOKEN:0:30}..."
  
  # Test 4: Get Tenant Info (Protected Route)
  echo ""
  echo "📌 Test 4: Get Tenant Info (Protected)"
  curl -s "$BASE_URL/api/tenant/me" \
    -H "Authorization: Bearer $TOKEN" | jq .
else
  echo "✗ Token not obtained, skipping protected route test"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    Test Complete                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
