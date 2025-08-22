/**
 * Auth Loading Screen Component
 * 
 * Shows a loading screen during authentication state changes
 * to reduce screen flicker and improve user experience.
 */

'use client'

interface AuthLoadingScreenProps {
  message?: string
}

export function AuthLoadingScreen({ message = "Checking authentication..." }: AuthLoadingScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl p-8 lg:p-10">
          <div className="text-center space-y-4">
            <div className="mb-6">
              <img 
                src="/Briefly_Logo_120px.png" 
                alt="Briefly Logo" 
                className="w-20 h-20 mx-auto mb-4"
              />
            </div>
            
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            
            <p className="text-gray-300 text-sm">{message}</p>
          </div>
        </div>
      </div>
    </div>
  )
}