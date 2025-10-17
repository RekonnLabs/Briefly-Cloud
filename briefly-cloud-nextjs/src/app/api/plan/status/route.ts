import { NextRequest, NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { supabaseAppAdmin } from '@/app/lib/auth/supabase-server-admin'

async function getPlanStatusHandler(req: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHENTICATED' },
      { status: 401 }
    )
  }

  try {
    // Use admin client to bypass RLS and query app schema directly
    const { data: userProfile, error: profileError } = await supabaseAppAdmin
      .from('profiles')
      .select(`
        subscription_tier,
        subscription_status,
        trial_end_date,
        created_at
      `)
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Failed to fetch user profile:', profileError)
      return NextResponse.json(
        { success: false, error: 'FAILED_TO_CHECK_ACCESS' },
        { status: 500 }
      )
    }

    // Determine access status based on subscription
    const now = new Date()
    const trialEndDate = userProfile?.trial_end_date ? new Date(userProfile.trial_end_date) : null
    const createdAt = new Date(userProfile?.created_at || now)
    
    // Default trial period (e.g., 14 days from signup)
    const defaultTrialEnd = new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000)
    const effectiveTrialEnd = trialEndDate || defaultTrialEnd
    
    const trialActive = now < effectiveTrialEnd && userProfile?.subscription_tier === 'free'
    const paidActive = userProfile?.subscription_status === 'active' && 
                      userProfile?.subscription_tier !== 'free'

    return NextResponse.json({
      success: true,
      data: {
        trialActive,
        paidActive,
        trialEndsAt: effectiveTrialEnd.toISOString(),
        hasStorageAccess: trialActive || paidActive,
        subscriptionTier: userProfile?.subscription_tier || 'free',
        subscriptionStatus: userProfile?.subscription_status || 'inactive'
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

export const GET = createProtectedApiHandler(getPlanStatusHandler)