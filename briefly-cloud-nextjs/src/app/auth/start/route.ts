export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerMutable } from "@/app/lib/auth/supabase-server-mutable";

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");
  const next = req.nextUrl.searchParams.get("next") ?? "/briefly/app/dashboard";

  if (!provider) {
    return NextResponse.redirect(new URL("/auth/signin?err=provider", req.url));
  }

  const res = new NextResponse(null);
  const supabase = getSupabaseServerMutable(req, res);

  // Hand the intended destination through the callback URL
  const redirectTo = new URL(`/auth/callback?next=${encodeURIComponent(next)}`, req.url).toString();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as any,
    options: { redirectTo },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(new URL("/auth/signin?err=start", req.url), { headers: res.headers });
  }
  return NextResponse.redirect(data.url, { headers: res.headers });
}