/**
 * GDPR Consent Management Component
 * 
 * Handles user consent for various data processing activities
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface ConsentState {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
}

interface ConsentManagerProps {
  onConsentChange?: (consent: ConsentState) => void;
  showBanner?: boolean;
  position?: 'bottom' | 'top';
}

export default function ConsentManager({ 
  onConsentChange, 
  showBanner = true, 
  position = 'bottom' 
}: ConsentManagerProps) {
  const { data: session } = useSession();
  const [consent, setConsent] = useState<ConsentState>({
    essential: true, // Always true - required for basic functionality
    analytics: false,
    marketing: false,
    functional: false
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showBannerState, setShowBannerState] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserConsent();
  }, [session]);

  const loadUserConsent = async () => {
    if (!session?.user) {
      // For non-authenticated users, check localStorage
      const savedConsent = localStorage.getItem('consent-preferences');
      if (savedConsent) {
        const parsed = JSON.parse(savedConsent);
        setConsent(parsed);
        setShowBannerState(false);
      } else {
        setShowBannerState(showBanner);
      }
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/gdpr/consent');
      if (response.ok) {
        const data = await response.json();
        const currentConsent: ConsentState = {
          essential: true,
          analytics: data.analytics?.granted || false,
          marketing: data.marketing?.granted || false,
          functional: data.functional?.granted || false
        };
        setConsent(currentConsent);
        setShowBannerState(false);
      } else {
        setShowBannerState(showBanner);
      }
    } catch (error) {
      console.error('Error loading consent:', error);
      setShowBannerState(showBanner);
    } finally {
      setLoading(false);
    }
  };

  const saveConsent = async (newConsent: ConsentState) => {
    try {
      if (session?.user) {
        // Save to database for authenticated users
        const response = await fetch('/api/gdpr/consent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            consent: newConsent,
            metadata: {
              version: '1.0',
              ip_address: await getClientIP(),
              user_agent: navigator.userAgent
            }
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to save consent');
        }
      } else {
        // Save to localStorage for non-authenticated users
        localStorage.setItem('consent-preferences', JSON.stringify(newConsent));
      }

      setConsent(newConsent);
      setShowBannerState(false);
      setShowSettings(false);
      
      if (onConsentChange) {
        onConsentChange(newConsent);
      }

      // Apply consent settings
      applyConsentSettings(newConsent);

    } catch (error) {
      console.error('Error saving consent:', error);
      alert('Failed to save consent preferences. Please try again.');
    }
  };

  const applyConsentSettings = (consentState: ConsentState) => {
    // Analytics consent
    if (consentState.analytics) {
      // Enable analytics tracking
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('consent', 'update', {
          analytics_storage: 'granted'
        });
      }
    } else {
      // Disable analytics tracking
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('consent', 'update', {
          analytics_storage: 'denied'
        });
      }
    }

    // Marketing consent
    if (consentState.marketing) {
      // Enable marketing cookies
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('consent', 'update', {
          ad_storage: 'granted',
          ad_user_data: 'granted',
          ad_personalization: 'granted'
        });
      }
    } else {
      // Disable marketing cookies
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('consent', 'update', {
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied'
        });
      }
    }

    // Functional consent affects features like chat history, preferences, etc.
    if (!consentState.functional) {
      // Clear functional cookies/storage
      localStorage.removeItem('chat-preferences');
      localStorage.removeItem('ui-preferences');
    }
  };

  const acceptAll = () => {
    const allConsent: ConsentState = {
      essential: true,
      analytics: true,
      marketing: true,
      functional: true
    };
    saveConsent(allConsent);
  };

  const acceptEssentialOnly = () => {
    const essentialOnly: ConsentState = {
      essential: true,
      analytics: false,
      marketing: false,
      functional: false
    };
    saveConsent(essentialOnly);
  };

  const handleConsentChange = (type: keyof ConsentState, value: boolean) => {
    if (type === 'essential') return; // Essential consent cannot be changed
    
    setConsent(prev => ({
      ...prev,
      [type]: value
    }));
  };

  const getClientIP = async (): Promise<string | undefined> => {
    try {
      const response = await fetch('/api/client-ip');
      const data = await response.json();
      return data.ip;
    } catch {
      return undefined;
    }
  };

  if (loading) {
    return null;
  }

  return (
    <>
      {/* Consent Banner */}
      {showBannerState && (
        <div className={`fixed left-0 right-0 z-50 bg-gray-900 text-white p-4 shadow-lg ${
          position === 'top' ? 'top-0' : 'bottom-0'
        }`}>
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold mb-2">We value your privacy</h3>
                <p className="text-sm text-gray-300">
                  We use cookies and similar technologies to provide, protect, and improve our services. 
                  By clicking "Accept All", you consent to our use of cookies for analytics, marketing, 
                  and functional purposes. You can customize your preferences at any time.
                </p>
                <div className="mt-2">
                  <button
                    onClick={() => setShowSettings(true)}
                    className="text-blue-400 hover:text-blue-300 text-sm underline"
                  >
                    Learn more about our privacy practices
                  </button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => setShowSettings(true)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                >
                  Customize
                </button>
                <button
                  onClick={acceptEssentialOnly}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                >
                  Essential Only
                </button>
                <button
                  onClick={acceptAll}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Accept All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Consent Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Privacy Preferences</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-gray-600 mb-4">
                    We respect your privacy and give you control over how your data is used. 
                    You can enable or disable different types of cookies and data processing below.
                  </p>
                </div>

                {/* Essential Cookies */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">Essential Cookies</h3>
                    <div className="flex items-center">
                      <span className="text-sm text-gray-500 mr-2">Always Active</span>
                      <div className="w-12 h-6 bg-blue-600 rounded-full relative">
                        <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 right-0.5"></div>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    These cookies are necessary for the website to function and cannot be switched off. 
                    They include authentication, security, and basic functionality.
                  </p>
                </div>

                {/* Analytics Cookies */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">Analytics Cookies</h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consent.analytics}
                        onChange={(e) => handleConsentChange('analytics', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <p className="text-sm text-gray-600">
                    Help us understand how visitors interact with our website by collecting and reporting 
                    information anonymously. This helps us improve our services.
                  </p>
                </div>

                {/* Marketing Cookies */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">Marketing Cookies</h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consent.marketing}
                        onChange={(e) => handleConsentChange('marketing', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <p className="text-sm text-gray-600">
                    Used to track visitors across websites to display relevant advertisements and 
                    measure the effectiveness of marketing campaigns.
                  </p>
                </div>

                {/* Functional Cookies */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">Functional Cookies</h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consent.functional}
                        onChange={(e) => handleConsentChange('functional', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  <p className="text-sm text-gray-600">
                    Enable enhanced functionality like chat history, personalized settings, and 
                    improved user experience features.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveConsent(consent)}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Save Preferences
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Hook for using consent state in other components
export function useConsent() {
  const [consent, setConsent] = useState<ConsentState>({
    essential: true,
    analytics: false,
    marketing: false,
    functional: false
  });

  useEffect(() => {
    const savedConsent = localStorage.getItem('consent-preferences');
    if (savedConsent) {
      setConsent(JSON.parse(savedConsent));
    }
  }, []);

  return consent;
}