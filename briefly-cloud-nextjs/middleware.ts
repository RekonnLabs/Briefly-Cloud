import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => {
          // Normalize cookie options for Vercel deployment
          const normalizedOptions = {
            ...options,
            httpOnly: true,
            secure: true,
            sameSite: 'lax' as const,
            path: '/',
            // Remove domain to let browser set it automatically
            domain: undefined
          }
          res.cookies.set({ name, value, ...normalizedOptions })
        },
        remove: (name, options) => {
          const normalizedOptions = {
            ...options,
            httpOnly: true,
            secure: true,
            sameSite: 'lax' as const,
            path: '/',
            domain: undefined,
            expires: new Date(0)
          }
          res.cookies.set({ name, value: '', ...normalizedOptions })
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

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
  matcher: [
    '/briefly/app/:path*',
    '/((?!auth/callback|api/storage/.*/callback|api/billing/webhook|_next/static|_next/image|favicon.ico).*)'
  ]
}
