/**
 * Join/Paywall Page
 * 
 * Shown to users who need to upgrade their plan to access the app
 */

'use client'

import { useState } from 'react'
import { Crown, Zap, CheckCircle } from 'lucide-react'

export default function JoinPage() {
  const [busy, setBusy] = useState<null | 'trial' | 'pro' | 'byok'>(null)

  async function call(path: string) {
    const res = await fetch(path, { method: 'POST', credentials: 'include' })
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({}))).error || `HTTP ${res.status}`
      console.error('[join]', path, msg)
      setBusy(null)
      alert('Sorry, that failed. Try again.')
      return
    }
    // success → go to dashboard; server gates access anyway
    window.location.href = '/briefly/app/dashboard'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        {/* Header with Logo */}
        <div className="text-center mb-8">
          <div className="mb-6">
            <img 
              src="/Briefly_Logo_120px.png" 
              alt="Briefly Logo" 
              className="w-20 h-20 mx-auto mb-4"
            />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Welcome to Briefly Cloud
          </h1>
          <p className="text-xl text-gray-300">
            Choose a plan to start transforming your documents with AI
          </p>
        </div>

        <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-8">
          {/* Free Trial Plan */}
          <div className="relative bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl p-8">
            <div className="text-center mb-6">
              <div className="mx-auto w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mb-4">
                <Zap className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Free Trial</h2>
              <p className="text-gray-400 mb-4">
                Try Briefly Cloud free for 14 days
              </p>
              <div className="text-4xl font-bold text-blue-400">
                $0
                <span className="text-lg font-normal text-gray-500">/14 days</span>
              </div>
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">25 documents upload limit</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">100 AI chat messages</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">100MB storage</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">Google Drive integration</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">Basic AI chat support</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">Email support</span>
              </div>
            </div>
            
            <button 
              onClick={() => { setBusy('trial'); void call('/api/plan/start-trial') }}
              disabled={!!busy}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
            >
              {busy === 'trial' ? 'Starting trial…' : 'Start Free Trial'}
            </button>
          </div>

          {/* Pro Plan */}
          <div className="relative bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-purple-500/50 shadow-2xl p-8">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-purple-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                Most Popular
              </span>
            </div>
            
            <div className="text-center mb-6">
              <div className="mx-auto w-16 h-16 bg-purple-600/20 rounded-full flex items-center justify-center mb-4">
                <Crown className="w-8 h-8 text-purple-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Pro</h2>
              <p className="text-gray-400 mb-4">
                For power users and professionals
              </p>
              <div className="text-4xl font-bold text-purple-400">
                $30
                <span className="text-lg font-normal text-gray-500">/month</span>
              </div>
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">500 documents upload limit</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">400 AI chat messages</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">1GB storage</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">Google Drive & OneDrive</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">Advanced AI features</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">Priority support</span>
              </div>
            </div>
            
            <button 
              onClick={() => { setBusy('pro'); void call('/api/plan/upgrade') }}
              disabled={!!busy}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
            >
              {busy === 'pro' ? 'Upgrading…' : 'Upgrade to Pro'}
            </button>
          </div>

          {/* Pro BYOK Plan */}
          <div className="relative bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-yellow-500/50 shadow-2xl p-8">
            <div className="text-center mb-6">
              <div className="mx-auto w-16 h-16 bg-yellow-600/20 rounded-full flex items-center justify-center mb-4">
                <Crown className="w-8 h-8 text-yellow-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Pro BYOK</h2>
              <p className="text-gray-400 mb-4">
                Bring Your Own Key - Maximum control
              </p>
              <div className="text-4xl font-bold text-yellow-400">
                $15
                <span className="text-lg font-normal text-gray-500">/month</span>
              </div>
            </div>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">5,000 documents upload limit</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">2,000 AI chat messages</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">10GB storage</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">All cloud integrations</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">Use your own OpenAI API key</span>
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
                <span className="text-gray-300">Premium support</span>
              </div>
            </div>
            
            <button 
              onClick={() => { setBusy('byok'); void call('/api/plan/upgrade') }}
              disabled={!!busy}
              className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
            >
              {busy === 'byok' ? 'Upgrading…' : 'Choose Pro BYOK'}
            </button>
          </div>
        </div>

        <div className="text-center mt-12">
          <div className="bg-gray-900/60 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6 mb-6">
            <h3 className="text-lg font-semibold text-white mb-2">🔒 Secure & Private</h3>
            <p className="text-gray-400 text-sm">
              Your documents are encrypted and never used to train AI models. 
              Full GDPR compliance and enterprise-grade security.
            </p>
          </div>
          
          <p className="text-gray-400">
            Questions? <a href="mailto:support@briefly.cloud" className="text-blue-400 hover:text-blue-300 underline">Contact our team</a>
          </p>
          
          <div className="mt-4">
            <p className="text-xs text-gray-500">
              🚀 Powered by OpenAI GPT-4o • 🔍 ChromaDB Vector Search • ☁️ Supabase
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
