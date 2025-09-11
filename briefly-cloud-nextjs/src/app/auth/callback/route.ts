export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerMutable } from "@/app/lib/auth/supabase-server-mutable";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/auth/signin?err=code", req.url));
  }

  // ⬇️ REPLACE NextResponse.next() with a plain writable response
  const res = new NextResponse(null);
  const supabase = getSupabaseServerMutable(req, res);

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  const headers = res.headers; // carry Set-Cookie from Supabase

  if (error) {
    return NextResponse.redirect(new URL("/auth/signin?err=exchange", req.url), { headers });
  }

  return NextResponse.redirect(new URL("/briefly/app/dashboard", req.url), { headers });
}