/**
 * API endpoint for client-side audit logging of signout events
 */

import { NextRequest, NextResponse } from 'next/server'
import { auditUserAction } from '@/app/lib/audit/comprehensive-audit-logger'
import { logger } from '@/app/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, userId, success, correlationId, metadata, severity } = body

    // Validate required fields
    if (!action || !userId || typeof success !== 'boolean' || !correlationId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Call the server-side audit function
    await auditUserAction(
      action,
      userId,
      success,
      correlationId,
      metadata,
      severity || 'low'
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Failed to process audit event', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}