export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerMutable } from "@/app/lib/auth/supabase-server-mutable";

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");
  if (!provider) {
    return NextResponse.redirect(new URL("/auth/signin?err=provider", req.url));
  }

  // A response that will carry any PKCE cookies Supabase sets during URL generation
  const res = NextResponse.next();

  const supabase = getSupabaseServerMutable(req, res);

  const redirectTo = new URL("/auth/callback", req.url).toString();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as any,
    options: { redirectTo },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(new URL("/auth/signin?err=start", req.url), {
      headers: res.headers, // include any cookies that were set
    });
  }

  // IMPORTANT: return a redirect that *includes* the Set-Cookie headers from `res`
  return NextResponse.redirect(data.url, { headers: res.headers });
}