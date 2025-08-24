import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // Cookie normalizer to strip domain and set safe defaults
  const normalize = (o?: any) => {
    const { domain, ...rest } = o || {}  // strip Domain
    return { httpOnly: true, secure: true, sameSite: 'none' as const, path: '/', ...rest }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => res.cookies.set({ name, value, ...normalize(options) }),
        remove: (name, options) => res.cookies.set({ name, value: '', expires: new Date(0), ...normalize(options) }),
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  // Redirect authenticated users away from signin page
  if (session && req.nextUrl.pathname === '/auth/signin') {
    const to = req.nextUrl.searchParams.get('next') || '/briefly/app/dashboard'
    return NextResponse.redirect(new URL(to, req.url), { headers: res.headers })
  }

  // Redirect unauthenticated users to signin
  if (!session && req.nextUrl.pathname.startsWith('/briefly/app')) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth/signin'
    url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search)
    return NextResponse.redirect(url, { headers: res.headers })
  }

  res.headers.set('x-sb-session', session ? '1' : '0')
  return res
}

export const config = {
  matcher: ['/briefly/app/:path*', '/auth/signin']
}
