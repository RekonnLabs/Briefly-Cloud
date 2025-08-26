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

  // get project ref from NEXT_PUBLIC_SUPABASE_URL
  const projectRef = (() => {
    try {
      const h = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host; // aeeumarw...supabase.co
      return h.split(".")[0]; // aeeumarw...
    } catch { return ""; }
  })();

  // 🔧 NEW: include the modern cookie name first
  const codeVerifier =
    jar.get(`sb-${projectRef}-auth-token-code-verifier`)?.value || // modern
    jar.get(`sb-${projectRef}-auth-code-verifier`)?.value ||       // older
    jar.get("sb-auth-code-verifier")?.value ||
    jar.get("sb-code-verifier")?.value ||
    jar.get("code_verifier")?.value ||
    undefined;

  console.info("[auth/callback] verifier", { projectRef, hasVerifier: !!codeVerifier, len: codeVerifier?.length });

  // 1) Modern SDK path first (object signature)
  try {
    if (code) {
      const { error: sdkErr } = await supabase.auth.exchangeCodeForSession(
        codeVerifier ? { authCode: code, codeVerifier } : (code as any)
      );
      console.info("[auth/callback] sdk_result", { ok: !sdkErr, usedObjectSig: !!codeVerifier, codePresent: !!code });
      if (!sdkErr) {
        return NextResponse.redirect(new URL(next, url), { status: 307 });
      }
    }
  } catch { /* fall through */ }

  // 2) REST fallback if SDK path didn't work
  if (!codeVerifier) {
    return NextResponse.redirect(new URL("/auth/error?error=callback_exchange_failed", url), { status: 307 });
  }

  console.info("[auth/callback] rest_fallback", { posting: true });
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL!}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify({
      auth_code: code,
      code_verifier: codeVerifier,
      redirect_to: `${url.origin}/auth/callback`,
    }),
  });

  if (!r.ok) {
    return NextResponse.redirect(new URL("/auth/error?error=callback_exchange_failed", url), { status: 307 });
  }
  
  const payload = await r.json();
  await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  });
  
  return NextResponse.redirect(new URL(next, url), { status: 307 });
}