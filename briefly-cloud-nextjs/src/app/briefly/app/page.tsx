"use client";

import { useEffect } from 'react';
import { useAuth } from '@/app/components/auth/SupabaseAuthProvider';
import { useRouter } from 'next/navigation';

export default function AppPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // Wait for user to load

    if (!user) {
      // Preserve current URL as return destination
      const returnUrl = window.location.pathname + window.location.search;
      const encodedReturnUrl = encodeURIComponent(returnUrl);
      router.replace(`/auth/signin?next=${encodedReturnUrl}`);
      return;
    }

    // If user is authenticated, redirect to dashboard
    const queryString = window.location.search;
    router.replace(`/briefly/app/dashboard${queryString}`);
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">
          {loading ? 'Loading...' : !user ? 'Redirecting to sign in...' : 'Redirecting to dashboard...'}
        </p>
      </div>
    </div>
  );
}
