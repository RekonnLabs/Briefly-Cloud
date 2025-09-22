import { headers } from 'next/headers'
import { createServerClientReadOnly } from '@/app/lib/auth/supabase-server-readonly'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const h = await headers()
  const authed = h.get('x-sb-session') === '1'

  // Optionally hydrate user if you need it
  let user = null as any
  if (authed) {
    const supabase = createServerClientReadOnly()
    const { data: { user: u } } = await supabase.auth.getUser()
    user = u ?? null
  }

  // Render; no redirects here

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="text-center space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Upgrade to Briefly Pro</h1>
            <p className="text-gray-600">Unlock premium features and higher usage limits</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-8">
            {/* Pro Plan */}
            <div className="border border-gray-200 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Pro Plan</h3>
              <div className="text-3xl font-bold text-gray-900 mb-4">
                $19<span className="text-lg font-normal text-gray-600">/month</span>
              </div>
              <ul className="space-y-2 text-sm text-gray-600 mb-6">
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
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Upgrade to Pro
                </button>
              </form>
            </div>

            {/* Pro BYOK Plan */}
            <div className="border border-blue-200 rounded-lg p-6 bg-blue-50">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Pro BYOK</h3>
              <div className="text-3xl font-bold text-gray-900 mb-4">
                $39<span className="text-lg font-normal text-gray-600">/month</span>
              </div>
              <ul className="space-y-2 text-sm text-gray-600 mb-6">
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
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Upgrade to Pro BYOK
                </button>
              </form>
            </div>
          </div>

          <div className="pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Current plan: <span className="font-medium capitalize">{user.subscription_tier || 'free'}</span>
              {user.subscription_status !== 'active' && (
                <span className="text-red-600 ml-2">({user.subscription_status || 'inactive'})</span>
              )}
            </p>
            <a 
              href="/briefly/app/dashboard" 
              className="inline-block mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              ← Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
