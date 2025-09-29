import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function getCookie(req: Request, name: string) {
  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return undefined
  
  const cookies = cookieHeader
    .split(';')
    .map(s => s.trim())
    .find(s => s.startsWith(name + '='))
  
  return cookies?.split('=').slice(1).join('=')
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => getCookie(req, name),
          set: () => {},
          remove: () => {},
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHENTICATED' },
        { status: 401 }
      )
    }

    // Get user access status
    const { data: access, error: accessError } = await supabase
      .from('v_user_access')
      .select('trial_active, paid_active, trial_ends_at')
      .eq('user_id', user.id)
      .single()

    if (accessError) {
      console.error('Failed to fetch user access:', accessError)
      return NextResponse.json(
        { success: false, error: 'FAILED_TO_CHECK_ACCESS' },
        { status: 500 }
      )
    }

    // Shape consistently with what gates check
    return NextResponse.json({
      success: true,
      data: {
        trialActive: !!access?.trial_active,
        paidActive: !!access?.paid_active,
        trialEndsAt: access?.trial_ends_at ?? null,
        hasStorageAccess: !!(access?.trial_active || access?.paid_active),
        subscriptionTier: user.app_metadata?.subscription_tier || 'free'
      }
    })

  } catch (error) {
    console.error('Plan status API error:', error)
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}