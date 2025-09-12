export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerMutable } from "@/app/lib/auth/supabase-server-mutable";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") ?? "/briefly/app/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/auth/signin?err=code", req.url));
  }

  const res = new NextResponse(null);
  const supabase = getSupabaseServerMutable(req, res);

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  const headers = res.headers;

  // Redirect to the original intended path
  const dest = new URL(next, req.url);
  return NextResponse.redirect(error ? new URL("/auth/signin?err=exchange", req.url) : dest, { headers });
}