import { TIER_LIMITS } from '@/app/lib/auth'
import { createSuccessResponse } from '@/app/lib/utils'

export async function GET() {
  return Response.json(
    createSuccessResponse(TIER_LIMITS)
  )
}