'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    // Wait for session to load
    if (status === 'loading') return;

    // Preserve any query parameters or hash fragments
    const currentUrl = new URL(window.location.href);
    const queryString = currentUrl.search;
    const hashFragment = currentUrl.hash;
    const urlSuffix = queryString + hashFragment;

    // Redirect to the app interface with preserved URL parts
    router.replace(`/briefly/app${urlSuffix}`);
  }, [router, status]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-300">Redirecting to Briefly Cloud...</p>
      </div>
    </div>
  );
}
