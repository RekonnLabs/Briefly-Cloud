import { supabase } from '@/app/lib/supabase'
import { createSuccessResponse, createErrorResponse } from '@/app/lib/utils'

export async function POST() {
  try {
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      console.error('Logout error:', error)
      return Response.json(
        createErrorResponse('Logout failed'),
        { status: 500 }
      )
    }

    return Response.json(
      createSuccessResponse({ message: 'Logged out successfully' })
    )
  } catch (error) {
    console.error('Logout error:', error)
    return Response.json(
      createErrorResponse('Logout failed'),
      { status: 500 }
    )
  }
}