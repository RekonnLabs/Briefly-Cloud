#!/usr/bin/env node

import assert from "node:assert/strict"

const base = process.env.SMOKE_BASE_URL // e.g. your Vercel preview URL
assert(base, "SMOKE_BASE_URL required")

console.log(`🔍 Running smoke tests against: ${base}`)

try {
  // Test basic health endpoint
  console.log("Testing /api/health...")
  const healthRes = await fetch(`${base}/api/health`)
  assert(healthRes.ok, `/api/health failed: ${healthRes.status}`)
  console.log("✅ /api/health passed")

  // Test auth diagnostic endpoint (should work without auth)
  console.log("Testing /api/diag/auth...")
  const diagRes = await fetch(`${base}/api/diag/auth`)
  // Should return 401 for unauthenticated request
  assert(diagRes.status === 401, `/api/diag/auth should return 401 for unauthenticated request, got: ${diagRes.status}`)
  const diagData = await diagRes.json()
  assert(!diagData.hasAccess, "Should not have access without auth")
  console.log("✅ /api/diag/auth correctly rejects unauthenticated requests")

  // Test that protected routes require auth
  console.log("Testing protected route /api/user/profile...")
  const profileRes = await fetch(`${base}/api/user/profile`)
  assert(profileRes.status === 401, `/api/user/profile should return 401 for unauthenticated request, got: ${profileRes.status}`)
  console.log("✅ Protected routes correctly require authentication")

  // Test auth tiers endpoint (should work without auth)
  console.log("Testing /api/auth/tiers...")
  const tiersRes = await fetch(`${base}/api/auth/tiers`)
  assert(tiersRes.ok, `/api/auth/tiers failed: ${tiersRes.status}`)
  const tiersData = await tiersRes.json()
  assert(tiersData.tiers, "Should return tiers data")
  console.log("✅ /api/auth/tiers passed")

  console.log("🎉 All smoke tests passed!")
} catch (error) {
  console.error("❌ Smoke test failed:", error.message)
  process.exit(1)
}