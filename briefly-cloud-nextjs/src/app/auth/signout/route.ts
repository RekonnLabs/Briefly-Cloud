import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

function getCookie(req: Request, name: string) {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return undefined;
  
  const cookies = cookieHeader
    .split(';')
    .map(s => s.trim())
    .find(s => s.startsWith(name + '='));
  
  return cookies?.split('=').slice(1).join('=');
}

export async function POST(req: Request) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => getCookie(req, name),
          set: () => {}, // No-op for signout
          remove: () => {}, // No-op for signout
        },
      }
    );

    // Sign out the user
    await supabase.auth.signOut();
    
    // Redirect to signin page
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const redirectUrl = new URL("/auth/signin", siteUrl);
    
    return NextResponse.redirect(redirectUrl.toString(), { status: 302 });
    
  } catch (error) {
    console.error('Signout error:', error);
    
    // Even if signout fails, redirect to signin
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const redirectUrl = new URL("/auth/signin", siteUrl);
    
    return NextResponse.redirect(redirectUrl.toString(), { status: 302 });
  }
}

// Also handle GET requests (in case someone navigates directly)
export async function GET(req: Request) {
  return POST(req);
}
