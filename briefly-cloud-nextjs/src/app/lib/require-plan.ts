/**
 * Plan requirement guard for API routes
 * Prevents bypassing plan restrictions via direct API calls
 */

import { createServerClient } from '@supabase/ssr'

export interface PlanCheckResult {
  ok: boolean
  user?: any
  supabase?: any
  error?: string
}

export async function requirePlan(req: Request): Promise<PlanCheckResult> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'public' },
      cookies: {
        get: (name) => {
          const cookieHeader = req.headers.get('cookie')
          if (!cookieHeader) return undefined
          
          const cookies = cookieHeader
            .split(';')
            .map(s => s.trim())
            .find(s => s.startsWith(name + '='))
          
          return cookies?.split('=').slice(1).join('=')
        },
        set: () => {}, 
        remove: () => {},
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return { 
      ok: false, 
      error: 'Authentication required' 
    }
  }

  const { data: access, error: accessError } = await supabase
    .from('v_user_access')
    .select('trial_active, paid_active')
    .eq('user_id', user.id)
    .single()

  if (accessError) {
    return { 
      ok: false, 
      user, 
      supabase, 
      error: 'Failed to check plan access' 
    }
  }

  const hasAccess = Boolean(access?.trial_active || access?.paid_active)
  
  return { 
    ok: hasAccess, 
    user, 
    supabase,
    error: hasAccess ? undefined : 'Plan required'
  }
}
