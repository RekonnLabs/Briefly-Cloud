// @ts-nocheck — legacy route pending consolidation
import { headers } from 'next/headers'
import { getSupabaseServerReadOnly } from '@/app/lib/auth/supabase-server-readonly'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const h = await headers()
  const authed = h.get('x-sb-session') === '1'

  // Optionally hydrate user if you need it
  let user = null as any
  if (authed) {
    const supabase = await getSupabaseServerReadOnly()
    const { data: { user: u } } = await supabase.auth.getUser()
    user = u ?? null
  }

  // Render; no redirects here

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="max-w-2xl mx-auto bg-surface rounded-lg shadow-sm border border-border p-8">
        <div className="text-center space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Upgrade to Briefly Pro</h1>
            <p className="text-text-secondary">Unlock premium features and higher usage limits</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-8">
            {/* Pro Plan */}
            <div className="border border-border rounded-lg p-6">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Pro Plan</h3>
              <div className="text-3xl font-bold text-text-primary mb-4">
                $19<span className="text-lg font-normal text-text-secondary">/month</span>
              </div>
              <ul className="space-y-2 text-sm text-text-secondary mb-6">
                <li>✓ 1,000 AI chat messages</li>
                <li>✓ 500 document uploads</li>
                <li>✓ 1GB storage</li>
                <li>✓ Priority support</li>
                <li>✓ Advanced features</li>
              </ul>
              <form action="/api/billing/create-checkout-session" method="post">
                <input type="hidden" name="priceId" value={process.env.STRIPE_PRICE_PRO} />
                <button 
                  type="submit"
                  className="w-full bg-cta text-white py-3 px-4 rounded-lg font-medium hover:brightness-110 transition-colors"
                >
                  Upgrade to Pro
                </button>
              </form>
            </div>

            {/* Pro BYOK Plan */}
            <div className="border border-nav-active/20 rounded-lg p-6 bg-ai-card">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Pro BYOK</h3>
              <div className="text-3xl font-bold text-text-primary mb-4">
                $39<span className="text-lg font-normal text-text-secondary">/month</span>
              </div>
              <ul className="space-y-2 text-sm text-text-secondary mb-6">
                <li>✓ 5,000 AI chat messages</li>
                <li>✓ 5,000 document uploads</li>
                <li>✓ 10GB storage</li>
                <li>✓ Bring your own OpenAI key</li>
                <li>✓ Priority support</li>
                <li>✓ All premium features</li>
              </ul>
              <form action="/api/billing/create-checkout-session" method="post">
                <input type="hidden" name="priceId" value={process.env.STRIPE_PRICE_PRO_BYOK} />
                <button 
                  type="submit"
                  className="w-full bg-cta text-white py-3 px-4 rounded-lg font-medium hover:brightness-110 transition-colors"
                >
                  Upgrade to Pro BYOK
                </button>
              </form>
            </div>
          </div>

          <div className="pt-6 border-t border-border">
            <p className="text-sm text-text-tertiary">
              Current plan: <span className="font-medium capitalize">{user.subscription_tier || 'free'}</span>
              {user.subscription_status !== 'active' && (
                <span className="text-red-600 ml-2">({user.subscription_status || 'inactive'})</span>
              )}
            </p>
            <a 
              href="/briefly/app/dashboard" 
              className="inline-block mt-4 text-accent hover:brightness-110 text-sm font-medium"
            >
              ← Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
