import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const res = new NextResponse(null);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => (req as any).cookies?.get?.(n)?.value,
        set: (n, v, o) => res.cookies.set(n, v, { httpOnly: true, secure: true, sameSite: "lax", path: "/", ...o }),
        remove: (n, o) => res.cookies.set(n, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0, ...o }),
      },
    }
  );

  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/auth/signin", req.url), { headers: res.headers });
}