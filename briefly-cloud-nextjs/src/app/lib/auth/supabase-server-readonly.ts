// src/app/lib/auth/supabase-server-readonly.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function getSupabaseServerReadOnly() {
  const cookieStore = cookies();

  // Optional: helpful diagnostics while we're debugging
  try {
    const all = cookieStore.getAll();
    const sb = all.filter(c => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
    console.log("[supabase-readonly] Available cookies:", {
      total: all.length,
      sbCookieNames: sb.map(c => c.name)
    });
  } catch (e) {
    console.log("[supabase-readonly] cookies().getAll() failed:", (e as Error).message);
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // READ ONLY — RSC-safe
        get: (name: string) => {
          const v = cookieStore.get(name)?.value;
          // console.log("[supabase-readonly] get", name, v ? "present" : "missing");
          return v;
        },
        set: () => { /* no-op in server components */ },
        remove: () => { /* no-op in server components */ },
      },
    }
  );
}