/**
 * API endpoint for disconnecting Microsoft OneDrive storage
 */

import { NextRequest, NextResponse } from 'next/server'
import { ConnectionManager } from '@/app/lib/cloud-storage/connection-manager'
import { logger } from '@/app/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, options } = body

    // Validate required fields
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      )
    }

    // Call the server-side ConnectionManager
    await ConnectionManager.disconnectMicrosoft(userId, options || {})

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Failed to disconnect Microsoft OneDrive', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}