'use client'

import { SupabaseAuthProvider } from '@/app/components/auth/SupabaseAuthProvider'

export default function Providers({ children }: { children: React.ReactNode }) {
	return <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
}