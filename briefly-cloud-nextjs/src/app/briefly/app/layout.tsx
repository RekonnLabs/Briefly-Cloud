// src/app/briefly/app/layout.tsx
import { ToastProvider } from '@/app/components/ui/toast'

export const dynamic = 'force-dynamic'

export default function BrieflyAppLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}
