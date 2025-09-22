import type { NextRequest, NextResponse } from "next/server"
import { NextResponse as NR } from "next/server"

const TRUSTED_ORIGIN = process.env.NEXT_PUBLIC_APP_URL! // e.g. https://briefly-cloud.vercel.app
const CSRF_COOKIE = "csrf-token"

export function issueCsrf(res: NextResponse, value: string) {
  res.cookies.set(CSRF_COOKIE, value, { httpOnly: true, secure: true, sameSite: "lax", path: "/" })
}

export function verifyCsrf(req: NextRequest) {
  const method = req.method
  if (!["POST","PUT","PATCH","DELETE"].includes(method)) return { ok: true }

  // 1) Origin/Referer
  const origin = req.headers.get("origin") ?? ""
  const referer = req.headers.get("referer") ?? ""
  if (!(origin === TRUSTED_ORIGIN || referer.startsWith(TRUSTED_ORIGIN))) {
    return { ok: false, reason: "bad-origin" }
  }

  // 2) Double-submit token (X-CSRF-Token == csrf cookie)
  const header = req.headers.get("x-csrf-token")
  const cookie = req.cookies.get(CSRF_COOKIE)?.value
  if (!header || !cookie || header !== cookie) {
    return { ok: false, reason: "bad-csrf" }
  }
  return { ok: true }
}
