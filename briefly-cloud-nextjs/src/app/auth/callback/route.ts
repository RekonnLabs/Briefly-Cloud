import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function safeNext(next?: string) {
  try {
    const u = new URL(next || "/briefly/app/dashboard", "https://example.local");
    return u.pathname.startsWith("/") ? u.pathname + (u.search || "") : "/briefly/app/dashboard";
  } catch { return "/briefly/app/dashboard"; }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const next = safeNext(url.searchParams.get("next"));
  
  if (!code) {
    return NextResponse.redirect(new URL("/auth/signin", url.origin), { status: 307 });
  }

  const jar = await cookies();
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

  // Read PKCE verifier from multiple possible cookie names
  const codeVerifier = 
    jar.get("sb-code-verifier")?.value ||
    jar.get("sb-auth-code-verifier")?.value ||
    jar.get("code_verifier")?.value ||
    jar.get(`sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0]}-auth-code-verifier`)?.value ||
    undefined;

  if (!codeVerifier) {
    return NextResponse.redirect(new URL("/auth/error?error=callback_exchange_failed", url.origin), { status: 307 });
  }

  // Try modern SDK call first
  try {
    const { error } = await supabase.auth.exchangeCodeForSession({ 
      authCode: code, 
      codeVerifier 
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin), { status: 307 });
    }
  } catch (e) {
    console.warn("[auth/callback] SDK exchange failed, trying REST:", e);
  }

  // REST fallback - POST to GoTrue's PKCE endpoint
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const r = await fetch(`${supaUrl}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": anon,
      "authorization": `Bearer ${anon}`,
    },
    body: JSON.stringify({
      auth_code: code,
      code_verifier: codeVerifier,
      redirect_to: `${url.origin}/auth/callback`,
    }),
  });

  if (!r.ok) {
    return NextResponse.redirect(new URL("/auth/error?error=callback_exchange_failed", url.origin), { status: 307 });
  }

  const payload = await r.json();
  const { error: setErr } = await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  });

  if (setErr) {
    return NextResponse.redirect(new URL("/auth/error?error=callback_exchange_failed", url.origin), { status: 307 });
  }

  // Return 307 redirect to sanitized next value; no "response proxy" needed
  return NextResponse.redirect(new URL(next, url.origin), { status: 307 });
}