import { NextResponse } from 'next/server'
import { createProtectedApiHandler, ApiContext } from '@/app/lib/api-middleware'
import { ApiResponse } from '@/app/lib/api-utils'
import { rateLimitConfigs } from '@/app/lib/usage/rate-limiter'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/app/lib/supabase-admin'

// Lazy initialization to avoid build-time issues
let _stripe: Stripe | null = null
const getStripe = () => {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
  }
  return _stripe
}

async function createCheckoutHandler(request: Request, context: ApiContext): Promise<NextResponse> {
  const { user } = context
  if (!user) return ApiResponse.unauthorized('User not authenticated')

  const body = await request.json().catch(() => ({})) as { tier?: 'pro' | 'pro_byok'; price_id?: string }
  const tier = body.tier || 'pro'
  if (!['pro', 'pro_byok'].includes(tier)) return ApiResponse.badRequest('Invalid tier')

  const supabase = supabaseAdmin

  // Ensure customer id
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .single()

  let customerId = profile?.stripe_customer_id as string | null
  if (!customerId) {
    const customer = await getStripe().customers.create({ email: profile?.email || user.email, metadata: { user_id: user.id } })
    customerId = customer.id
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

  // Allow explicit price_id override (e.g. annual prices) — validated against known price IDs
  const ALLOWED_PRICE_OVERRIDES = [
    process.env.STRIPE_PRICE_PRO,
    process.env.STRIPE_PRICE_PRO_BYOK,
    'price_1TDoQxCyLd2ewSj072pIukU7', // Pro Annual
    'price_1TDoR0CyLd2ewSj0TqMQoBBd', // Pro BYOK Annual
  ].filter(Boolean)
  const defaultPriceId = tier === 'pro' ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_PRO_BYOK
  const priceId = (body.price_id && ALLOWED_PRICE_OVERRIDES.includes(body.price_id))
    ? body.price_id
    : defaultPriceId
  if (!priceId) return ApiResponse.internalError('Price ID not configured')

  const session = await getStripe().checkout.sessions.create({
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
