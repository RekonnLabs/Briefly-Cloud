export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware';
import { supabaseAppAdmin } from '@/app/lib/auth/supabase-server-admin';

async function getUserProfileHandler(req: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context;
  
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "No user" } },
      { status: 401 }
    );
  }

  try {
    // Use admin client to bypass RLS and query app.users table
    let { data: profile, error } = await supabaseAppAdmin
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error?.code === "PGRST116") {
      // User doesn't exist in app.users, create them
      const { data: upserted, error: insErr } = await supabaseAppAdmin
        .from("users")
        .insert({ 
          id: user.id, 
          email: user.email || `user-${user.id}@example.com`,
          subscription_tier: "free",
          subscription_status: "active"
        })
        .select("*")
        .single();

      if (insErr) {
        console.error('Failed to create user profile:', insErr);
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: insErr.code ?? "INSERT_FAILED",
              message: insErr.message,
            },
          },
          { status: 500 }
        );
      }

      profile = upserted;
      error = null;
    }

    if (error) {
      console.error('Failed to fetch user profile:', error);
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code ?? "READ_FAILED",
            message: error.message,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      ok: true, 
      error: null, 
      user: { id: user.id, email: user.email }, 
      profile 
    });

  } catch (error) {
    console.error('User profile API error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch user profile"
        }
      },
      { status: 500 }
    );
  }
}

export const GET = createProtectedApiHandler(getUserProfileHandler);
