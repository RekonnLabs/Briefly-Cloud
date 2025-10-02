/**
 * API endpoint for cleaning up Google Picker tokens
 */

import { NextRequest, NextResponse } from 'next/server'
import { cleanupUserPickerTokens } from '@/app/lib/google-picker/token-service'
import { logger } from '@/app/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId } = body

    // Validate required fields
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      )
    }

    // Call the server-side cleanup function
    await cleanupUserPickerTokens(userId)

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Failed to cleanup Google Picker tokens', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}