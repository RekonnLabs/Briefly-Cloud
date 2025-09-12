// src/app/lib/auth/supabase-server-readonly.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function getSupabaseServerReadOnly() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "public" },
      cookies: {
        // READ ONLY — RSC-safe
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => { /* no-op in server components */ },
        remove: () => { /* no-op in server components */ },
      },
    }
  );
}