export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerMutable } from "@/app/lib/auth/supabase-server-mutable";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/auth/signin?err=code", req.url));
  }

  const res = NextResponse.next(); // will carry Set-Cookie
  const supabase = getSupabaseServerMutable(req, res);

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  // Whether success or failure, always pass through the `res.headers`
  if (error) {
    return NextResponse.redirect(new URL("/auth/signin?err=exchange", req.url), {
      headers: res.headers,
    });
  }

  return NextResponse.redirect(new URL("/briefly/app/dashboard", req.url), {
    headers: res.headers,
  });
}