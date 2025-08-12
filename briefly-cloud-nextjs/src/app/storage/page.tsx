"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StoragePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard with storage tab active
    router.replace('/dashboard?tab=storage');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading cloud storage...</p>
      </div>
    </div>
  );
}