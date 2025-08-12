'use client'

import { useRouter } from 'next/navigation'
import AuthForm from '@/app/components/auth/AuthForm'

export default function SignInPage() {

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl p-8 lg:p-10">
          <AuthForm />
        </div>
      </div>
    </div>
  )
}