// src/app/lib/auth/supabase-server-readonly.ts
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function readCookie(name: string): string | undefined {
  try {
    const v = cookies().get(name)?.value;
    if (v) return v;
  } catch {/* ignore */}
  const raw = headers().get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

export function getSupabaseServerReadOnly() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => readCookie(name),
        set: () => {}, // RSC-safe: never write cookies here
        remove: () => {},
      },
    }
  );
}