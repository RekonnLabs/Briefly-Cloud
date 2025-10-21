export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { supabaseAppAdmin } from '@/app/lib/auth/supabase-server-admin'

export async function GET() {
  try {
    // Test 1: Check if service role key is set
    const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
    const serviceRoleKeyLength = process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0
    
    // Test 2: Try to query the profiles table
    const { data, error, count } = await supabaseAppAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
    
    return NextResponse.json({
      serviceRoleKey: {
        isSet: hasServiceRoleKey,
        length: serviceRoleKeyLength,
        startsWithCorrectPrefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.startsWith('eyJ') || false
      },
      profilesTable: {
        accessible: !error,
        error: error ? {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        } : null,
        count: count
      },
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

