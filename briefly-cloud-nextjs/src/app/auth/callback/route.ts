import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { clampNext } from "@/app/lib/auth/utils";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const next = clampNext(url.searchParams.get("next") || undefined);
  
  if (!code) {
    return NextResponse.redirect(new URL("/auth/signin", url.origin), { status: 307 });
  }

function extractProjectRef(url: string) {
  try {
    return new URL(url).host.split(".")[0]; // aeeumarw...
  } catch {
    return "";
  }
}

function decodeVerifier(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("base64-")) {
    try {
      const b64 = raw.slice(7);
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      // Supabase often stores the string JSON-encoded (e.g. "\"a9W...\"")
      return decoded.startsWith('"') ? JSON.parse(decoded) : decoded;
    } catch {
      return undefined;
    }
  }
  return raw;
}

  const projectRef = extractProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const jar = cookies();

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

  // 🔧 modern name FIRST, then fallbacks
  const rawVerifier =
    jar.get(`sb-${projectRef}-auth-token-code-verifier`)?.value ||
    jar.get(`sb-${projectRef}-auth-code-verifier`)?.value ||
    jar.get("sb-auth-code-verifier")?.value ||
    jar.get("sb-code-verifier")?.value ||
    jar.get("code_verifier")?.value;

  const codeVerifier = decodeVerifier(rawVerifier);

  // optional debug (remove after verifying):
  console.info("[auth/callback] verifier", {
    projectRef,
    hasVerifier: !!codeVerifier,
    len: codeVerifier?.length,
  });

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(
        codeVerifier ? { authCode: code, codeVerifier } : (code as any)
      );
      console.info("[auth/callback] sdk_result", { ok: !error, usedObjectSig: !!codeVerifier });
      if (!error) {
        return NextResponse.redirect(new URL(next, url), { status: 307 });
      }
    }
  } catch {}

  if (!codeVerifier) {
    return NextResponse.redirect(new URL("/auth/error?error=callback_exchange_failed", url), { status: 307 });
  }

  console.info("[auth/callback] rest_fallback", { posting: true });

  const tokenUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/auth/v1/token?grant_type=pkce`;
  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
    },
    body: JSON.stringify({
      auth_code: code,
      code_verifier: codeVerifier,
      redirect_to: `${url.origin}/auth/callback`,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("[auth/callback] rest_failed", { status: resp.status, body: t?.slice(0, 300) });
    return NextResponse.redirect(new URL("/auth/error?error=callback_exchange_failed", url), { status: 307 });
  }

  const payload = await resp.json();
  await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  });

  return NextResponse.redirect(new URL(next, url), { status: 307 });
}