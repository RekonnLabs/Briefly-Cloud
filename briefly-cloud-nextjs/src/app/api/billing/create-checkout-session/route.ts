import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/rate-limit'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/app/lib/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

async function createCheckoutHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const body = await request.json().catch(() => ({})) as { tier?: 'pro' | 'pro_byok' }
  const tier = body.tier || 'pro'
  if (!['pro', 'pro_byok'].includes(tier)) return ApiResponse.badRequest('Invalid tier')

  const supabase = supabaseAdmin

  // Ensure customer id
  const { data: profile } = await supabase
    .from('users')
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .single()

  let customerId = profile?.stripe_customer_id as string | null
  if (!customerId) {
    const customer = await stripe.customers.create({ email: profile?.email || user.email, metadata: { user_id: user.id } })
    customerId = customer.id
    await supabase
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

  const priceId = tier === 'pro' ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_PRO_BYOK
  if (!priceId) return ApiResponse.internalError('Price ID not configured')

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: process.env.STRIPE_SUCCESS_URL!,
    cancel_url: process.env.STRIPE_CANCEL_URL!,
    metadata: { user_id: user.id, tier },
  })

  return ApiResponse.success({ url: session.url })
}

export const POST = createProtectedApiHandler(createCheckoutHandler, {
  rateLimit: rateLimitConfigs.general,
  logging: { enabled: true, includeBody: true },
})
