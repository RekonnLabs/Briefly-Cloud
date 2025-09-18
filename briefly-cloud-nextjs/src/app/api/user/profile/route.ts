export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: Request) {
  const res = new NextResponse(null);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => (req as any).cookies?.get?.(n)?.value,
        set: (n, v, o) =>
          res.cookies.set(n, v, {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            ...o,
          }),
        remove: (n, o) =>
          res.cookies.set(n, "", {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
            maxAge: 0,
            ...o,
          }),
      },
    }
  );

  const json = (body: any, init?: number | ResponseInit) => {
    const status = typeof init === "number" ? init : init?.status ?? 200;
    const response = new NextResponse(JSON.stringify(body), { status });
    response.headers.set("content-type", "application/json; charset=utf-8");
    res.headers.forEach((value, key) => {
      response.headers.append(key, value);
    });
    return response;
  };

  const {
    data: { user },
    error: uerr,
  } = await supabase.auth.getUser();

  if (uerr || !user) {
    return json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "No user" } },
      { status: 401 }
    );
  }

  let {
    data: profile,
    error,
  } = await supabase
    .schema("app")
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error?.code === "PGRST116") {
    const { data: upserted, error: insErr } = await supabase
      .schema("app")
      .from("profiles")
      .insert({ id: user.id, email: user.email, plan: "free" })
      .select("*")
      .single();

    if (insErr) {
      return json(
        {
          ok: false,
          error: {
            code: insErr.code ?? "INSERT_FAILED",
            message: insErr.message,
          },
        },
        500
      );
    }

    profile = upserted;
    error = null;
  }

  if (error) {
    return json(
      {
        ok: false,
        error: {
          code: error.code ?? "READ_FAILED",
          message: error.message,
        },
      },
      500
    );
  }

  return json({ ok: true, error: null, user, profile });
}
