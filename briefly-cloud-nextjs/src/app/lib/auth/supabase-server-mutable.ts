// Use ONLY in route handlers that must set cookies (/auth/start, /auth/callback)
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export function getSupabaseServerMutable(req: NextRequest, res: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "public" },
      cookies: {
        // read from the incoming request
        get: (name) => req.cookies.get(name)?.value,
        // write to the response we'll actually return
        set: (name, value, options) => res.cookies.set(name, value, options),
        remove: (name, options) => res.cookies.set(name, "", { ...options, maxAge: 0 }),
      },
    }
  );
  return supabase;
}
