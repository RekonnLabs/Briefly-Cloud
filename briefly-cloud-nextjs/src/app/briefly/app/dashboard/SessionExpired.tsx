// @ts-nocheck — pending type cleanup
export default function SessionExpired() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-6">
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-6">
          <div className="text-yellow-400 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">Session Expired</h2>
          <p className="text-text-secondary mb-4">Your session has expired. Please sign in again.</p>
          <a
            href="/auth/signin"
            className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg transition-colors"
          >
            Sign In Again
          </a>
        </div>
      </div>
    </div>
  )
}
