export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: Request) {
  const res = new NextResponse(null);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => (req as any).cookies?.get?.(n)?.value,
        set: (n, v, o) =>
          res.cookies.set(n, v, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            ...o,
          }),
        remove: (n, o) =>
          res.cookies.set(n, "", {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            maxAge: 0,
            ...o,
          }),
      },
    }
  );

  const {
    data: { user },
    error: uerr,
  } = await supabase.auth.getUser();

  if (uerr || !user) {
    return new NextResponse("Unauthorized", { status: 401, headers: res.headers });
  }

  let {
    data: profile,
    error,
  } = await supabase
    .schema("app")
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error?.code == "PGRST116") {
    const { data: upserted, error: insErr } = await supabase
      .schema("app")
      .from("profiles")
      .insert({ id: user.id, email: user.email, plan: "free" })
      .select("*")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr }, { status: 500, headers: res.headers });
    }

    profile = upserted;
    error = null;
  }

  if (error) {
    return NextResponse.json({ error }, { status: 500, headers: res.headers });
  }

  return NextResponse.json({ user, profile }, { headers: res.headers });
}
