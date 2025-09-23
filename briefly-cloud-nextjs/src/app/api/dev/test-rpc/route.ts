import { supabaseAdmin } from '@/app/lib/supabase-admin'
import { getSupabaseServerReadOnly } from '@/app/lib/auth/supabase-server-readonly'

export async function GET() {
  try {
    // Get current user for testing
    const supabase = getSupabaseServerReadOnly()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Test the RPC function directly
    console.log('[TEST-RPC] Testing app.save_oauth_token RPC...')
    
    const testData = {
      p_user_id: user.id,
      p_provider: 'google',
      p_access_token: 'test_access_token_123',
      p_refresh_token: 'test_refresh_token_456',
      p_scope: 'https://www.googleapis.com/auth/drive.readonly',
      p_expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
    }
    
    console.log('[TEST-RPC] Calling RPC with:', testData)
    
    const { data, error } = await supabaseAdmin.schema('app').rpc('save_oauth_token', testData)
    
    console.log('[TEST-RPC] RPC response:', { data, error })
    
    if (error) {
      return Response.json({ 
        success: false, 
        error: error.message,
        testData 
      })
    }
    
    // Now try to retrieve it
    const { data: retrievedData, error: getError } = await supabaseAdmin.schema('app').rpc('get_oauth_token', {
      p_user_id: user.id,
      p_provider: 'google'
    })
    
    console.log('[TEST-RPC] Retrieved data:', { retrievedData, getError })
    
    return Response.json({ 
      success: true, 
      saved: { data, error },
      retrieved: { data: retrievedData, error: getError },
      testData
    })
    
  } catch (error) {
    console.error('[TEST-RPC] Exception:', error)
    return Response.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      exception: true
    })
  }
}