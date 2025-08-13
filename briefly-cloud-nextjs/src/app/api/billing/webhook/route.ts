import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/app/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const sig = request.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET!
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })

  const body = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig!, secret)
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = supabaseAdmin

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = (session.metadata as any)?.user_id
        const tier = (session.metadata as any)?.tier
        if (userId && tier) {
          await supabase.from('users').update({ subscription_tier: tier, subscription_status: 'active' }).eq('id', userId)
        }
        break
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        const { data: match } = await supabase.from('users').select('id').eq('stripe_customer_id', customerId).single()
        if (match?.id) {
          await supabase.from('users').update({ subscription_tier: 'free', subscription_status: 'canceled' }).eq('id', match.id)
        }
        break
      }
      default:
        break
    }
    return NextResponse.json({ received: true })
  } catch (e) {
    return NextResponse.json({ error: 'Webhook error' }, { status: 400 })
  }
}



