/**
 * Join/Paywall Page
 * 
 * Shown to users who need to upgrade their plan to access the app
 */

import { redirect } from 'next/navigation'
import { createServerClientReadOnly } from '@/app/lib/auth/supabase-server-readonly'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Crown, Zap, CheckCircle } from 'lucide-react'

export default async function JoinPage({
  searchParams
}: {
  searchParams: { next?: string }
}) {
  const supabase = createServerClientReadOnly()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/signin')
  }

  // Check current access status
  const { data: access } = await supabase
    .from('v_user_access')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // If user already has access, redirect to app
  if (access?.trial_active || access?.paid_active) {
    redirect(searchParams.next || '/briefly/app/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to Briefly Cloud
          </h1>
          <p className="text-xl text-gray-600">
            Choose a plan to start transforming your documents with AI
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Trial Plan */}
          <Card className="relative border-2 border-blue-200 shadow-lg">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle className="text-2xl">Free Trial</CardTitle>
              <CardDescription>
                Try Briefly Cloud free for 14 days
              </CardDescription>
              <div className="text-3xl font-bold text-blue-600">
                $0
                <span className="text-base font-normal text-gray-500">/14 days</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 mb-6">
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                  <span>25 documents</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                  <span>100 AI chat messages</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                  <span>Google Drive integration</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                  <span>Basic support</span>
                </li>
              </ul>
              <Button className="w-full" size="lg">
                Start Free Trial
              </Button>
            </CardContent>
          </Card>

          {/* Pro Plan */}
          <Card className="relative border-2 border-purple-200 shadow-lg">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-purple-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                Most Popular
              </span>
            </div>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                <Crown className="w-6 h-6 text-purple-600" />
              </div>
              <CardTitle className="text-2xl">Pro</CardTitle>
              <CardDescription>
                For power users and professionals
              </CardDescription>
              <div className="text-3xl font-bold text-purple-600">
                $30
                <span className="text-base font-normal text-gray-500">/month</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 mb-6">
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                  <span>1,000 documents</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                  <span>Unlimited AI chat</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                  <span>All cloud storage integrations</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                  <span>Priority support</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                  <span>Advanced AI features</span>
                </li>
              </ul>
              <Button className="w-full bg-purple-600 hover:bg-purple-700" size="lg">
                Upgrade to Pro
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-8">
          <p className="text-gray-600">
            Questions? <a href="mailto:support@briefly.cloud" className="text-blue-600 hover:underline">Contact our team</a>
          </p>
        </div>
      </div>
    </div>
  )
}