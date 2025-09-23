import { cookies, headers } from "next/headers";
import { createServerClient, type SupabaseClient } from "@supabase/ssr";

// Safely read a cookie; fall back to raw Cookie header for first-SSR edge cases
function readCookie(name: string): string | undefined {
  try {
    const v = cookies().get(name)?.value;
    if (v) return v;
  } catch {
    // ignore
  }
  const raw = headers().get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

export function getSupabaseServerReadOnly(): SupabaseClient {
  // Use placeholder values during build if environment variables are not available
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDA5OTUyMDAsImV4cCI6MTk1NjU3MTIwMH0.placeholder'

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        get: (name) => readCookie(name),
        // RSC-safe: never write cookies in server components/layouts
        set: () => {},
        remove: () => {},
      },
    }
  );
}

/** @deprecated Use getSupabaseServerReadOnly(). Alias kept for backward compat with older tests. */
export const createServerClientReadOnly = getSupabaseServerReadOnly;
