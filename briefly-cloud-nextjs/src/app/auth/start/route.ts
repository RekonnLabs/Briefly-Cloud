export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerMutable } from "@/app/lib/auth/supabase-server-mutable";

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");
  if (!provider) {
    return NextResponse.redirect(new URL("/auth/signin?err=provider", req.url));
  }

  // ⬇️ REPLACE NextResponse.next() with a plain writable response
  const res = new NextResponse(null);

  const supabase = getSupabaseServerMutable(req, res);
  const redirectTo = new URL("/auth/callback", req.url).toString();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as any,
    options: { redirectTo },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(new URL("/auth/signin?err=start", req.url), {
      headers: res.headers, // preserve Set-Cookie
    });
  }

  // Preserve PKCE cookies on the redirect
  return NextResponse.redirect(data.url, { headers: res.headers });
}