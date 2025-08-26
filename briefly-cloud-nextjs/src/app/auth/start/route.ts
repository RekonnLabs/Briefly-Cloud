import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { clampNext } from "@/app/lib/auth/utils";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = (url.searchParams.get("provider") || "").toLowerCase(); // 'google' | 'azure'
  const next = clampNext(url.searchParams.get("next") || undefined);
  if (!["google", "azure"].includes(provider)) {
    return NextResponse.redirect(new URL("/auth/error?error=bad_provider", url.origin), { status: 307 });
  }

  const jar = await cookies(); // <-- App Router cookie jar (no NextResponse.next())

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => jar.get(name)?.value,
        set: (name, value, options) => jar.set({ name, value, ...options }),
        remove: (name, options) => jar.set({ name, value: "", ...options, maxAge: 0 }),
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as "google" | "azure",
    options: {
      redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      // Optional QoL:
      queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
    },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(new URL("/auth/error?error=start_failed", url.origin), { status: 307 });
  }

  // Returning a redirect after mutating `cookies()` automatically forwards Set‑Cookie.
  return NextResponse.redirect(data.url, { status: 302 });
}