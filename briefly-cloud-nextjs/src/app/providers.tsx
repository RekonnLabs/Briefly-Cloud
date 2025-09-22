'use client'

import { SupabaseAuthProvider } from '@/app/components/auth/SupabaseAuthProvider'
import { Toaster } from 'sonner'

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<SupabaseAuthProvider>
			{children}
			<Toaster richColors position="top-right" closeButton />
		</SupabaseAuthProvider>
	)
}
