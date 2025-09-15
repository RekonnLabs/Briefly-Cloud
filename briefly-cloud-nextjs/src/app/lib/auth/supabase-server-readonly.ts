// src/app/lib/auth/supabase-server-readonly.ts
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function getCookieValue(name: string): string | undefined {
  // Prefer Next's cookies() (works in most cases)
  try {
    const v = cookies().get(name)?.value;
    if (v) return v;
  } catch {
    // ignore
  }
  // Fallback: parse raw Cookie header (handles edge cases after middleware)
  const raw = headers().get("cookie") ?? "";
  // Basic cookie parsing
  for (const pair of raw.split(";")) {
    const [k, ...rest] = pair.trim().split("=");
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
        get: (name: string) => getCookieValue(name),
        // Read-only: MUST be no-ops in server components/layouts
        set: () => {},
        remove: () => {},
      },
    }
  );
}