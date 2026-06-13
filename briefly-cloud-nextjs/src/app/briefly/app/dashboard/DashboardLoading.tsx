// @ts-nocheck — pending type cleanup
export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
        <p className="text-text-secondary">Loading your dashboard...</p>
      </div>
    </div>
  )
}
