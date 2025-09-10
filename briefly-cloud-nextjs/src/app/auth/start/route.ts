export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSupabaseServerMutable } from '@/app/lib/auth/supabase-server-mutable'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const provider = url.searchParams.get('provider') as 'google' | 'azure' | null
  
  console.log('[auth/start] initiating OAuth for provider:', provider)
  
  if (!provider) {
    return NextResponse.json({ error: 'missing provider' }, { status: 400 })
  }

  // Create a temporary response to capture PKCE cookies
  const tempRes = NextResponse.next()
  const supabase = getSupabaseServerMutable(tempRes, req)
  
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${url.origin}/auth/callback`,
        // Keep PKCE default; server will set the verifier cookie
      },
    })

    if (error || !data?.url) {
      console.error('[auth/start] signInWithOAuth error:', error)
      return NextResponse.redirect(new URL('/auth/signin?err=start', url))
    }

    console.log('[auth/start] OAuth URL generated, PKCE cookies:', 
      tempRes.cookies.getAll().filter(c => c.name.includes('sb-')).length
    )

    // Create the redirect response and copy PKCE cookies
    const redirectRes = NextResponse.redirect(data.url, 302)
    tempRes.cookies.getAll().forEach(cookie => {
      redirectRes.cookies.set(cookie)
      console.log('[auth/start] copying cookie:', cookie.name)
    })

    return redirectRes
  } catch (err) {
    console.error('[auth/start] unexpected error:', err)
    return NextResponse.redirect(new URL('/auth/signin?err=start_error', url))
  }
}